// kfc-kiosk-agent: one Worker, four surfaces.
// /            -> desktop view (kiosk + live system diagram)
// /kiosk       -> standalone kiosk app
// /admin       -> admin control center
// /api/*       -> kiosk + agent + admin APIs (D1-grounded)

import { runAgent } from "./agent";
import { recommend, getStore, type CartLine } from "./recs";
import { placeOrder } from "./tools";
import { profileFromPhoto, refineProfile, getProfile } from "./profiler";
import { Telemetry, handleTelemetryGet, vnNow, getContext } from "./telemetry";
import { handleAdmin } from "./admin";

interface ChatBody {
  session_id: string;
  messages: { role: "user" | "assistant"; content: string }[];
  cart: CartLine[];
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);

      // telemetry poll is read-only and self-referential: never log it
      if (path === "/api/telemetry") return handleTelemetryGet(env, url);
      if (path === "/api/health") return json({ ok: true, service: "kfc-kiosk-agent", env: env.ENVIRONMENT, ...vnNow() });

      const isAdmin = path.startsWith("/api/admin/");
      const sessionId = request.headers.get("x-session-id");
      const tel = new Telemetry(sessionId, isAdmin ? "admin" : "kiosk");

      let resp: Response;
      if (isAdmin) {
        // admin GETs are dashboard polling — logging them would flood the stream
        if (request.method !== "GET") tel.emit("api_call", "admin", "worker", `${request.method} ${path}`);
        resp = (await handleAdmin(request, env, tel, url)) ?? json({ error: "not found" }, 404);
      } else {
        resp = await handlePublic(request, env, ctx, tel, url);
      }
      tel.flush(env, ctx);
      return resp;
    } catch (err) {
      console.log(JSON.stringify({ level: "error", path, err: String(err) }));
      return json({ error: "internal error", detail: String(err) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function handlePublic(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  tel: Telemetry,
  url: URL,
): Promise<Response> {
  const path = url.pathname;
  const method = request.method;

  // ---------- menu & promotions ----------
  if (path === "/api/menu" && method === "GET") {
    tel.emit("api_call", "kiosk", "worker", "GET /api/menu");
    const t0 = Date.now();
    const ctx = await getContext(env);
    const storeId = Number(url.searchParams.get("store_id") ?? ctx.storeId);
    const store = await getStore(env, storeId);
    // a store's kiosk only sells what that store actually has
    const rs = await env.DB.prepare(
      `SELECT m.*, COALESCE(si.stock, 99) AS stock FROM menu_items m
       LEFT JOIN store_inventory si ON si.item_id = m.id AND si.store_id = ?
       WHERE m.available = 1 AND COALESCE(si.available, 1) = 1 AND COALESCE(si.stock, 99) > 0
       ORDER BY m.category, m.price`,
    ).bind(storeId).all();
    tel.emit("d1_query", "worker", "d1", `menu @ ${store.name}: ${rs.results.length} items in stock${ctx.scenario ? " [scenario]" : ""}`, undefined, Date.now() - t0);
    return json({
      items: rs.results, store, festive: ctx.festive, holiday: ctx.holiday,
      daypart: ctx.daypart, dow: ctx.dow, scenario: ctx.scenario?.label ?? null,
    });
  }

  if (path === "/api/promotions" && method === "GET") {
    tel.emit("api_call", "kiosk", "worker", "GET /api/promotions");
    const { daypart, dow } = await getContext(env);
    const rs = await env.DB.prepare("SELECT * FROM promotions WHERE active=1").all();
    const promos = (rs.results as { daypart: string | null; days_of_week: string | null }[]).map((p) => ({
      ...p,
      applies_now: (!p.daypart || p.daypart === daypart) && (!p.days_of_week || p.days_of_week.split(",").map(Number).includes(dow)),
    }));
    return json({ daypart, promotions: promos });
  }

  // ---------- customer hypothesis (the profiling agent) ----------
  if (path === "/api/profile/photo" && method === "POST") {
    const body = (await request.json()) as { session_id: string; image: string; thumb?: string };
    if (!body?.session_id || !body?.image) return json({ error: "session_id and image required" }, 400);
    tel.emit("api_call", "kiosk", "profiler", "📷 camera check-in (demo upload)");
    const profile = await profileFromPhoto(env, tel, body.session_id, body.image, body.thumb ?? null);
    return json({ ok: true, profile });
  }

  if (path === "/api/profile/event" && method === "POST") {
    const body = (await request.json()) as { session_id: string; observation: string };
    if (!body?.session_id || !body?.observation) return json({ error: "session_id and observation required" }, 400);
    tel.emit("api_call", "kiosk", "profiler", `behavior signal: ${body.observation.slice(0, 60)}`);
    const profile = await refineProfile(env, tel, body.session_id, body.observation.slice(0, 200));
    return json({ ok: true, profile });
  }

  if (path === "/api/profile" && method === "GET") {
    const profile = await getProfile(env, url.searchParams.get("session_id") ?? "");
    return json({ profile });
  }

  // ---------- recommendations (P2 kiosk moments + admin simulator) ----------
  if (path === "/api/recommend" && method === "POST") {
    const body = (await request.json()) as {
      session_id: string; cart: CartLine[]; trigger?: string;
      store_id?: number; daypart?: string;
    };
    const sim = body.trigger === "simulator";
    const probe = body.trigger === "ops_panel";   // hypothesis-panel "what would the AI suggest right now"
    tel.emit("api_call", sim || probe ? "admin" : "kiosk", "worker", `POST /api/recommend (${body.trigger ?? "cart"}, ${body.cart?.length ?? 0} lines)`);
    tel.emit("rec_request", probe ? "profiler" : "worker", "rec", probe ? "ops probe: what would the AI suggest this customer right now?" : `trigger: ${body.trigger ?? "cart_review"}${sim ? ` [what-if: store ${body.store_id}, ${body.daypart}]` : ""}`);
    const t0 = Date.now();
    const result = await recommend(env, tel, body.cart ?? [], body.trigger ?? "cart_review", body.session_id ?? "anon", {
      store_id: body.store_id, daypart: body.daypart as never,
    });
    tel.emit("rec_response", "rec", sim || probe ? "admin" : "kiosk", `${result.items.length} picks in ${Date.now() - t0}ms (${result.store.cluster}/${result.daypart})${probe ? ` [${result.items.map((i) => i.strategy).join(", ")}]` : ""}`, undefined, Date.now() - t0);
    return json(result);
  }

  if (path === "/api/rec-feedback" && method === "POST") {
    const body = (await request.json()) as { session_id: string; accepted_item_id?: number; dismissed?: boolean };
    if (body.accepted_item_id) {
      await env.DB.prepare(
        "UPDATE rec_events SET accepted_item_id=? WHERE id = (SELECT MAX(id) FROM rec_events WHERE session_id=?)",
      ).bind(body.accepted_item_id, body.session_id).run();
      tel.emit("rec_accepted", "kiosk", "rec", `customer accepted item #${body.accepted_item_id}`);
    } else {
      tel.emit("rec_dismissed", "kiosk", "rec", "customer dismissed recommendations");
    }
    return json({ ok: true });
  }

  // ---------- orders ----------
  if (path === "/api/order" && method === "POST") {
    const body = (await request.json()) as {
      session_id: string; items: { item_id: number; quantity: number; modifiers?: string[] }[];
      order_type?: string; promo_code?: string; loyalty_phone?: string; rec_item_ids?: number[];
    };
    tel.emit("api_call", "kiosk", "worker", `POST /api/order (${body.items?.length ?? 0} lines)`);
    const t0 = Date.now();
    const out = await placeOrder(env, {
      sessionId: body.session_id ?? "anon", channel: "kiosk",
      items: body.items ?? [], order_type: body.order_type,
      promo_code: body.promo_code, loyalty_phone: body.loyalty_phone,
      rec_item_ids: body.rec_item_ids,
    });
    const order = (out as { order?: { order_id?: number; total_display?: string } }).order;
    tel.emit("d1_query", "worker", "d1", order ? `order #${order.order_id} saved — ${order.total_display}` : "order failed", undefined, Date.now() - t0);
    if (order) tel.emit("order_placed", "worker", "kiosk", `order #${order.order_id} confirmed (${order.total_display})`);
    return json(out, (out as { error?: string }).error ? 400 : 200);
  }

  const orderStatusMatch = path.match(/^\/api\/order\/(\d+)$/);
  if (orderStatusMatch && method === "GET") {
    const o = await env.DB.prepare("SELECT id, status, total, created_at FROM orders WHERE id=?").bind(orderStatusMatch[1]).first();
    return o ? json(o) : json({ error: "not found" }, 404);
  }

  // ---------- loyalty ----------
  if (path === "/api/loyalty" && method === "GET") {
    const phone = url.searchParams.get("phone") ?? "";
    tel.emit("api_call", "kiosk", "worker", `GET /api/loyalty (${phone.slice(0, 4)}***)`);
    const m = await env.DB.prepare("SELECT phone, name, points, tier FROM loyalty_members WHERE phone=?").bind(phone).first();
    return json(m ? { found: true, member: m } : { found: false });
  }

  // ---------- conversational agent (P4) + human-in-the-loop ----------
  if (path === "/api/chat" && method === "POST") {
    const body = (await request.json()) as ChatBody;
    if (!body?.session_id || !Array.isArray(body?.messages)) return json({ error: "session_id and messages required" }, 400);

    // If this session is in a live handoff, relay to staff instead of the agent.
    const handoff = await env.DB.prepare(
      "SELECT id, status FROM handoffs WHERE session_id=? AND status IN ('pending','active') ORDER BY id DESC LIMIT 1",
    ).bind(body.session_id).first<{ id: number; status: string }>();
    const userMsg = body.messages[body.messages.length - 1]?.content ?? "";
    if (handoff) {
      await env.DB.prepare("INSERT INTO chat_messages (session_id, role, content) VALUES (?,?,?)")
        .bind(body.session_id, "user", userMsg).run();
      tel.emit("chat_relay", "kiosk", "staff", `→ staff queue: "${userMsg.slice(0, 60)}"`);
      return json({ reply: null, handoff: true, handoff_status: handoff.status, effects: [], items: [] });
    }

    const result = await runAgent(env, ctx, tel, body.session_id, body.messages.slice(-12), body.cart ?? []);
    return json(result);
  }

  if (path === "/api/chat/poll" && method === "GET") {
    const sessionId = url.searchParams.get("session_id") ?? "";
    const after = Number(url.searchParams.get("after") ?? 0);
    const [msgs, handoff] = await Promise.all([
      env.DB.prepare("SELECT id, role, content, created_at FROM chat_messages WHERE session_id=? AND id > ? ORDER BY id ASC LIMIT 20")
        .bind(sessionId, after).all(),
      env.DB.prepare("SELECT id, status FROM handoffs WHERE session_id=? ORDER BY id DESC LIMIT 1").bind(sessionId).first(),
    ]);
    return json({ messages: msgs.results, handoff });
  }

  return json({ error: "not found" }, 404);
}
