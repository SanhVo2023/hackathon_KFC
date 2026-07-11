// The P2 contextual recommendation engine.
// Layer 1: deterministic scorer over co-occurrence (synthetic POS history),
//          affinity rules, daypart fit, promo calendar, margin, popularity.
// Layer 2: one LLM call turns the top slate into a bilingual pitch line,
//          raced against a 1600ms timeout with deterministic fallback copy.

import { Telemetry, vnNow, getSettings, type Daypart } from "./telemetry";

export interface MenuItem {
  id: number; name: string; name_en: string | null; category: string;
  description: string | null; price: number; image_url: string | null;
  is_combo: number; modifiers: string | null; tags: string | null;
  available: number; margin_pct: number; popularity: number;
}

export interface CartLine { item_id: number; qty: number; name?: string }

export interface Recommendation {
  id: number; name: string; name_en: string | null; category: string;
  price: number; price_display: string; image_url: string | null;
  pitch_vn: string; pitch_en: string;
  score: number; breakdown: Record<string, number>;
  promo_code: string | null; co_pct: number | null;
}

const VND = (n: number) => n.toLocaleString("vi-VN") + "₫";

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

export async function recommend(
  env: Env,
  tel: Telemetry,
  cart: CartLine[],
  trigger: string,
  sessionId: string,
): Promise<{ items: Recommendation[]; daypart: Daypart; signals_used: string[] }> {
  const { daypart, dow } = vnNow();
  const settings = await getSettings(env);
  const signals = (settings.signals ?? {}) as Record<string, boolean>;
  const baseWeights = (settings.weights ?? {}) as Record<string, number>;
  const slots = Number(settings.rec_slots ?? 3);

  // renormalize weights over enabled signals
  const enabled = Object.keys(baseWeights).filter((k) => signals[k] !== false);
  const wSum = enabled.reduce((s, k) => s + (baseWeights[k] ?? 0), 0) || 1;
  const w = Object.fromEntries(enabled.map((k) => [k, (baseWeights[k] ?? 0) / wSum]));

  const cartIds = cart.map((c) => c.item_id);
  const t0 = Date.now();

  const marks = cartIds.map(() => "?").join(",") || "0";
  const [cartRows, pairRows, affRows, candRows, promoRows] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM menu_items WHERE id IN (${marks})`).bind(...cartIds),
    env.DB.prepare(
      `SELECT item_b, SUM(cnt) AS c FROM item_pairs WHERE item_a IN (${marks}) AND daypart = ? GROUP BY item_b`,
    ).bind(...cartIds, daypart),
    env.DB.prepare("SELECT anchor_category, addon_category, weight, reason FROM affinities"),
    env.DB.prepare("SELECT * FROM menu_items WHERE available = 1"),
    env.DB.prepare("SELECT * FROM promotions WHERE active = 1"),
  ]);
  tel.emit("d1_query", "rec", "d1", `co-occurrence + catalog lookup (daypart=${daypart})`, { cart: cartIds, daypart }, Date.now() - t0);

  const cartItems = cartRows.results as unknown as MenuItem[];
  const pairs = new Map((pairRows.results as { item_b: number; c: number }[]).map((r) => [r.item_b, r.c]));
  const maxPair = Math.max(1, ...pairs.values());
  const anchorCats = new Set(cartItems.map((i) => i.category));
  const lastAnchorCat = cartItems.length ? cartItems[cartItems.length - 1].category : null;
  const affs = (affRows.results as { anchor_category: string; addon_category: string; weight: number; reason: string }[])
    .filter((a) => anchorCats.has(a.anchor_category));
  const promos = promoRows.results as unknown as Promo[];
  const activePromos = promos.filter((p) => promoApplies(p, daypart, dow));

  const subtotal = cartItems.reduce((s, i) => s + i.price * (cart.find((c) => c.item_id === i.id)?.qty ?? 1), 0);
  const priceCap = Math.max(45000, subtotal * 0.4);

  const inCart = new Set(cartIds);
  const candidates = (candRows.results as unknown as MenuItem[]).filter((m) => {
    if (inCart.has(m.id)) return false;
    if (m.price > priceCap) return false;
    // don't recommend another main of the same category the customer just picked,
    // except a combo upgrade
    if (lastAnchorCat && m.category === lastAnchorCat && m.category !== "combo") return false;
    return true;
  });

  const scored = candidates.map((m) => {
    const tags: string[] = m.tags ? JSON.parse(m.tags) : [];
    const breakdown: Record<string, number> = {};
    if (w.cooccurrence) breakdown.cooccurrence = w.cooccurrence * ((pairs.get(m.id) ?? 0) / maxPair);
    if (w.affinity) {
      const aw = Math.max(0, ...affs.filter((a) => a.addon_category === m.category).map((a) => a.weight));
      breakdown.affinity = w.affinity * aw;
    }
    if (w.daypart) breakdown.daypart = w.daypart * (tags.includes(daypart) ? 1 : 0);
    if (w.promo) {
      const hasPromo = activePromos.some((p) =>
        (p.item_id != null && p.item_id === m.id) || (p.scope_category != null && p.scope_category === m.category));
      breakdown.promo = w.promo * (hasPromo ? 1 : 0);
    }
    if (w.margin) breakdown.margin = w.margin * (m.margin_pct / 100);
    if (w.popularity) breakdown.popularity = w.popularity * m.popularity;
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

  tel.emit("rec_scored", "rec", "worker", `scored ${candidates.length} candidates → top ${slate.length} [${daypart}]`, {
    top: slate.map((s) => ({ id: s.m.id, name: s.m.name, score: +s.score.toFixed(3), breakdown: Object.fromEntries(Object.entries(s.breakdown).map(([k, v]) => [k, +v.toFixed(3)])) })),
    signals: enabled,
  });

  const recs: Recommendation[] = slate.map((s) => {
    const coPct = pairs.get(s.m.id) ? Math.min(85, Math.round(40 + ((pairs.get(s.m.id) ?? 0) / maxPair) * 45)) : null;
    const promo = activePromos.find((p) => (p.item_id != null && p.item_id === s.m.id) || (p.scope_category != null && p.scope_category === s.m.category));
    return {
      id: s.m.id, name: s.m.name, name_en: s.m.name_en, category: s.m.category,
      price: s.m.price, price_display: VND(s.m.price), image_url: s.m.image_url,
      pitch_vn: fallbackPitch(s.m, coPct, promo, "vi"),
      pitch_en: fallbackPitch(s.m, coPct, promo, "en"),
      score: +s.score.toFixed(3), breakdown: Object.fromEntries(Object.entries(s.breakdown).map(([k, v]) => [k, +v.toFixed(3)])),
      promo_code: promo?.code ?? null, co_pct: coPct,
    };
  });

  // Layer 2: LLM pitch (raced against timeout, falls back to deterministic copy)
  if (settings.llm_pitch !== false && recs.length && cartItems.length) {
    const tLlm = Date.now();
    tel.emit("llm_call", "rec", "llm", "pitch generation (gpt-oss-120b)", { items: recs.map((r) => r.name) });
    try {
      const pitched = await Promise.race([
        llmPitch(env, cartItems, recs, daypart),
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

  // log impression for acceptance metrics
  await env.DB.prepare(
    "INSERT INTO rec_events (session_id, trigger, anchor_items, shown_items) VALUES (?,?,?,?)",
  ).bind(sessionId, trigger, JSON.stringify(cartIds), JSON.stringify(recs.map((r) => r.id))).run();

  return { items: recs, daypart, signals_used: enabled };
}

function fallbackPitch(m: MenuItem, coPct: number | null, promo: Promo | undefined, lang: "vi" | "en"): string {
  const name = lang === "en" && m.name_en ? m.name_en : m.name;
  if (promo) {
    return lang === "vi"
      ? `${name} — đang có ưu đãi ${promo.name}!`
      : `${name} — "${promo.name}" promo is on right now!`;
  }
  if (coPct) {
    return lang === "vi"
      ? `${coPct}% khách chọn món giống bạn cũng thêm ${name}.`
      : `${coPct}% of customers with your order also add ${name}.`;
  }
  return lang === "vi" ? `Thêm ${name} chỉ ${VND(m.price)} cho bữa thêm trọn vị.` : `Add ${name} for just ${VND(m.price)}.`;
}

async function llmPitch(
  env: Env,
  cartItems: MenuItem[],
  recs: Recommendation[],
  daypart: Daypart,
): Promise<{ id: number; pitch_vn: string; pitch_en: string }[] | null> {
  const prompt = `You write kiosk upsell one-liners for KFC Vietnam. Cart: ${cartItems.map((i) => i.name).join(", ")}. Daypart: ${daypart}.
Candidates (with data-driven reasons): ${JSON.stringify(recs.map((r) => ({ id: r.id, name: r.name, price: r.price_display, co_pct: r.co_pct, promo: r.promo_code })))}.
For EACH candidate return one short, appetizing pitch line (max 14 words) in Vietnamese and English. Mention the co_pct stat or promo when present. Return ONLY JSON:
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
