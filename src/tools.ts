// D1-backed tools for the conversational ordering agent (P4).
// Every answer the agent gives is grounded here.

import { recommend, promoApplies, type MenuItem, type CartLine } from "./recs";
import { Telemetry, vnNow, getSettings } from "./telemetry";

export interface UiEffect {
  type: "add_to_cart" | "order_confirmed" | "handoff" | "voucher_applied";
  payload: unknown;
}

export function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
}

const VND = (n: number) => n.toLocaleString("vi-VN") + "₫";

function itemPublic(m: MenuItem) {
  return {
    id: m.id, name: m.name, name_en: m.name_en, category: m.category,
    description: m.description, price: m.price, price_display: VND(m.price),
    image_url: m.image_url, is_combo: !!m.is_combo,
    modifiers: m.modifiers ? JSON.parse(m.modifiers) : null,
    available: !!m.available,
  };
}

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "search_menu",
      description: "Search the KFC menu. Keyword-based, Vietnamese or English, diacritics optional (e.g. 'ga ran', 'burger', 'nuoc ngot').",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          category: { type: "string", enum: ["combo", "chicken", "burger-rice", "snack", "drink", "dessert"] },
          max_price: { type: "number", description: "VND upper bound" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_item",
      description: "Full detail for one menu item: description, price, size options, applicable promotions.",
      parameters: { type: "object", properties: { item_id: { type: "number" } }, required: ["item_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_upsell",
      description: "The contextual recommendation engine: given the current cart, returns the best upsell/cross-sell picks for this time of day with data-driven reasons. Call after a main item lands in the cart.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_active_promotions",
      description: "List promotions active RIGHT NOW (time-of-day and day-of-week aware).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_voucher",
      description: "Validate a voucher/promo code against the current cart and return the discount.",
      parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    },
  },
  {
    type: "function",
    function: {
      name: "check_loyalty",
      description: "Look up a KFC loyalty member by phone number: points balance and tier.",
      parameters: { type: "object", properties: { phone: { type: "string" } }, required: ["phone"] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description: "Add a menu item to the customer's cart. Confirm with the customer before calling.",
      parameters: {
        type: "object",
        properties: { item_id: { type: "number" }, quantity: { type: "number", default: 1 } },
        required: ["item_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "place_order",
      description: "Place the order for the items in the cart. Only call after an explicit customer confirmation. Applies the given promo code if valid, otherwise the best active one.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: { item_id: { type: "number" }, quantity: { type: "number" } },
              required: ["item_id", "quantity"],
            },
          },
          order_type: { type: "string", enum: ["dine-in", "takeaway"] },
          promo_code: { type: "string" },
          loyalty_phone: { type: "string" },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "handoff_to_human",
      description: "Escalate this conversation to a human staff member (complaints, allergies, refunds, anything out of scope). The customer will be connected to available CS/sales staff.",
      parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
    },
  },
] as const;

export interface PlaceOrderInput {
  sessionId: string;
  channel: "kiosk" | "chat";
  items: { item_id: number; quantity: number; modifiers?: string[] }[];
  order_type?: string;
  promo_code?: string | null;
  loyalty_phone?: string | null;
  rec_item_ids?: number[]; // items that came from accepted recommendations
}

export async function placeOrder(env: Env, input: PlaceOrderInput) {
  const { daypart, dow } = vnNow();
  if (!input.items?.length) return { error: "cart is empty" };
  const ids = input.items.map((i) => i.item_id);
  const marks = ids.map(() => "?").join(",");
  const rs = await env.DB.prepare(`SELECT * FROM menu_items WHERE id IN (${marks})`).bind(...ids).all<MenuItem>();
  const byId = new Map(rs.results.map((m) => [m.id, m]));

  let subtotal = 0;
  let recAttributed = 0;
  const recSet = new Set(input.rec_item_ids ?? []);
  const lineItems: unknown[] = [];
  for (const it of input.items) {
    const m = byId.get(it.item_id);
    if (!m || !m.available) continue;
    const line = m.price * it.quantity;
    subtotal += line;
    if (recSet.has(m.id)) recAttributed += line;
    lineItems.push({ id: m.id, name: m.name, price: m.price, quantity: it.quantity, modifiers: it.modifiers ?? [] });
  }
  if (!lineItems.length) return { error: "no valid items" };

  const promos = await env.DB.prepare("SELECT * FROM promotions WHERE active=1").all();
  let discount = 0;
  let promoCode: string | null = null;
  const applicable = (promos.results as never[]).filter((p) => promoApplies(p, daypart, dow, subtotal));
  const preferred = input.promo_code
    ? applicable.filter((p) => (p as { code: string }).code.toUpperCase() === input.promo_code!.toUpperCase())
    : applicable;
  for (const pr of preferred as { code: string; kind: string; value: number }[]) {
    const d = pr.kind === "percent" ? Math.floor((subtotal * pr.value) / 100)
      : pr.kind === "amount" ? pr.value : 0;
    if (d > discount) { discount = d; promoCode = pr.code; }
  }
  const total = subtotal - discount;

  const res = await env.DB.prepare(
    "INSERT INTO orders (session_id, channel, order_type, items, subtotal, discount, total, promo_code, loyalty_phone, rec_attributed, status) VALUES (?,?,?,?,?,?,?,?,?,?,'received')",
  ).bind(
    input.sessionId, input.channel, input.order_type ?? "dine-in", JSON.stringify(lineItems),
    subtotal, discount, total, promoCode, input.loyalty_phone ?? null, recAttributed,
  ).run();

  // loyalty accrual: 1 point per 1000 VND
  if (input.loyalty_phone) {
    await env.DB.prepare("UPDATE loyalty_members SET points = points + ? WHERE phone = ?")
      .bind(Math.floor(total / 1000), input.loyalty_phone).run();
  }

  // live inventory: decrement stock at this kiosk's store
  const settings = await getSettings(env);
  const storeId = Number(settings.current_store ?? 1);
  await env.DB.batch(input.items.map((it) =>
    env.DB.prepare("UPDATE store_inventory SET stock = MAX(0, stock - ?) WHERE store_id = ? AND item_id = ?")
      .bind(it.quantity, storeId, it.item_id)));

  const orderNumber = 100 + ((res.meta.last_row_id as number) % 900);
  return {
    ok: true,
    order: {
      order_id: res.meta.last_row_id, order_number: orderNumber, channel: input.channel,
      order_type: input.order_type ?? "dine-in", items: lineItems,
      subtotal, discount, total, promo_code: promoCode,
      subtotal_display: VND(subtotal), discount_display: VND(discount), total_display: VND(total),
      status: "received",
    },
  };
}

export async function executeTool(
  env: Env,
  tel: Telemetry,
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
  effects: UiEffect[],
  cart: CartLine[],
): Promise<unknown> {
  const t0 = Date.now();
  const done = (label: string, out: unknown) => {
    tel.emit("tool_result", "d1", "agent", label, undefined, Date.now() - t0);
    return out;
  };
  tel.emit("tool_call", "agent", "d1", `${name}(${JSON.stringify(args).slice(0, 120)})`, args);

  switch (name) {
    case "search_menu": {
      const q = fold(String(args.query ?? ""));
      const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);
      let sql = "SELECT * FROM menu_items WHERE available=1";
      const binds: unknown[] = [];
      for (const t of terms) { sql += " AND keywords LIKE ?"; binds.push(`%${t}%`); }
      if (args.category) { sql += " AND category = ?"; binds.push(args.category); }
      if (args.max_price) { sql += " AND price <= ?"; binds.push(args.max_price); }
      sql += " ORDER BY popularity DESC, price ASC LIMIT 8";
      const rs = await env.DB.prepare(sql).bind(...binds).all<MenuItem>();
      return done(`search_menu → ${rs.results.length} items`, { count: rs.results.length, items: rs.results.map(itemPublic) });
    }

    case "get_item": {
      const m = await env.DB.prepare("SELECT * FROM menu_items WHERE id = ?").bind(args.item_id).first<MenuItem>();
      if (!m) return done("get_item → not found", { error: "item not found" });
      const { daypart, dow } = vnNow();
      const promos = await env.DB.prepare(
        "SELECT * FROM promotions WHERE active=1 AND (scope_category IS NULL OR scope_category=? OR item_id=?)",
      ).bind(m.category, m.id).all();
      const applicable = (promos.results as never[]).filter((p) => promoApplies(p, daypart, dow));
      return done(`get_item → ${m.name}`, { item: itemPublic(m), applicable_promotions: applicable });
    }

    case "recommend_upsell": {
      const result = await recommend(env, tel, cart, "chat", sessionId);
      return done(`recommend_upsell → ${result.items.length} picks [${result.daypart}]`, {
        daypart: result.daypart,
        recommendations: result.items.map((r) => ({
          id: r.id, name: r.name, price_display: r.price_display,
          reason_vn: r.pitch_vn, reason_en: r.pitch_en, promo_code: r.promo_code, co_pct: r.co_pct,
        })),
      });
    }

    case "get_active_promotions": {
      const { daypart, dow } = vnNow();
      const rs = await env.DB.prepare("SELECT * FROM promotions WHERE active=1").all();
      const applicable = (rs.results as never[]).filter((p) => promoApplies(p, daypart, dow));
      return done(`get_active_promotions → ${applicable.length} now [${daypart}]`, { daypart, promotions: applicable });
    }

    case "apply_voucher": {
      const code = String(args.code ?? "").toUpperCase();
      const p = await env.DB.prepare("SELECT * FROM promotions WHERE UPPER(code)=? ").bind(code).first();
      if (!p) return done("apply_voucher → invalid", { valid: false, reason: "Mã không tồn tại / code not found" });
      const { daypart, dow } = vnNow();
      const cartIds = cart.map((c) => c.item_id);
      let subtotal = 0;
      if (cartIds.length) {
        const marks = cartIds.map(() => "?").join(",");
        const rs = await env.DB.prepare(`SELECT id, price FROM menu_items WHERE id IN (${marks})`).bind(...cartIds).all<{ id: number; price: number }>();
        subtotal = rs.results.reduce((s, m) => s + m.price * (cart.find((c) => c.item_id === m.id)?.qty ?? 1), 0);
      }
      const promo = p as { code: string; name: string; kind: string; value: number; min_order: number; active: number; daypart: string | null; days_of_week: string | null; item_id: number | null; scope_category: string | null };
      if (!promoApplies(promo as never, daypart, dow, subtotal)) {
        return done("apply_voucher → not applicable", {
          valid: false, promo: { code: promo.code, name: promo.name },
          reason: promo.min_order > subtotal
            ? `Cần đơn tối thiểu ${VND(promo.min_order)} (hiện ${VND(subtotal)})`
            : `Mã chỉ áp dụng khung giờ/ngày khác (daypart=${promo.daypart ?? "any"}, days=${promo.days_of_week ?? "all"})`,
        });
      }
      const discount = promo.kind === "percent" ? Math.floor((subtotal * promo.value) / 100) : promo.kind === "amount" ? promo.value : 0;
      effects.push({ type: "voucher_applied", payload: { code: promo.code, discount, discount_display: VND(discount) } });
      return done(`apply_voucher → -${VND(discount)}`, { valid: true, code: promo.code, name: promo.name, discount, discount_display: VND(discount), new_total_display: VND(Math.max(0, subtotal - discount)) });
    }

    case "check_loyalty": {
      const phone = String(args.phone ?? "").replace(/\s/g, "");
      const m = await env.DB.prepare("SELECT * FROM loyalty_members WHERE phone = ?").bind(phone).first();
      if (!m) return done("check_loyalty → not found", { found: false, message: "Số điện thoại chưa đăng ký thành viên / not a member yet" });
      return done(`check_loyalty → ${(m as { points: number }).points} pts`, { found: true, member: m, note: "1.000₫ = 1 điểm tích lũy" });
    }

    case "add_to_cart": {
      const m = await env.DB.prepare("SELECT * FROM menu_items WHERE id = ?").bind(args.item_id).first<MenuItem>();
      if (!m) return done("add_to_cart → not found", { error: "item not found" });
      if (!m.available) return done("add_to_cart → unavailable", { error: "item currently unavailable", item: itemPublic(m) });
      const qty = Number(args.quantity ?? 1);
      cart.push({ item_id: m.id, qty, name: m.name });
      effects.push({ type: "add_to_cart", payload: { item: itemPublic(m), quantity: qty } });
      return done(`add_to_cart → ${m.name} ×${qty}`, { ok: true, added: { item: itemPublic(m), quantity: qty } });
    }

    case "place_order": {
      const out = await placeOrder(env, {
        sessionId, channel: "chat",
        items: (args.items as { item_id: number; quantity: number }[]) ?? [],
        order_type: args.order_type as string | undefined,
        promo_code: args.promo_code as string | undefined,
        loyalty_phone: args.loyalty_phone as string | undefined,
      });
      if ((out as { ok?: boolean }).ok) {
        effects.push({ type: "order_confirmed", payload: (out as { order: unknown }).order });
      }
      return done("place_order", out);
    }

    case "handoff_to_human": {
      // route to the first available staff member (CS first, then sales)
      const staff = await env.DB.prepare(
        "SELECT * FROM staff WHERE available=1 ORDER BY CASE role WHEN 'cs' THEN 0 WHEN 'sales' THEN 1 ELSE 2 END, id LIMIT 1",
      ).first<{ id: number; name: string; role: string }>();
      await env.DB.prepare(
        "INSERT INTO handoffs (session_id, channel, reason, status, assigned_to) VALUES (?,?,?,?,?)",
      ).bind(sessionId, "kiosk", String(args.reason ?? ""), staff ? "active" : "pending", staff?.id ?? null).run();
      tel.emit("handoff", "agent", "staff", staff ? `routed to ${staff.name} (${staff.role})` : "queued — no staff available", { reason: args.reason });
      effects.push({ type: "handoff", payload: { reason: args.reason, staff: staff ?? null } });
      return done("handoff_to_human", {
        ok: true,
        message: staff
          ? `Đã kết nối với nhân viên ${staff.name}. Bạn chờ chút nhé! / Connected to ${staff.name}, they'll reply here shortly.`
          : "Đã ghi nhận, nhân viên sẽ phản hồi sớm nhất. / Request queued, staff will respond shortly.",
      });
    }

    default:
      return { error: `unknown tool ${name}` };
  }
}
