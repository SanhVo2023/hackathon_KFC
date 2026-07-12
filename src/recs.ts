// The P2 contextual recommendation engine.
// Layer 1: deterministic scorer over 7 signals — co-occurrence (cluster-keyed
//          POS history), affinity rules, daypart fit (weekend/holiday aware),
//          promo calendar, store inventory posture, margin, popularity.
// Layer 2: one LLM call turns the top slate into a bilingual pitch line,
//          raced against a 1200ms timeout with deterministic fallback copy.
// Context = store cluster × location × time × day/holiday × inventory × promos × cart.

import { Telemetry, getSettings, getContext, todayHoliday, type Daypart } from "./telemetry";
import { getProfile } from "./profiler";

export interface MenuItem {
  id: number; name: string; name_en: string | null; category: string;
  description: string | null; price: number; image_url: string | null;
  is_combo: number; modifiers: string | null; tags: string | null;
  available: number; margin_pct: number; popularity: number;
}

interface Candidate extends MenuItem {
  stock: number | null; par_level: number | null; inv_available: number;
}

export interface CartLine { item_id: number; qty: number; name?: string }

export interface StoreInfo { id: number; name: string; district: string | null; cluster: string }

export interface Recommendation {
  id: number; name: string; name_en: string | null; category: string;
  price: number; price_display: string; image_url: string | null;
  pitch_vn: string; pitch_en: string;
  score: number; breakdown: Record<string, number>;
  promo_code: string | null; co_pct: number | null;
  strategy: string;   // the buyer-psychology play behind this slot (ops-facing)
}

export interface RecOverrides { store_id?: number; daypart?: Daypart }

export interface SmartSwap {
  id: number; name: string; name_en: string | null; price: number; price_display: string;
  image_url: string | null;
  replaces: { id: number; name: string }[];
  extras: string[];               // categories the combo adds on top
  delta: number;                  // combo price − replaced items (negative = saves money)
  delta_display: string;
  message_vn: string; message_en: string;
}

const VND = (n: number) => n.toLocaleString("vi-VN") + "₫";
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

interface Promo {
  id: number; code: string; name: string; description: string; kind: string;
  value: number; item_id: number | null; scope_category: string | null;
  daypart: string | null; days_of_week: string | null; min_order: number; active: number;
}

export function promoApplies(p: Promo, daypart: Daypart, dow: number, subtotal?: number): boolean {
  if (!p.active) return false;
  if (p.daypart && p.daypart !== daypart) return false;
  if (p.days_of_week && !p.days_of_week.split(",").map(Number).includes(dow)) return false;
  if (subtotal !== undefined && p.min_order > subtotal) return false;
  return true;
}

export async function getStore(env: Env, storeId: number): Promise<StoreInfo> {
  const s = await env.DB.prepare("SELECT * FROM stores WHERE id=?").bind(storeId).first<StoreInfo>();
  return s ?? { id: storeId, name: "KFC Việt Nam", district: null, cluster: "residential" };
}
export { todayHoliday };

// ---------- catalog ranking: the menu grid itself is a recommendation ----------
// Scores every in-stock item on the anchorless signals (daypart, promo,
// inventory posture, persona, margin, popularity) so the kiosk can reorder
// each category per customer × store × hour — invisible personalization inside
// the native grid. Top pick per category gets an HONEST badge (never margin/
// inventory-driven copy).
const DAYPART_VN: Record<string, string> = { breakfast: "buổi sáng", lunch: "giờ trưa", tea: "giờ xế", dinner: "giờ tối", late: "đêm muộn" };

export async function rankCatalog(
  env: Env, tel: Telemetry, sessionId: string,
  items: (MenuItem & { stock?: number; rank_score?: number; badge?: string | null; pop_cnt?: number })[],
  store: StoreInfo, daypart: Daypart, dow: number, festive: boolean,
): Promise<void> {
  const t0 = Date.now();
  const settings = await getSettings(env);
  const signals = (settings.signals ?? {}) as Record<string, boolean>;
  const baseWeights = (settings.weights ?? {}) as Record<string, number>;
  const enabled = ["daypart", "promo", "inventory", "persona", "margin", "popularity"]
    .filter((k) => signals[k] !== false && baseWeights[k]);
  const wSum = enabled.reduce((s, k) => s + baseWeights[k], 0) || 1;
  const w = Object.fromEntries(enabled.map((k) => [k, baseWeights[k] / wSum]));

  const [profile, popRows, promoRows] = await Promise.all([
    getProfile(env, sessionId),
    env.DB.prepare("SELECT item_id, cnt, share FROM item_popularity WHERE cluster=? AND daypart=?").bind(store.cluster, daypart).all(),
    env.DB.prepare("SELECT * FROM promotions WHERE active=1").all(),
  ]);
  const popMap = new Map((popRows.results as { item_id: number; cnt: number; share: number }[]).map((r) => [r.item_id, r]));
  const maxShare = Math.max(0.001, ...[...popMap.values()].map((r) => r.share));
  const activePromos = (promoRows.results as unknown as Promo[]).filter((p) => promoApplies(p, daypart, dow));

  const perCatTop = new Map<string, { item: typeof items[number]; dominant: string; score: number }>();
  for (const m of items) {
    const tags: string[] = m.tags ? JSON.parse(m.tags) : [];
    const parts: Record<string, number> = {};
    if (w.daypart) parts.daypart = w.daypart * ((tags.includes(daypart) || (festive && tags.includes("sharing"))) ? 1 : 0);
    if (w.promo) parts.promo = w.promo * (activePromos.some((p) => (p.item_id != null && p.item_id === m.id) || (p.scope_category != null && p.scope_category === m.category)) ? 1 : 0);
    if (w.inventory) parts.inventory = w.inventory * (m.stock == null ? 0.5 : clamp01(m.stock / 60));
    if (w.persona) parts.persona = w.persona * (profile?.category_bias?.[m.category] ?? 0) * (profile ? Math.max(0.4, profile.confidence) : 0);
    if (w.margin) parts.margin = w.margin * (m.margin_pct / 100);
    if (w.popularity) parts.popularity = w.popularity * ((popMap.get(m.id)?.share ?? m.popularity * maxShare * 0.5) / maxShare);
    m.rank_score = +Object.values(parts).reduce((s, v) => s + v, 0).toFixed(4);
    m.badge = null;
    m.pop_cnt = popMap.get(m.id)?.cnt ?? 0;
    // honest badge candidates only — margin/inventory never write customer copy
    const honest = Object.entries(parts).filter(([k, v]) => v > 0 && ["persona", "daypart", "promo", "popularity"].includes(k));
    if (honest.length) {
      const [dom] = honest.sort((a, b) => b[1] - a[1])[0];
      const top = perCatTop.get(m.category);
      if (!top || m.rank_score! > top.score) perCatTop.set(m.category, { item: m, dominant: dom, score: m.rank_score! });
    }
  }
  for (const { item, dominant } of perCatTop.values()) {
    item.badge = dominant === "persona" ? "Dành cho bạn"
      : dominant === "promo" ? "Đang ưu đãi"
      : dominant === "daypart" ? (festive ? "Hợp dịp này" : `Hợp ${DAYPART_VN[daypart] ?? daypart}`)
      : "Bán chạy";
  }
  tel.emit("rec_scored", "rec", "kiosk",
    `menu personalized: ${items.length} items re-ranked (${store.cluster}/${daypart}${profile ? ` × "${(profile.persona ?? "").slice(0, 40)}…"` : ", cold start"})`,
    undefined, Date.now() - t0);
}

export async function recommend(
  env: Env,
  tel: Telemetry,
  cart: CartLine[],
  trigger: string,
  sessionId: string,
  overrides?: RecOverrides,
): Promise<{ items: Recommendation[]; smart_swap: SmartSwap | null; daypart: Daypart; store: StoreInfo; festive: boolean; holiday: string | null; signals_used: string[] }> {
  const settings = await getSettings(env);
  const ctx = await getContext(env, settings);
  const daypart = overrides?.daypart ?? ctx.daypart;
  const dow = ctx.dow;
  const storeId = overrides?.store_id ?? ctx.storeId;
  const holiday = ctx.holiday;
  const festive = ctx.festive;
  const signals = (settings.signals ?? {}) as Record<string, boolean>;
  const baseWeights = (settings.weights ?? {}) as Record<string, number>;
  const slots = Number(settings.rec_slots ?? 3);

  const [store, profile] = await Promise.all([getStore(env, storeId), getProfile(env, sessionId)]);

  // renormalize weights over enabled signals
  const enabled = Object.keys(baseWeights).filter((k) => signals[k] !== false);
  const wSum = enabled.reduce((s, k) => s + (baseWeights[k] ?? 0), 0) || 1;
  const w = Object.fromEntries(enabled.map((k) => [k, (baseWeights[k] ?? 0) / wSum]));

  const cartIds = cart.map((c) => c.item_id);
  const t0 = Date.now();
  const marks = cartIds.map(() => "?").join(",") || "0";

  const [cartRows, pairRows, affRows, candRows, promoRows, popRows, shownRows] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM menu_items WHERE id IN (${marks})`).bind(...cartIds),
    env.DB.prepare(
      `SELECT item_a, item_b, cnt FROM item_pairs_c WHERE cluster=? AND item_a IN (${marks}) AND daypart=?`,
    ).bind(store.cluster, ...cartIds, daypart),
    env.DB.prepare("SELECT anchor_category, addon_category, weight, reason FROM affinities"),
    env.DB.prepare(
      `SELECT m.*, si.stock, si.par_level, COALESCE(si.available,1) AS inv_available
       FROM menu_items m LEFT JOIN store_inventory si ON si.item_id = m.id AND si.store_id = ?
       WHERE m.available = 1`,
    ).bind(storeId),
    env.DB.prepare("SELECT * FROM promotions WHERE active = 1"),
    env.DB.prepare("SELECT item_id, cnt, share FROM item_popularity WHERE cluster=? AND daypart=?").bind(store.cluster, daypart),
    env.DB.prepare("SELECT shown_items, accepted_item_id FROM rec_events WHERE session_id=? ORDER BY id DESC LIMIT 20").bind(sessionId),
  ]);

  // no-nag: an item offered twice this session without a yes gets a rest —
  // a good salesperson doesn't repeat themselves a third time
  const showCount = new Map<number, number>();
  const acceptedIds = new Set<number>();
  for (const r of shownRows.results as { shown_items: string; accepted_item_id: number | null }[]) {
    if (r.accepted_item_id) acceptedIds.add(r.accepted_item_id);
    try { for (const id of JSON.parse(r.shown_items) as number[]) showCount.set(id, (showCount.get(id) ?? 0) + 1); } catch { /* legacy */ }
  }
  const overShown = new Set([...showCount.entries()].filter(([id, n]) => n >= 2 && !acceptedIds.has(id)).map(([id]) => id));
  tel.emit("d1_query", "rec", "d1", `POS pairs + inventory + popularity (${store.name} · ${store.cluster} · ${daypart}${festive ? " · " + (holiday ?? "weekend") : ""})`, { store: storeId, cluster: store.cluster, daypart }, Date.now() - t0);

  const cartItems = cartRows.results as unknown as MenuItem[];
  const rawPairs = pairRows.results as { item_a: number; item_b: number; cnt: number }[];
  const pairSum = new Map<number, number>();          // candidate -> Σ cnt over anchors
  const pairByAnchor = new Map<string, number>();     // `${a}|${b}` -> cnt (for honest attach %)
  for (const p of rawPairs) {
    pairSum.set(p.item_b, (pairSum.get(p.item_b) ?? 0) + p.cnt);
    pairByAnchor.set(`${p.item_a}|${p.item_b}`, p.cnt);
  }
  const maxPair = Math.max(1, ...pairSum.values());
  const popMap = new Map((popRows.results as { item_id: number; cnt: number; share: number }[]).map((r) => [r.item_id, r]));
  const maxShare = Math.max(0.001, ...[...popMap.values()].map((r) => r.share));

  const anchorCats = new Set(cartItems.map((i) => i.category));
  const lastAnchorCat = cartItems.length ? cartItems[cartItems.length - 1].category : null;
  // categories already INSIDE cart combos (a combo with a Pepsi covers "drink" —
  // never recommend another cola on top of it)
  const coveredCats = new Set<string>();
  const comboInsides: string[] = [];
  for (const i of cartItems) {
    if (i.is_combo && i.combo_contents) {
      try {
        for (const c of JSON.parse(i.combo_contents) as string[]) coveredCats.add(c);
        comboInsides.push(`${i.name} already includes: ${(JSON.parse(i.combo_contents) as string[]).join(", ")}`);
      } catch { /* legacy rows */ }
    }
  }
  const affs = (affRows.results as { anchor_category: string; addon_category: string; weight: number; reason: string }[])
    .filter((a) => anchorCats.has(a.anchor_category));
  const promos = promoRows.results as unknown as Promo[];
  const activePromos = promos.filter((p) => promoApplies(p, daypart, dow));

  const subtotal = cartItems.reduce((s, i) => s + i.price * (cart.find((c) => c.item_id === i.id)?.qty ?? 1), 0);

  // ---------- meal completion: once the cart holds a MAIN (any combo/bucket or
  // a protein), the job flips from "sell a meal" to "complete the meal" —
  // complements only (dessert closes it), never another bundle. Without this,
  // a 500k bucket cart gets pitched yet another bucket, and the old
  // subtotal-scaled cap made it worse: the bigger the order, the bigger the
  // bundles it allowed.
  const mainCovered = cartItems.some((i) => i.is_combo)
    || anchorCats.has("chicken") || anchorCats.has("burger-rice")
    || coveredCats.has("chicken") || coveredCats.has("burger-rice");
  const priceCap = mainCovered ? 60000 : Math.max(45000, subtotal * 0.4);

  // ---------- kindness first: does an existing combo cover what they already
  // picked, for less money (or more food at ~the same price)? Offer the SWAP
  // before any upsell — trust like a salesperson who's genuinely on their side.
  const CAT_VN: Record<string, string> = { chicken: "gà", "burger-rice": "burger/cơm", snack: "khoai/salad", drink: "nước", dessert: "tráng miệng", combo: "combo" };
  let smartSwap: SmartSwap | null = null;
  const nonComboCart = cartItems.filter((i) => !i.is_combo);
  if (nonComboCart.length >= 2) {
    const cartByCat = new Map<string, MenuItem>();
    for (const i of nonComboCart) if (!cartByCat.has(i.category)) cartByCat.set(i.category, i);
    let best: { c: Candidate; matched: MenuItem[]; extras: string[]; delta: number; value: number } | null = null;
    for (const c of candRows.results as unknown as Candidate[]) {
      if (!c.is_combo || !c.combo_contents || !c.inv_available || (c.stock != null && c.stock <= 5)) continue;
      let contents: string[];
      try { contents = JSON.parse(c.combo_contents); } catch { continue; }
      const matched = contents.filter((cat) => cartByCat.has(cat)).map((cat) => cartByCat.get(cat)!);
      if (matched.length < 2) continue;
      const replacedSum = matched.reduce((s, m) => s + m.price, 0);
      const extras = contents.filter((cat) => !cartByCat.has(cat));
      const delta = c.price - replacedSum;
      const worthIt = delta < 0 || (extras.length > 0 && delta <= Math.min(15000, replacedSum * 0.25));
      if (!worthIt) continue;
      const value = -delta + extras.length * 8000;
      if (!best || value > best.value) best = { c, matched, extras, delta, value };
    }
    if (best) {
      const extrasVn = best.extras.map((e) => CAT_VN[e] ?? e).join(" + ");
      smartSwap = {
        id: best.c.id, name: best.c.name, name_en: best.c.name_en,
        price: best.c.price, price_display: VND(best.c.price), image_url: best.c.image_url,
        replaces: best.matched.map((m) => ({ id: m.id, name: m.name })),
        extras: best.extras, delta: best.delta,
        delta_display: (best.delta < 0 ? "−" : "+") + VND(Math.abs(best.delta)),
        message_vn: best.delta < 0
          ? `Mẹo nhỏ nè: đổi sang ${best.c.name} — vẫn đủ món bạn chọn mà tiết kiệm ${VND(-best.delta)}!`
          : `Mẹo nhỏ nè: đổi sang ${best.c.name} — có thêm ${extrasVn} mà chỉ thêm ${VND(best.delta)}.`,
        message_en: best.delta < 0
          ? `Friendly tip: switch to ${best.c.name} — everything you picked, and save ${VND(-best.delta)}!`
          : `Friendly tip: switch to ${best.c.name} — adds ${best.extras.join(" + ")} for just ${VND(best.delta)} more.`,
      };
      tel.emit("smart_swap", "rec", "kiosk",
        `kindness-first: swap → ${best.c.name} (${smartSwap.delta_display}${best.extras.length ? `, +${best.extras.join("/")}` : ""})`,
        { combo: best.c.name, delta: best.delta, replaces: smartSwap.replaces.map((r) => r.name) });
    }
  }

  const inCart = new Set(cartIds);
  let candidates = (candRows.results as unknown as Candidate[]).filter((m) => {
    if (inCart.has(m.id)) return false;
    if (!m.inv_available) return false;
    if (m.stock != null && m.stock <= 5) return false;   // protect near-stockout items
    if (m.price > priceCap) return false;
    if (coveredCats.has(m.category)) return false;       // combo already contains this kind of item
    if (mainCovered && m.is_combo) return false;         // never a second bundle on top of a main
    if (lastAnchorCat && m.category === lastAnchorCat && m.category !== "combo") return false;
    return true;
  });
  if (overShown.size) {
    const rested = candidates.filter((m) => !overShown.has(m.id));
    if (rested.length >= 6 && rested.length < candidates.length) {
      tel.emit("strategy", "rec", "worker", `no-nag: ${candidates.length - rested.length} item(s) rested after 2 unanswered offers`);
      candidates = rested;
    }
  }

  const scored = candidates.map((m) => {
    const tags: string[] = m.tags ? JSON.parse(m.tags) : [];
    const breakdown: Record<string, number> = {};
    if (w.cooccurrence) breakdown.cooccurrence = w.cooccurrence * ((pairSum.get(m.id) ?? 0) / maxPair);
    if (w.affinity) {
      const aw = Math.max(0, ...affs.filter((a) => a.addon_category === m.category).map((a) => a.weight));
      breakdown.affinity = w.affinity * aw;
    }
    if (w.daypart) {
      const fits = tags.includes(daypart) || (festive && tags.includes("sharing"));
      breakdown.daypart = w.daypart * (fits ? 1 : 0);
    }
    if (w.promo) {
      const hasPromo = activePromos.some((p) =>
        (p.item_id != null && p.item_id === m.id) || (p.scope_category != null && p.scope_category === m.category));
      breakdown.promo = w.promo * (hasPromo ? 1 : 0);
    }
    if (w.inventory) {
      // stock above par → push it; unknown inventory → neutral
      const posture = m.stock == null || m.par_level == null
        ? 0.5 : clamp01(0.5 + 0.5 * ((m.stock - m.par_level) / Math.max(m.par_level, 1)));
      breakdown.inventory = w.inventory * posture;
    }
    if (w.persona) {
      // the customer-hypothesis agent's live category bias (8th signal)
      breakdown.persona = w.persona * (profile?.category_bias?.[m.category] ?? 0) * (profile ? Math.max(0.4, profile.confidence) : 0);
    }
    if (w.margin) breakdown.margin = w.margin * (m.margin_pct / 100);
    if (w.popularity) breakdown.popularity = w.popularity * ((popMap.get(m.id)?.share ?? m.popularity * maxShare * 0.5) / maxShare);
    const score = Object.values(breakdown).reduce((s, v) => s + v, 0);
    return { m, score, breakdown };
  }).sort((a, b) => b.score - a.score);

  // slate: at most one item per category, up to `slots`
  const slate: typeof scored = [];
  const usedCats = new Set<string>();
  for (const s of scored) {
    if (usedCats.has(s.m.category)) continue;
    slate.push(s);
    usedCats.add(s.m.category);
    if (slate.length >= slots) break;
  }

  // ---------- psychology: cross-subsidization (QSR economics — fountain drinks
  // run >90% margin and carry the combo's profitability). Protein in the cart
  // with no drink anywhere → the slate MUST lead with a drink.
  const hasProtein = cartItems.some((i) => i.is_combo || i.category === "chicken" || i.category === "burger-rice");
  const drinkCovered = cartItems.some((i) => i.category === "drink") || coveredCats.has("drink");
  let crossSubsidyId: number | null = null;
  if (hasProtein && !drinkCovered) {
    let drink = slate.find((s) => s.m.category === "drink");
    if (!drink) {
      drink = scored.find((s) => s.m.category === "drink");
      if (drink) {
        if (slate.length >= slots) slate.pop();
        slate.push(drink);
      }
    }
    if (drink) {
      crossSubsidyId = drink.m.id;
      slate.sort((a, b) => (a.m.id === crossSubsidyId ? -1 : b.m.id === crossSubsidyId ? 1 : 0));
      tel.emit("strategy", "rec", "worker", `cross-subsidy: gà cần nước — drink attach leads the slate (${drink.m.name})`, { item: drink.m.name, margin_pct: drink.m.margin_pct });
    }
  }

  // the buyer-psychology play behind each slot (ops-facing label)
  const STRATEGY_BY_SIGNAL: Record<string, string> = {
    cooccurrence: "cooccurrence", persona: "persona_match", promo: "promo",
    inventory: "inventory_push", daypart: "daypart_fit", margin: "margin_play",
    affinity: "affinity", popularity: "popular",
  };
  const strategyOf = (s: { m: Candidate; breakdown: Record<string, number> }): string => {
    if (s.m.id === crossSubsidyId) return "cross_subsidy";
    const top = Object.entries(s.breakdown).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
    return top ? (STRATEGY_BY_SIGNAL[top[0]] ?? "popular") : "popular";
  };

  if (!slate.length && cartItems.length) {
    // nothing sensible left to add — say so instead of squeezing
    tel.emit("strategy", "rec", "worker", "meal looks complete — no upsell pushed (kindness: trust > squeeze)");
  }
  tel.emit("rec_scored", "rec", "worker", `scored ${candidates.length} candidates → top ${slate.length} [${store.cluster}/${daypart}${festive ? "/festive" : ""}${mainCovered ? "/complete-the-meal" : ""}]`, {
    store: store.name, cluster: store.cluster,
    top: slate.map((s) => ({ id: s.m.id, name: s.m.name, score: +s.score.toFixed(3), breakdown: Object.fromEntries(Object.entries(s.breakdown).map(([k, v]) => [k, +v.toFixed(3)])) })),
    signals: enabled,
  });

  // honest attach rate: max over anchors of P(candidate | anchor basket) in this cluster+daypart
  const attachPct = (candId: number): number | null => {
    let best = 0;
    for (const a of cartIds) {
      const pair = pairByAnchor.get(`${a}|${candId}`) ?? 0;
      const anchorCnt = popMap.get(a)?.cnt ?? 0;
      if (anchorCnt >= 20 && pair > 0) best = Math.max(best, pair / anchorCnt);
    }
    const pct = Math.round(best * 100);
    return pct >= 10 ? Math.min(pct, 85) : null;
  };

  const recs: Recommendation[] = slate.map((s) => {
    const coPct = attachPct(s.m.id);
    const promo = activePromos.find((p) => (p.item_id != null && p.item_id === s.m.id) || (p.scope_category != null && p.scope_category === s.m.category));
    const strategy = strategyOf(s);
    return {
      id: s.m.id, name: s.m.name, name_en: s.m.name_en, category: s.m.category,
      price: s.m.price, price_display: VND(s.m.price), image_url: s.m.image_url,
      pitch_vn: fallbackPitch(s.m, coPct, promo, "vi", strategy),
      pitch_en: fallbackPitch(s.m, coPct, promo, "en", strategy),
      score: +s.score.toFixed(3), breakdown: Object.fromEntries(Object.entries(s.breakdown).map(([k, v]) => [k, +v.toFixed(3)])),
      promo_code: promo?.code ?? null, co_pct: coPct, strategy,
    };
  });

  // Layer 2: LLM pitch (raced against timeout, falls back to deterministic copy).
  // ops_panel probes want instant deterministic copy — skip the LLM.
  if (settings.llm_pitch !== false && recs.length && cartItems.length && trigger !== "ops_panel") {
    const tLlm = Date.now();
    tel.emit("llm_call", "rec", "llm", "pitch generation (gpt-oss-120b)", { items: recs.map((r) => r.name) });
    try {
      const pitched = await Promise.race([
        llmPitch(env, cartItems, recs, daypart, store, festive, profile?.persona ?? null, comboInsides, mainCovered),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
      ]);
      if (pitched) {
        for (const r of recs) {
          const p = pitched.find((x) => x.id === r.id);
          if (p?.pitch_vn) r.pitch_vn = p.pitch_vn;
          if (p?.pitch_en) r.pitch_en = p.pitch_en;
        }
        tel.emit("llm_result", "llm", "rec", "pitch ready", undefined, Date.now() - tLlm);
      } else {
        tel.emit("llm_timeout", "llm", "rec", "pitch timeout 1200ms → deterministic copy", undefined, Date.now() - tLlm);
      }
    } catch (err) {
      tel.emit("llm_error", "llm", "rec", `pitch failed → deterministic copy`, { err: String(err) }, Date.now() - tLlm);
    }
  }

  // log impression for acceptance metrics (simulator/ops-panel probes don't count)
  if (trigger !== "simulator" && trigger !== "ops_panel") {
    await env.DB.prepare(
      "INSERT INTO rec_events (session_id, trigger, anchor_items, shown_items) VALUES (?,?,?,?)",
    ).bind(sessionId, trigger, JSON.stringify(cartIds), JSON.stringify(recs.map((r) => r.id))).run();
  }

  return { items: recs, smart_swap: smartSwap, daypart, store, festive, holiday, signals_used: enabled };
}

// "embroidered cognition": sensory adjectives make the brain simulate the bite —
// reading "giòn rụm" fires the texture/sound neurons before the food exists.
const SENSORY: Record<string, { vi: string; en: string }> = {
  chicken: { vi: "giòn rụm nóng hổi", en: "crackling hot & crispy" },
  "burger-rice": { vi: "nóng hổi đậm đà", en: "steaming & savory" },
  snack: { vi: "giòn tan", en: "golden crunchy" },
  drink: { vi: "mát lạnh sảng khoái", en: "ice-cold & fizzy" },
  dessert: { vi: "mát lịm ngọt dịu", en: "silky sweet" },
  combo: { vi: "đầy đặn nóng giòn", en: "hearty & fresh-fried" },
};

function fallbackPitch(m: MenuItem, coPct: number | null, promo: Promo | undefined, lang: "vi" | "en", strategy?: string): string {
  const name = lang === "en" && m.name_en ? m.name_en : m.name;
  const sens = SENSORY[m.category]?.[lang] ?? "";
  if (strategy === "cross_subsidy") {
    return lang === "vi"
      ? `Gà nóng cần ngụm ${sens} — thêm ${name} nhé?`
      : `Hot chicken needs something ${sens} — add ${name}?`;
  }
  if (promo) {
    return lang === "vi"
      ? `${name} ${sens} — đang có ưu đãi ${promo.name}!`
      : `${name}, ${sens} — "${promo.name}" promo is on right now!`;
  }
  if (coPct) {
    return lang === "vi"
      ? `${coPct}% khách chọn món giống bạn cũng thêm ${name} ${sens}.`
      : `${coPct}% of customers with your order also add ${name} — ${sens}.`;
  }
  return lang === "vi" ? `Thêm ${name} ${sens} chỉ ${VND(m.price)}.` : `Add ${name}, ${sens}, for just ${VND(m.price)}.`;
}

async function llmPitch(
  env: Env,
  cartItems: MenuItem[],
  recs: Recommendation[],
  daypart: Daypart,
  store: StoreInfo,
  festive: boolean,
  persona: string | null,
  comboInsides: string[],
  mainCovered = false,
): Promise<{ id: number; pitch_vn: string; pitch_en: string }[] | null> {
  const prompt = `You write kiosk upsell one-liners for ${store.name} (a ${store.cluster}-area KFC in Vietnam). Daypart: ${daypart}${festive ? " (weekend/holiday — family mood)" : ""}.
Cart: ${cartItems.map((i) => i.name).join(", ")}.${comboInsides.length ? ` NOTE — ${comboInsides.join("; ")}. Pitches must COMPLEMENT what the cart already contains, never duplicate it.` : ""}${mainCovered ? " The meal's main course is already in the cart — pitch small finishing touches that COMPLETE it (a dessert closes the meal), never another meal or bundle." : ""}
${persona ? `Customer hypothesis (a guess — use the vibe, never state it literally): ${persona}. Tailor the tone (e.g. family → kids/sharing angle, office worker → quick/refreshing angle).` : ""}
Candidates (with data-driven reasons): ${JSON.stringify(recs.map((r) => ({ id: r.id, name: r.name, price: r.price_display, attach_pct: r.co_pct, promo: r.promo_code })))}.
For EACH candidate return one short, appetizing pitch line (max 14 words) in Vietnamese and English. Mention the attach_pct stat or promo when present. Use SENSORY words that make the reader taste it (giòn rụm, nóng hổi, mát lạnh / crispy, piping hot, ice-cold) — never bland copy. Return ONLY JSON:
{"items":[{"id":number,"pitch_vn":string,"pitch_en":string}]}`;
  // gpt-oss on Workers AI speaks the Responses API (`input`), not chat `messages`.
  const result = (await env.AI.run("@cf/openai/gpt-oss-120b" as never, {
    input: prompt,
  } as never)) as {
    response?: string;
    output?: { type: string; content?: { type: string; text?: string }[] }[];
  };
  const text = result.output
    ?.filter((o) => o.type === "message")
    .flatMap((o) => (o.content ?? []).map((c) => c.text ?? ""))
    .join("") ?? result.response ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { items?: { id: number; pitch_vn: string; pitch_en: string }[] };
    return parsed.items ?? null;
  } catch { return null; }
}
