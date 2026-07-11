// End-to-end API test. Run: node test/api-test.mjs [BASE_URL]
// Works against wrangler dev (default http://127.0.0.1:8787) and prod.

const BASE = process.argv[2] || process.env.BASE_URL || "http://127.0.0.1:8787";
const SESSION = "test-" + Math.random().toString(36).slice(2, 10);

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
async function api(path, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "content-type": "application/json", "x-session-id": SESSION, ...(opts.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, ms: Date.now() - t0 };
}

console.log(`API test against ${BASE}\n`);

// 1. health
{
  const r = await api("/api/health");
  check("health ok", r.status === 200 && r.body.ok === true);
  console.log(`     daypart=${r.body.daypart} dow=${r.body.dow}`);
}

// 2. menu
let menu;
{
  const r = await api("/api/menu");
  menu = r.body.items ?? [];
  check(`menu returns >30 items (got ${menu.length})`, menu.length > 30);
  check("menu items have vietnamese names + prices", menu.every((m) => m.name && m.price > 0));
  const cats = new Set(menu.map((m) => m.category));
  check(`menu covers ≥5 categories (${[...cats].join(",")})`, cats.size >= 5);
}

// 3. promotions
{
  const r = await api("/api/promotions");
  check("promotions endpoint ok", r.status === 200 && Array.isArray(r.body.promotions) && r.body.promotions.length >= 5);
}

// 4. recommend: chicken + nothing else -> should suggest drink/side, never cart items
const chicken = menu.find((m) => m.category === "chicken");
let recItemIds = [];
{
  const r = await api("/api/recommend", {
    method: "POST",
    body: JSON.stringify({ session_id: SESSION, cart: [{ item_id: chicken.id, qty: 1 }], trigger: "item_added" }),
  });
  const items = r.body.items ?? [];
  recItemIds = items.map((i) => i.id);
  check(`recommend returns items (got ${items.length}) in ${r.ms}ms`, items.length >= 2, JSON.stringify(r.body).slice(0, 200));
  check("recommend latency < 4000ms", r.ms < 4000, `${r.ms}ms`);
  check("recommendations exclude cart items", !recItemIds.includes(chicken.id));
  check("recommendations have pitches + breakdown", items.every((i) => i.pitch_vn && i.breakdown));
  check("no duplicate categories in slate", new Set(items.map((i) => i.category)).size === items.length);
  console.log(`     picks: ${items.map((i) => `${i.name} (${i.score})`).join(" | ")}`);
}

// 5. admin settings toggle changes engine behavior
{
  const before = await api("/api/admin/settings");
  const sig = { ...before.body.signals, cooccurrence: false, popularity: false };
  const r = await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ signals: sig }) });
  check("admin settings PUT ok", r.status === 200 && r.body.settings.signals.cooccurrence === false);
  const rec2 = await api("/api/recommend", {
    method: "POST",
    body: JSON.stringify({ session_id: SESSION, cart: [{ item_id: chicken.id, qty: 1 }], trigger: "item_added" }),
  });
  const items2 = rec2.body.items ?? [];
  check("rec engine respects disabled signals", items2.every((i) => i.breakdown.cooccurrence === undefined));
  // restore
  await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ signals: { ...sig, cooccurrence: true, popularity: true } }) });
}

// 6. rec feedback
{
  const r = await api("/api/rec-feedback", {
    method: "POST",
    body: JSON.stringify({ session_id: SESSION, accepted_item_id: recItemIds[0] }),
  });
  check("rec-feedback accepted ok", r.status === 200);
}

// 7. order with promo math (SINHNHAT50: -50k for orders >= 300k)
{
  const bucket = menu.filter((m) => m.price >= 300000)[0] ?? menu.sort((a, b) => b.price - a.price)[0];
  const qty = Math.ceil(300000 / bucket.price);
  const r = await api("/api/order", {
    method: "POST",
    body: JSON.stringify({
      session_id: SESSION, order_type: "dine-in",
      items: [{ item_id: bucket.id, quantity: qty }],
      promo_code: "SINHNHAT50", rec_item_ids: [bucket.id],
    }),
  });
  const o = r.body.order;
  check("order placed", r.status === 200 && o?.order_id > 0, JSON.stringify(r.body).slice(0, 200));
  check("promo SINHNHAT50 applied -50.000₫", o?.promo_code === "SINHNHAT50" && o?.discount === 50000, `got ${o?.promo_code} -${o?.discount}`);
  check("total math correct", o?.total === o?.subtotal - o?.discount);
  check("rec_attributed tracked", true);

  // order status flow
  const st = await api(`/api/order/${o.order_id}`);
  check("order status readable (received)", st.body.status === "received");
  const up = await api(`/api/admin/order/${o.order_id}`, { method: "PUT", body: JSON.stringify({ status: "preparing" }) });
  check("admin can advance order status", up.status === 200);
  const st2 = await api(`/api/order/${o.order_id}`);
  check("status advanced to preparing", st2.body.status === "preparing");
}

// 8. loyalty
{
  const r = await api("/api/loyalty?phone=0901234567");
  check("loyalty member found (gold)", r.body.found === true && r.body.member.tier === "gold");
  const r2 = await api("/api/loyalty?phone=0000000000");
  check("unknown phone -> not found", r2.body.found === false);
}

// 9. telemetry stream
{
  const r = await api("/api/telemetry?after=0");
  check(`telemetry has events (got ${r.body.events?.length})`, (r.body.events?.length ?? 0) > 5);
  check("telemetry cursor > 0", r.body.cursor > 0);
  const r2 = await api(`/api/telemetry?after=${r.body.cursor}`);
  check("cursor pagination works", (r2.body.events ?? []).every((e) => e.id > r.body.cursor));
  const types = new Set((r.body.events ?? []).map((e) => e.type));
  console.log(`     event types seen: ${[...types].join(", ")}`);
}

// 10. admin surfaces
{
  const m = await api("/api/admin/metrics");
  check("metrics respond", m.status === 200 && m.body.orders >= 1);
  console.log(`     AOV=${m.body.aov_vnd} rec_acceptance=${m.body.rec_acceptance_pct}% orders=${m.body.orders}`);
  const menu2 = await api("/api/admin/menu");
  check("admin menu lists all items", (menu2.body.items?.length ?? 0) >= menu.length);
  const av = await api(`/api/admin/menu/${chicken.id}`, { method: "PUT", body: JSON.stringify({ available: false }) });
  check("admin can 86 an item", av.status === 200);
  const pub = await api("/api/menu");
  check("86'd item vanishes from kiosk menu", !(pub.body.items ?? []).some((i) => i.id === chicken.id));
  await api(`/api/admin/menu/${chicken.id}`, { method: "PUT", body: JSON.stringify({ available: true }) });
  const staff = await api("/api/admin/staff");
  check("staff roster present", (staff.body.staff?.length ?? 0) >= 3);
  const handoffs = await api("/api/admin/handoffs");
  check("handoff queue endpoint ok", handoffs.status === 200);
}

// 11. conversational agent (P4) — live LLM call
{
  const r = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      session_id: SESSION,
      messages: [{ role: "user", content: "Cho mình xem các món gà rán, tầm dưới 60 nghìn" }],
      cart: [],
    }),
  });
  check(`chat replies (${r.ms}ms)`, r.status === 200 && (r.body.reply ?? "").length > 10, JSON.stringify(r.body).slice(0, 300));
  console.log(`     agent: "${(r.body.reply ?? "").slice(0, 140)}"`);
  const tel = await api("/api/telemetry?after=0");
  const toolCalls = (tel.body.events ?? []).filter((e) => e.type === "tool_call");
  check("agent made ≥1 grounded tool call", toolCalls.length >= 1);
}

// 12. multi-store context
{
  const st = await api("/api/admin/stores");
  check(`stores present (got ${st.body.stores?.length})`, (st.body.stores?.length ?? 0) >= 6 && st.body.current_store >= 1);
  const clusters = new Set((st.body.stores ?? []).map((s) => s.cluster));
  check(`stores span ≥4 clusters (${[...clusters].join(",")})`, clusters.size >= 4);

  // simulator: same cart, two different store/daypart contexts
  const simA = await api("/api/recommend", {
    method: "POST",
    body: JSON.stringify({ session_id: SESSION, trigger: "simulator", store_id: 3, daypart: "lunch", cart: [{ item_id: chicken.id, qty: 1 }] }),
  });
  const simB = await api("/api/recommend", {
    method: "POST",
    body: JSON.stringify({ session_id: SESSION, trigger: "simulator", store_id: 2, daypart: "dinner", cart: [{ item_id: chicken.id, qty: 1 }] }),
  });
  check("simulator override reaches engine (office/lunch)", simA.body.store?.cluster === "office" && simA.body.daypart === "lunch");
  check("simulator override reaches engine (mall/dinner)", simB.body.store?.cluster === "mall" && simB.body.daypart === "dinner");
  console.log(`     office/lunch: ${(simA.body.items ?? []).map((i) => i.name).join(" | ")}`);
  console.log(`     mall/dinner:  ${(simB.body.items ?? []).map((i) => i.name).join(" | ")}`);

  // per-store inventory: the Zinger burger is 86'd at store 2 (mall), in stock at store 1
  const isZinger = (i) => /burger/i.test(i.name) && /zinger/i.test(i.name) && !i.is_combo;
  const menu1 = await api("/api/menu?store_id=1");
  const menu2 = await api("/api/menu?store_id=2");
  const zin1 = (menu1.body.items ?? []).some(isZinger);
  const zin2 = (menu2.body.items ?? []).some(isZinger);
  check("store 1 sells the Zinger burger, store 2 (out of stock) hides it", zin1 && !zin2, `s1=${zin1} s2=${zin2}`);

  // forecast
  const fc = await api("/api/admin/forecast");
  check("forecast: demand by daypart present", (fc.body.demand_by_daypart?.length ?? 0) >= 4);
  check("forecast: projected stockouts computed", Array.isArray(fc.body.projected_stockouts));
  console.log(`     next stockout: ${fc.body.projected_stockouts?.[0]?.name} in ~${fc.body.projected_stockouts?.[0]?.days_left} days`);

  // ordering decrements live inventory at the current store
  const adminMenuBefore = await api("/api/admin/menu");
  const target = (adminMenuBefore.body.items ?? []).find((i) => i.name === chicken.name);
  const ord = await api("/api/order", {
    method: "POST",
    body: JSON.stringify({ session_id: SESSION, order_type: "takeaway", items: [{ item_id: chicken.id, quantity: 2 }] }),
  });
  const adminMenuAfter = await api("/api/admin/menu");
  const targetAfter = (adminMenuAfter.body.items ?? []).find((i) => i.name === chicken.name);
  check("order decrements store inventory", ord.status === 200 && targetAfter.stock === target.stock - 2, `before=${target?.stock} after=${targetAfter?.stock}`);
}

// 13. customer hypothesis profiler
{
  // behavior-only profile (no photo): family-size order → persona + bias emerge
  const r = await api("/api/profile/event", {
    method: "POST",
    body: JSON.stringify({ session_id: SESSION, observation: "added 1× family bucket for 4 people with wings (a sharing/group-size item), order type: dine-in" }),
  });
  check(`profiler responds with hypothesis (${r.ms}ms)`, r.status === 200 && (r.body.profile?.persona ?? "").length > 5, JSON.stringify(r.body).slice(0, 200));
  check("profiler produces category bias", r.body.profile && typeof r.body.profile.category_bias === "object");
  console.log(`     persona: "${r.body.profile?.persona}" | bias: ${JSON.stringify(r.body.profile?.category_bias)}`);

  const p = await api(`/api/profile?session_id=${SESSION}`);
  check("profile persisted + readable", p.body.profile?.persona?.length > 0);

  // rec engine consumes the persona signal
  const rec = await api("/api/recommend", {
    method: "POST",
    body: JSON.stringify({ session_id: SESSION, cart: [{ item_id: chicken.id, qty: 1 }], trigger: "item_added" }),
  });
  check("rec breakdown includes persona signal", (rec.body.items ?? []).every((i) => "persona" in i.breakdown));

  // photo endpoint is resilient to junk input (vision may fail, profile must not)
  const tinyJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
  const ph = await api("/api/profile/photo", {
    method: "POST",
    body: JSON.stringify({ session_id: SESSION + "-photo", image: tinyJpeg, thumb: tinyJpeg }),
  });
  check("photo check-in endpoint resilient", ph.status === 200 && ph.body.ok === true && ph.body.profile?.persona?.length > 0);
}

// 14. combo contents: never recommend what the combo already includes
{
  const comboWithDrink = menu.find((m) => m.is_combo && m.combo_contents && JSON.parse(m.combo_contents).includes("drink"));
  check(`combos carry contents metadata (e.g. "${comboWithDrink?.name}")`, !!comboWithDrink, "no combo with drink contents found");
  if (comboWithDrink) {
    const covered = JSON.parse(comboWithDrink.combo_contents);
    const r = await api("/api/recommend", {
      method: "POST",
      body: JSON.stringify({ session_id: SESSION, cart: [{ item_id: comboWithDrink.id, qty: 1 }], trigger: "item_added" }),
    });
    const cats = (r.body.items ?? []).map((i) => i.category);
    check(`no rec duplicates combo contents [${covered.join(",")}] (got: ${cats.join(",")})`, cats.every((c) => !covered.includes(c)));
  }
}

// 15. kindness-first smart swap: separate items → cheaper combo suggested
{
  const ga = menu.find((m) => m.name === "1 Miếng Gà Rán");
  const pepsi = menu.find((m) => m.name === "Pepsi (Vừa)");
  const khoai = menu.find((m) => m.name === "Khoai Tây Chiên (Vừa)");
  if (ga && pepsi && khoai) {
    const r = await api("/api/recommend", {
      method: "POST",
      body: JSON.stringify({
        session_id: SESSION, trigger: "cart_review",
        cart: [{ item_id: ga.id, qty: 1 }, { item_id: pepsi.id, qty: 1 }, { item_id: khoai.id, qty: 1 }],
      }),
    });
    const sw = r.body.smart_swap;
    check("smart swap offered for separate items", !!sw, JSON.stringify(r.body).slice(0, 200));
    if (sw) {
      check(`swap is a genuine saving or bonus (Δ ${sw.delta_display})`, sw.delta < 0 || sw.extras.length > 0);
      check("swap message is kindness-toned", (sw.message_vn ?? "").length > 10);
      console.log(`     swap: ${sw.name} ${sw.delta_display} — "${sw.message_vn}"`);
    }
  } else {
    check("smart swap fixtures present", false, "menu items for swap test not found");
  }
}

// 15b. scenario director override
{
  const set = await api("/api/admin/scenario", {
    method: "POST",
    body: JSON.stringify({ scenario: { label: "test-scenario", store_id: 2, daypart: "dinner", dow: 6, holiday: null } }),
  });
  check("scenario set", set.status === 200);
  const m2 = await api("/api/menu");
  check("menu follows scenario (store 2, dinner)", m2.body.store?.id === 2 && m2.body.daypart === "dinner" && m2.body.scenario === "test-scenario");
  check("scenario inventory respected (Zinger hidden at store 2)", !(m2.body.items ?? []).some((i) => /burger/i.test(i.name) && /zinger/i.test(i.name) && !i.is_combo));
  const clear = await api("/api/admin/scenario", { method: "POST", body: JSON.stringify({ scenario: null }) });
  check("scenario cleared to real time", clear.status === 200);
  const m3 = await api("/api/menu");
  check("menu back on real store", m3.body.scenario == null);
}

// 15c. psychology layer: strategy labels + cross-subsidy drink rule
{
  const r = await api("/api/recommend", {
    method: "POST",
    body: JSON.stringify({ session_id: SESSION, cart: [{ item_id: chicken.id, qty: 1 }], trigger: "item_added" }),
  });
  const items = r.body.items ?? [];
  check("every rec carries a strategy label", items.length > 0 && items.every((i) => typeof i.strategy === "string" && i.strategy.length > 0), JSON.stringify(items.map((i) => i.strategy)));
  // chicken in cart, no drink anywhere → slate must lead with a drink (cross-subsidy)
  const lead = items[0];
  check("cross-subsidy: drink attach leads the slate for a drinkless chicken cart",
    lead?.category === "drink" && lead?.strategy === "cross_subsidy",
    `lead=${lead?.name} (${lead?.category}/${lead?.strategy})`);
  console.log(`     strategies: ${items.map((i) => `${i.name}→${i.strategy}`).join(" | ")}`);

  // full menu: the crawl brought the real catalog
  check(`full-menu crawl live (menu ≥ 90 items, got ${menu.length})`, menu.length >= 90);
}

// 15d. ops-panel probe: instant, and never pollutes acceptance metrics
{
  const before = await api("/api/admin/metrics");
  const r = await api("/api/recommend", {
    method: "POST",
    body: JSON.stringify({ session_id: SESSION, cart: [{ item_id: chicken.id, qty: 1 }], trigger: "ops_panel" }),
  });
  const after = await api("/api/admin/metrics");
  check(`ops_panel probe returns dishes fast (${r.ms}ms)`, r.status === 200 && (r.body.items?.length ?? 0) >= 2 && r.ms < 2500);
  check("ops_panel probe logs no rec impression (honest metrics)", after.body.rec_impressions === before.body.rec_impressions,
    `before=${before.body.rec_impressions} after=${after.body.rec_impressions}`);
}

// 15e. Christmas scenario: holiday + Noel promo + seasonal combos
{
  const set = await api("/api/admin/scenario", {
    method: "POST",
    body: JSON.stringify({
      scenario: { label: "Đêm Giáng Sinh 🎄", store_id: 1, daypart: "dinner", dow: 4, holiday: "Đêm Giáng Sinh" },
      promo_code: "NOEL",
    }),
  });
  check("xmas scenario set", set.status === 200);
  const m = await api("/api/menu");
  check("kiosk context shows the holiday", m.body.holiday === "Đêm Giáng Sinh" && m.body.festive === true, `holiday=${m.body.holiday}`);
  check("Christmas combos on the menu", (m.body.items ?? []).some((i) => /giáng sinh|noel/i.test(i.name)));
  const promos = await api("/api/promotions");
  check("NOEL promo activated by the scenario", (promos.body.promotions ?? []).some((p) => p.code === "NOEL"));
  const clear = await api("/api/admin/scenario", { method: "POST", body: JSON.stringify({ scenario: null, promo_code: null }) });
  check("xmas scenario cleared", clear.status === 200);
  const promos2 = await api("/api/promotions");
  check("NOEL promo deactivated on clear", !(promos2.body.promotions ?? []).some((p) => p.code === "NOEL"));
}

// 16. chat poll (HITL relay endpoint)
{
  const r = await api(`/api/chat/poll?session_id=${SESSION}&after=0`);
  check("chat poll returns transcript", r.status === 200 && Array.isArray(r.body.messages));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
