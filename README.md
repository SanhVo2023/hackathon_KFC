# KFC Kiosk Agent — Contextual Upsell + Conversational Ordering

**Agentic AI Build Week 2026 · F&B Track (KFC Vietnam) · Problems P2 + P4**

> A self-ordering kiosk where an agentic AI layer **guesses who the customer is** (one camera
> glance at check-in + every tap after it), builds trust with **kindness-first combo-saving
> suggestions**, then drives contextual upsell (P2) — with every API call, tool call, D1 query
> and LLM decision visualized live on an animated system diagram. A conversational ordering
> agent with human handoff covers P4 via API.

**Live demo:** https://kfc-kiosk-agent.gentle-sky-3b0e.workers.dev

| Surface | URL | What it is |
|---|---|---|
| Desktop view | `/` | Kiosk + live system diagram + event stream, in one 4K screen |
| Kiosk (standalone) | `/kiosk` | Full customer journey, portrait, touch-first |
| Admin control center | `/admin` | Non-technical staff setup + production tracking + HITL support |

## The problems (from KFC Vietnam's brief)

- **P2 — Kiosk recommendations:** 250+ stores, static menus, manually curated "you may also
  like" updated monthly. Target: **+10–15% AOV** from contextual upsell.
- **P4 — Conversational ordering:** no natural-language ordering; vouchers/loyalty are
  staff-handled. Target: order completion, voucher application, loyalty inquiry, handoff.

## What we built

### 0. Customer hypothesis agent — "guess, never assume", fully invisible
The kiosk shows **nothing** about profiling — the customer sees only the journey they already
know. In the background, a store-camera frame (demo: injected from the ops view) passes through
a **vision model** (llama-3.2-11b-vision, llava fallback) that extracts only coarse,
non-identifying attributes (age band, attire, group, context). Then **every interaction** —
order type, a 4-person bucket, a dismissed suggestion — feeds **llama-3.1-8b-fast** (~1.3s,
never blocking the UI) which continuously revises a persona hypothesis with category biases
and a confidence score. A woman in casual clothes buying a 4-person wings combo → "likely a
family" → dessert bias up. A man in a suit at noon → "office worker on a lunch break" →
quick-drink bias up. The hypothesis is the engine's 8th signal, shown live (persona, evidence
trail, bias bars) on the ops view. Privacy by construction: no identity, no photo storage.

### 0a. The journey customers already know — AI inside it, not on top of it
KFC runs these kiosks across hundreds of restaurants; the flow must never re-educate users.
The kiosk reproduces the standard KFC meal-builder exactly — menu → **MEAL SIZE** (combo vs
item only) → **CUSTOMIZE** (soda flavor, extras, upsize) → **ADD ON** ("Let's top it up!") →
**REVIEW** → green "added to basket". The AI lives *inside* those native steps: MEAL SIZE
shows the honest money-saving flag on the combo option, and the ADD ON grid is simply
*populated by the rec engine*, with data-driven pitch lines. **Preemptive by design:** the
engine and profiler start working the moment an item is opened, so when the customer reaches
ADD ON the suggestions are already rendered — zero added wait in an intensely time-pressed flow.

### 0b. Kindness first — trust before upsell
If the customer builds a combo by hand (wings + Pepsi + fries as separate items), the engine
first offers the **money-saving swap** to the real combo: *"Mẹo nhỏ nè: đổi sang Combo 1 Miếng
Gà — vẫn đủ món bạn chọn mà tiết kiệm 13.000₫!"* — like a salesperson genuinely on the
customer's side. Combos carry machine-readable contents, so the engine also **never
recommends a cola on top of a combo that already includes one.**

### 1. Recommendation engine (P2) — deterministic scoring × LLM voice
**Context = customer hypothesis × store cluster × location × time × day/holiday × inventory × promos × cart.**
Every rec moment (item added, cart review, agent tool call) runs an **8-signal scorer** over
D1 in one batch (~70ms):

```
score = .25·co-occurrence (9,000 POS baskets, pairs keyed by STORE CLUSTER × daypart)
      + .15·persona        (the customer-hypothesis agent's live category bias × confidence)
      + .12·affinity rules (anchor→addon category weights)
      + .13·daypart fit    (breakfast/lunch/tea/dinner/late + weekend/holiday boost)
      + .13·promo calendar (time-of-day + day-of-week aware promotions)
      + .10·inventory posture (push overstock, protect near-stockout, never suggest sold-out)
      + .07·margin  + .05·popularity (POS-derived, per cluster+daypart)
```

**Per-store tailoring:** the 250+ stores are grouped into site clusters (mall / office /
residential / tourist), each with its own mined basket patterns — the same fried-chicken
cart gets *Pepsi + Salad + Burger Gà Yo* at an office store at lunch, but *7Up + Fries +
Ice Cream* at a mall store at dinner. Verified in the test suite. Each kiosk sells only what
its own store has in stock, and orders decrement live inventory.

The top-3 slate then gets its bilingual sales pitch written by **gpt-oss-120b** (Workers AI),
raced against a 1.2s timeout with deterministic data-driven copy as fallback — with an
**honest attach rate** ("52% khách chọn món giống bạn cũng thêm Pepsi" = real
P(addon | anchor) from the cluster's baskets). Admin can toggle each signal live — the slate
visibly changes, and the diagram shows the changed data path.

Every impression/accept/dismiss is logged → the admin dashboard reports **AOV with-rec vs
without-rec** (baseline shows ≈ +15%, in KFC's own projected band) and acceptance rate.
The admin **what-if simulator** lets marketing preview any store × daypart × cart slate with
per-signal score breakdowns — the manual-curation replacement, made tangible. A
**demand/stockout forecast** (from 90 days of POS history) covers the Predictive Analytics
requirement: expected orders per daypart plus projected stockout ETAs per item.

### 2. Conversational ordering agent (P4)
An agent loop (max 6 steps) on **Workers AI** with **9 D1-grounded tools**: `search_menu`,
`get_item`, `recommend_upsell` (same engine as P2 — one brain, two channels),
`get_active_promotions`, `apply_voucher`, `check_loyalty`, `add_to_cart`, `place_order`,
`handoff_to_human`. Vietnamese/English, grounded-only answers, cart effects sync into the
kiosk UI (the agent's `add_to_cart` visibly drops items into the kiosk cart).

**Human-in-the-loop:** `handoff_to_human` routes the session to the first available CS/sales
staff member. Staff see the queue + full transcript in `/admin`, reply live (relayed to the
kiosk chat), and resolve — the AI then resumes the session.

### 3. Live system diagram
The Worker batches telemetry for every API call, tool call, D1 query, LLM call and staff
event into D1 (`ctx.waitUntil`, never blocking the hot path). The desktop view polls a
cursor and pulses the corresponding edges (gold = AI, red = customer, green = human);
kiosk UI events arrive instantly via `postMessage`. Judges watch the architecture work
in real time.

### 4. Admin control center (for non-technical staff)
Overview (AOV uplift hero metric), order production board (kanban: received → preparing →
ready → completed), HITL support queue with live chat takeover, AI settings (signal toggles,
LLM pitch on/off, slots), menu 86-ing, promotion toggles, live event log. All Vietnamese-first.

## Data — crawled + synthetic
- **Menu:** real KFC Vietnam items, prices and official images, crawled from
  kfcvietnam.com.vn with **TinyFish** (two agent runs: items+prices, then a 92-image sweep),
  merged with a curated catalog for category coverage → 48 items. The last 10 missing product
  photos were generated with **Gemini (gemini-2.5-flash-image)** in KFC menu-board style
  (`seed/gen-images.mjs`, key via env only).
- **POS history:** 9,000 synthetic transactions over 90 days across 6 stores in 4 site
  clusters, with cluster-specific daypart/basket archetypes → precomputed co-occurrence and
  popularity per cluster × daypart. Per-store inventory (stock vs par level) + holiday calendar.
- **Baseline ops data:** 120 stratified orders (matched base distributions; AI addons strictly
  additive) so the AOV counterfactual is honest.

## Architecture

One Cloudflare Worker (TypeScript, no framework, no build step) + D1 + Workers AI + static assets.

```
Kiosk UI ──► Worker API ──► Rec Engine ──► D1 (menu · item_pairs · promos · settings)
   │             │              └────────► Workers AI (gpt-oss-120b: pitch lines)
   │             └────────► Agent Loop ──► 9 tools ──► D1 / Rec Engine
   │                            │  └─────► Workers AI (gpt-oss-120b: tool-use loop)
   │                            └────────► CS/Sales staff (HITL via admin)
   Admin ───► settings / menu / promos / orders / handoffs
   ALL of the above ──► events table ──► live diagram + admin log  (Langfuse-ready tracing included)
```

## Tech stack (declared for bonus prizes)
- **TinyFish** — real-menu crawling (agent run beat the site's bot blocking)
- **OpenAI gpt-oss-120b** — served via Cloudflare Workers AI (agent loop via Responses API + rec pitches)
- **Cloudflare** — Workers, D1, Workers AI, static assets (wrangler deploys)
- **Langfuse** — zero-SDK tracing integration included (`src/langfuse.ts`), activates with keys

## Run it

```bash
npm install
npx wrangler d1 create kfc-catalog        # once; put the id in wrangler.jsonc
node seed/generate.mjs                    # crawl JSON + synth → seed/seed.sql
npm run migrate:local && npm run seed:local
npm run dev                               # http://127.0.0.1:8787
npm run test:api                          # 34 end-to-end assertions
npx wrangler deploy                       # + migrate:remote + seed:remote
```

## Tests
`test/api-test.mjs` — 34 assertions covering menu, rec constraints/latency, signal toggles,
promo math, order lifecycle, loyalty, telemetry cursor, admin surfaces, live agent turn with
grounded tool calls. Run against local or prod (`node test/api-test.mjs <url>`).
`test/chat-probe.mjs` — agent reliability probe (tool usage, language, latency per turn).
