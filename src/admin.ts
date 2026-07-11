// Admin control center API: setup for non-technical staff, production tracking,
// metrics, and the human-in-the-loop handoff queue.

import { Telemetry, getSettings } from "./telemetry";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export async function handleAdmin(
  request: Request,
  env: Env,
  tel: Telemetry,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname.replace(/^\/api\/admin/, "");
  const method = request.method;

  // ---------- settings ----------
  if (path === "/settings" && method === "GET") {
    return json(await getSettings(env));
  }
  if (path === "/settings" && method === "PUT") {
    const body = (await request.json()) as Record<string, unknown>;
    const stmts = Object.entries(body).map(([k, v]) =>
      env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .bind(k, JSON.stringify(v)));
    await env.DB.batch(stmts);
    tel.emit("config_change", "admin", "worker", `settings updated: ${Object.keys(body).join(", ")}`, body);
    return json({ ok: true, settings: await getSettings(env) });
  }

  // ---------- menu ----------
  if (path === "/menu" && method === "GET") {
    const rs = await env.DB.prepare("SELECT * FROM menu_items ORDER BY category, price").all();
    return json({ items: rs.results });
  }
  const menuMatch = path.match(/^\/menu\/(\d+)$/);
  if (menuMatch && method === "PUT") {
    const body = (await request.json()) as { available?: boolean; price?: number };
    if (body.available !== undefined) {
      await env.DB.prepare("UPDATE menu_items SET available=? WHERE id=?").bind(body.available ? 1 : 0, menuMatch[1]).run();
    }
    if (body.price !== undefined) {
      await env.DB.prepare("UPDATE menu_items SET price=? WHERE id=?").bind(body.price, menuMatch[1]).run();
    }
    const item = await env.DB.prepare("SELECT id,name,available,price FROM menu_items WHERE id=?").bind(menuMatch[1]).first();
    tel.emit("config_change", "admin", "d1", `menu #${menuMatch[1]}: ${JSON.stringify(body)}`, item);
    return json({ ok: true, item });
  }

  // ---------- promotions ----------
  if (path === "/promos" && method === "GET") {
    const rs = await env.DB.prepare("SELECT * FROM promotions ORDER BY id").all();
    return json({ promotions: rs.results });
  }
  const promoMatch = path.match(/^\/promo\/(\d+)$/);
  if (promoMatch && method === "PUT") {
    const body = (await request.json()) as { active?: boolean };
    await env.DB.prepare("UPDATE promotions SET active=? WHERE id=?").bind(body.active ? 1 : 0, promoMatch[1]).run();
    const promo = await env.DB.prepare("SELECT code,name,active FROM promotions WHERE id=?").bind(promoMatch[1]).first();
    tel.emit("config_change", "admin", "d1", `promo ${(promo as { code?: string })?.code}: active=${body.active}`, promo);
    return json({ ok: true, promo });
  }

  // ---------- affinities ----------
  if (path === "/affinities" && method === "GET") {
    const rs = await env.DB.prepare("SELECT * FROM affinities ORDER BY anchor_category").all();
    return json({ affinities: rs.results });
  }
  const affMatch = path.match(/^\/affinity\/(\d+)$/);
  if (affMatch && method === "PUT") {
    const body = (await request.json()) as { weight?: number };
    await env.DB.prepare("UPDATE affinities SET weight=? WHERE id=?").bind(body.weight ?? 1, affMatch[1]).run();
    tel.emit("config_change", "admin", "d1", `affinity #${affMatch[1]} weight=${body.weight}`);
    return json({ ok: true });
  }

  // ---------- production tracking (orders board) ----------
  if (path === "/orders" && method === "GET") {
    const rs = await env.DB.prepare(
      "SELECT id, session_id, channel, order_type, items, subtotal, discount, total, promo_code, rec_attributed, status, created_at FROM orders ORDER BY id DESC LIMIT 60",
    ).all();
    return json({ orders: rs.results });
  }
  const orderMatch = path.match(/^\/order\/(\d+)$/);
  if (orderMatch && method === "PUT") {
    const body = (await request.json()) as { status: string };
    if (!["received", "preparing", "ready", "completed"].includes(body.status)) return json({ error: "bad status" }, 400);
    await env.DB.prepare("UPDATE orders SET status=? WHERE id=?").bind(body.status, orderMatch[1]).run();
    tel.emit("order_status", "admin", "worker", `order #${orderMatch[1]} → ${body.status}`);
    return json({ ok: true });
  }

  // ---------- human-in-the-loop handoffs ----------
  if (path === "/handoffs" && method === "GET") {
    const rs = await env.DB.prepare(
      `SELECT h.*, s.name AS staff_name, s.role AS staff_role FROM handoffs h
       LEFT JOIN staff s ON s.id = h.assigned_to
       ORDER BY CASE h.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, h.id DESC LIMIT 30`,
    ).all();
    return json({ handoffs: rs.results });
  }
  const hmsgMatch = path.match(/^\/handoff\/(\d+)\/messages$/);
  if (hmsgMatch && method === "GET") {
    const h = await env.DB.prepare("SELECT * FROM handoffs WHERE id=?").bind(hmsgMatch[1]).first<{ session_id: string }>();
    if (!h) return json({ error: "not found" }, 404);
    const rs = await env.DB.prepare(
      "SELECT id, role, content, created_at FROM chat_messages WHERE session_id=? ORDER BY id ASC LIMIT 100",
    ).bind(h.session_id).all();
    return json({ session_id: h.session_id, messages: rs.results });
  }
  const hreplyMatch = path.match(/^\/handoff\/(\d+)\/reply$/);
  if (hreplyMatch && method === "POST") {
    const body = (await request.json()) as { content: string };
    const h = await env.DB.prepare("SELECT * FROM handoffs WHERE id=?").bind(hreplyMatch[1]).first<{ id: number; session_id: string; assigned_to: number | null; status: string }>();
    if (!h) return json({ error: "not found" }, 404);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO chat_messages (session_id, role, content) VALUES (?,?,?)").bind(h.session_id, "staff", body.content),
      env.DB.prepare("UPDATE handoffs SET status='active' WHERE id=? AND status='pending'").bind(h.id),
    ]);
    tel.emit("staff_reply", "staff", "kiosk", `staff → session ${h.session_id.slice(0, 8)}: "${body.content.slice(0, 60)}"`);
    return json({ ok: true });
  }
  const hMatch = path.match(/^\/handoff\/(\d+)$/);
  if (hMatch && method === "PUT") {
    const body = (await request.json()) as { status: string };
    await env.DB.prepare("UPDATE handoffs SET status=?, resolved_at=CASE WHEN ?='resolved' THEN datetime('now') ELSE resolved_at END WHERE id=?")
      .bind(body.status, body.status, hMatch[1]).run();
    tel.emit("handoff_status", "staff", "worker", `handoff #${hMatch[1]} → ${body.status}`);
    return json({ ok: true });
  }

  // ---------- staff ----------
  if (path === "/staff" && method === "GET") {
    const rs = await env.DB.prepare("SELECT * FROM staff ORDER BY id").all();
    return json({ staff: rs.results });
  }
  const staffMatch = path.match(/^\/staff\/(\d+)$/);
  if (staffMatch && method === "PUT") {
    const body = (await request.json()) as { available?: boolean };
    await env.DB.prepare("UPDATE staff SET available=? WHERE id=?").bind(body.available ? 1 : 0, staffMatch[1]).run();
    tel.emit("config_change", "admin", "worker", `staff #${staffMatch[1]} available=${body.available}`);
    return json({ ok: true });
  }

  // ---------- metrics ----------
  if (path === "/metrics" && method === "GET") {
    const [orders, recOrders, recEvents, accepted, chats, handoffs, channels, topAccepted] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) n, COALESCE(SUM(total),0) rev, COALESCE(AVG(total),0) aov FROM orders").first<{ n: number; rev: number; aov: number }>(),
      env.DB.prepare("SELECT COALESCE(AVG(total),0) aov_rec, COALESCE(SUM(rec_attributed),0) rec_rev FROM orders WHERE rec_attributed > 0").first<{ aov_rec: number; rec_rev: number }>(),
      env.DB.prepare("SELECT COUNT(*) n FROM rec_events").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) n FROM rec_events WHERE accepted_item_id IS NOT NULL").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) n FROM events WHERE type='chat_turn'").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) n FROM handoffs").first<{ n: number }>(),
      env.DB.prepare("SELECT channel, COUNT(*) n, COALESCE(SUM(total),0) rev FROM orders GROUP BY channel").all(),
      env.DB.prepare(
        `SELECT m.name, COUNT(*) n FROM rec_events r JOIN menu_items m ON m.id = r.accepted_item_id
         WHERE r.accepted_item_id IS NOT NULL GROUP BY m.name ORDER BY n DESC LIMIT 5`,
      ).all(),
    ]);
    const aovBase = await env.DB.prepare("SELECT COALESCE(AVG(total),0) aov FROM orders WHERE rec_attributed = 0").first<{ aov: number }>();
    return json({
      orders: orders?.n ?? 0,
      revenue_vnd: orders?.rev ?? 0,
      aov_vnd: Math.round(orders?.aov ?? 0),
      aov_with_rec_vnd: Math.round(recOrders?.aov_rec ?? 0),
      aov_without_rec_vnd: Math.round(aovBase?.aov ?? 0),
      rec_attributed_revenue_vnd: recOrders?.rec_rev ?? 0,
      rec_impressions: recEvents?.n ?? 0,
      rec_accepted: accepted?.n ?? 0,
      rec_acceptance_pct: recEvents?.n ? Math.round(((accepted?.n ?? 0) / recEvents.n) * 100) : 0,
      chat_turns: chats?.n ?? 0,
      handoffs: handoffs?.n ?? 0,
      by_channel: channels.results,
      top_accepted_recs: topAccepted.results,
    });
  }

  return null;
}
