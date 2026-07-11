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

  // ---------- scenario director (demo staging) ----------
  if (path === "/scenario" && method === "POST") {
    const body = (await request.json()) as {
      scenario?: Record<string, unknown> | null;
      inventory_preset?: "zinger_out" | "dessert_over" | "reset";
      store_id?: number;
      promo_code?: string | null;  // scenario-bound promo (e.g. NOEL): on with the scene, off on clear
    };
    if (body.promo_code !== undefined) {
      const prev = (await getSettings(env)).scenario_promo as string | null | undefined;
      if (prev) await env.DB.prepare("UPDATE promotions SET active=0 WHERE code=?").bind(prev).run();
      if (body.promo_code) {
        await env.DB.prepare("UPDATE promotions SET active=1 WHERE code=?").bind(body.promo_code).run();
        tel.emit("config_change", "admin", "d1", `🎬 scenario promo on: ${body.promo_code}`);
      }
      await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('scenario_promo',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .bind(JSON.stringify(body.promo_code ?? null)).run();
    }
    if (body.scenario !== undefined) {
      await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('scenario',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .bind(JSON.stringify(body.scenario)).run();
      tel.emit("config_change", "admin", "worker",
        body.scenario ? `🎬 scenario: ${(body.scenario as { label?: string }).label ?? JSON.stringify(body.scenario)}` : "🎬 scenario cleared → real time",
        body.scenario);
    }
    if (body.inventory_preset) {
      const storeId = body.store_id ?? (body.scenario as { store_id?: number })?.store_id ?? 1;
      if (body.inventory_preset === "zinger_out") {
        await env.DB.prepare(
          "UPDATE store_inventory SET stock=0 WHERE store_id=? AND item_id IN (SELECT id FROM menu_items WHERE keywords LIKE '%burger%' AND keywords LIKE '%zinger%' AND is_combo=0)",
        ).bind(storeId).run();
      } else if (body.inventory_preset === "dessert_over") {
        await env.DB.prepare(
          "UPDATE store_inventory SET stock=par_level*3 WHERE store_id=? AND item_id IN (SELECT id FROM menu_items WHERE category='dessert')",
        ).bind(storeId).run();
      } else {
        await env.DB.prepare("UPDATE store_inventory SET stock=par_level WHERE store_id=?").bind(storeId).run();
      }
      tel.emit("config_change", "admin", "d1", `🎬 inventory preset: ${body.inventory_preset} @ store ${storeId}`);
    }
    return json({ ok: true, settings: await getSettings(env) });
  }

  // ---------- stores ----------
  if (path === "/stores" && method === "GET") {
    const [stores, settings] = await Promise.all([
      env.DB.prepare("SELECT * FROM stores ORDER BY id").all(),
      getSettings(env),
    ]);
    return json({ stores: stores.results, current_store: Number(settings.current_store ?? 1) });
  }

  const invMatch = path.match(/^\/inventory\/(\d+)\/(\d+)$/);
  if (invMatch && method === "PUT") {
    const body = (await request.json()) as { stock?: number; available?: boolean };
    if (body.stock !== undefined) {
      await env.DB.prepare("UPDATE store_inventory SET stock=? WHERE store_id=? AND item_id=?")
        .bind(Math.max(0, body.stock), invMatch[1], invMatch[2]).run();
    }
    if (body.available !== undefined) {
      await env.DB.prepare("UPDATE store_inventory SET available=? WHERE store_id=? AND item_id=?")
        .bind(body.available ? 1 : 0, invMatch[1], invMatch[2]).run();
    }
    tel.emit("config_change", "admin", "d1", `inventory store#${invMatch[1]} item#${invMatch[2]}: ${JSON.stringify(body)}`);
    return json({ ok: true });
  }

  // demand + stockout forecast from 90 days of POS history (Predictive Analytics)
  if (path === "/forecast" && method === "GET") {
    const settings = await getSettings(env);
    const storeId = Number(url.searchParams.get("store_id") ?? settings.current_store ?? 1);
    const [byDaypart, inv, pops, store] = await Promise.all([
      env.DB.prepare(
        "SELECT daypart, COUNT(*)/90.0 AS orders_per_day FROM pos_orders WHERE store_id=? GROUP BY daypart",
      ).bind(storeId).all<{ daypart: string; orders_per_day: number }>(),
      env.DB.prepare(
        `SELECT si.item_id, m.name, si.stock, si.par_level FROM store_inventory si
         JOIN menu_items m ON m.id = si.item_id WHERE si.store_id=? AND si.available=1`,
      ).bind(storeId).all<{ item_id: number; name: string; stock: number; par_level: number }>(),
      env.DB.prepare(
        `SELECT p.item_id, p.daypart, p.share FROM item_popularity p
         JOIN stores s ON s.cluster = p.cluster WHERE s.id = ?`,
      ).bind(storeId).all<{ item_id: number; daypart: string; share: number }>(),
      env.DB.prepare("SELECT * FROM stores WHERE id=?").bind(storeId).first(),
    ]);
    const dayVolume = new Map(byDaypart.results.map((r) => [r.daypart, r.orders_per_day]));
    // expected daily units of an item = Σ over dayparts (basket share × baskets/day)
    const dailyUse = new Map<number, number>();
    for (const p of pops.results) {
      dailyUse.set(p.item_id, (dailyUse.get(p.item_id) ?? 0) + p.share * (dayVolume.get(p.daypart) ?? 0));
    }
    const stockouts = inv.results
      .map((i) => ({ ...i, daily_use: +(dailyUse.get(i.item_id) ?? 0).toFixed(1) }))
      .filter((i) => i.daily_use > 0.3)
      .map((i) => ({ ...i, days_left: +(i.stock / i.daily_use).toFixed(1) }))
      .sort((a, b) => a.days_left - b.days_left)
      .slice(0, 6);
    const overstock = inv.results
      .filter((i) => i.stock > i.par_level * 1.5)
      .map((i) => ({ ...i, excess_pct: Math.round(((i.stock - i.par_level) / i.par_level) * 100) }))
      .sort((a, b) => b.excess_pct - a.excess_pct)
      .slice(0, 4);
    return json({
      store,
      demand_by_daypart: byDaypart.results.map((r) => ({ daypart: r.daypart, orders_per_day: +r.orders_per_day.toFixed(1) })),
      projected_stockouts: stockouts,
      overstock_to_push: overstock,
      note: "baseline = 90 ngày lịch sử POS của cụm cửa hàng này",
    });
  }

  // ---------- menu ----------
  if (path === "/menu" && method === "GET") {
    const settings = await getSettings(env);
    const storeId = Number(url.searchParams.get("store_id") ?? settings.current_store ?? 1);
    const rs = await env.DB.prepare(
      `SELECT m.*, si.stock, si.par_level, COALESCE(si.available,1) AS store_available
       FROM menu_items m LEFT JOIN store_inventory si ON si.item_id = m.id AND si.store_id = ?
       ORDER BY m.category, m.price`,
    ).bind(storeId).all();
    return json({ items: rs.results, store_id: storeId });
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
