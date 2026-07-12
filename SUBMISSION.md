# Submission form content — copy-paste per field

## Project title
KFC Kiosk Agent — Agentic Customer Experience

## Elevator pitch
**A kiosk with a salesperson's brain.** An invisible agent guesses who's ordering, sells with buyer psychology — kindness first — and lifts average order value **+15%** for **13₫ (~$0.0005)** of AI per customer. Live in production on Cloudflare, running KFC Vietnam's complete real menu.

## Demo URL
https://kfc-kiosk-agent.gentle-sky-3b0e.workers.dev

## GitHub / repository URL
https://github.com/SanhVo2023/hackathon_KFC

## Video demo link
Upload `video/out/kfc-demo-real.mp4` to YouTube (unlisted) and paste the link here.

## Image gallery (from repo root, in this order)
1. `4k-v4-prod.png` — the 4K live system view
2. `asset-addon.png` — drink-led ADD ON with sensory pitches
3. `asset-swap.png` — the kindness swap taking money off the bill
4. `asset-hypothesis.png` — the customer hypothesis panel
5. `v4-xmas-scenario.jpeg` — one-tap Christmas scenario
6. `v5-cost-panel.jpeg` — the per-session cost meter + ROI
7. `asset-attract.png` — the food-first attract screen
8. `v5-attract-white-logo.jpeg` — white brand lockup

## Built with (tags)
Cloudflare Workers · Cloudflare D1 · Cloudflare Workers AI · OpenAI gpt-oss-120b · Meta Llama 3.2 Vision · Meta Llama 3.1 · TinyFish · Google Gemini · TypeScript · JavaScript · Playwright · Remotion · Langfuse (tracing-ready)

---

# About the project (Project Story)

## Inspiration
KFC Vietnam's brief was blunt: 250+ stores of kiosks show everyone the same static menu, the "you may also like" box is hand-picked by marketing **once a month**, and 15–20% of order value is left on the table. We paired that brief with a deep-dive into menu-engineering research (Kasavana–Smith matrix, decoy pricing, QSR margin structure — drinks run 90%+ margin) and landed on one conviction: **kiosk upsell fails when it feels like a slot machine.** The best salesperson earns trust first. So we built an agent that sells the way a great staff member does — it saves the customer money before it ever upsells.

## What it does
A production-deployed self-order kiosk where an agentic layer works **invisibly inside the exact journey KFC customers already know** — nothing new to learn:

- **Customer Hypothesis Agent** — one coarse camera glance at check-in (age band, group; never identity, nothing stored) plus every tap and the live cart feed a continuously revised persona with confidence: *"a mother and her child → a dessert to complete the meal."*
- **Recommendation engine at all 7 journey moments** — attract (hot dish of this hour at this store), menu grid (**quietly re-ranks per customer × store × hour**, honest badges only), meal size (real upgrade stat from local POS), add-on (cross-subsidy: chicken with no drink → a drink leads), basket (cheaper-combo swap offered FIRST), checkout (one last-chance chip), confirmation (**comeback voucher aimed at a quiet daypart** — it grows tomorrow's traffic too).
- **Buyer psychology, implemented — not claimed**: cross-subsidization, decoy (asymmetric-dominance) upsize tiers, sensory pitch copy with **honest attach rates**, loss-aversion savings flags. Every suggestion carries a visible strategy label on the ops view.
- **Kindness guardrails the agent enforces on itself**: it takes money OFF the bill when separates match a combo, **stops selling when a meal is complete** (no bundles on bundles), and **rests any item after two unanswered offers** (no-nag).
- **A brain per store**: 250 stores → site clusters (mall/office/residential/tourist), each mining its own basket patterns; live per-store inventory (push overstock, protect stockouts, never suggest sold-out); holiday calendar with a one-tap **Đêm Giáng Sinh** scenario (festive skin, Noel promo, seasonal combos).
- **P4 conversational ordering** — a tool-use agent loop (9 D1-grounded tools: search, vouchers, loyalty, cart, order, human handoff) sharing the same brain, with a live CS/sales handoff queue in admin.
- **A glass box**: every API call, D1 query, LLM call and strategy decision streams to a live system diagram, a customer-hypothesis panel showing the *actual dishes* it would serve right now, and a **cost meter pricing the session at Cloudflare's public list prices**.

**Measured on production:** +15% AOV with-AI vs without (+28,000₫/order, logged counterfactual) · 35% suggestion acceptance · **~13₫ (~$0.0005) infra cost per session ≈ 2,200× return** · rec moment ≤1.5s (scorer ~70ms) · 106 real menu items · **74 automated end-to-end assertions, green on the live URL**.

## How we built it
One **Cloudflare Worker** (TypeScript, no framework, no build step) + **D1** + **Workers AI** + static assets:

- **Deterministic core, generative skin.** An 8-signal scorer (cluster co-occurrence from 9,000 synthetic POS baskets, persona, affinity, daypart/holiday, promos, inventory posture, margin, popularity) picks *what* to recommend in ~70ms; **gpt-oss-120b** only writes the bilingual *voice*, raced against a 1.2s timeout with deterministic sensory copy as fallback — the UX survives total LLM outage.
- **Vision + refinement**: llama-3.2-11b-vision for the coarse check-in glance; llama-3.1-8b-fast (~1.3s, never blocking) revises the hypothesis on every interaction.
- **Real data**: **TinyFish** agents crawled the complete KFC Vietnam menu live (92 items with names, prices, official images); **Gemini** generated the remaining product shots and attract heroes.
- **Observability**: batched telemetry (`ctx.waitUntil`) → D1 → live SVG diagram, event stream, and the per-session cost meter.
- **Demo video**: Remotion compositions over real Playwright screen recordings of the production app.

## Challenges we ran into
- **gpt-oss on Workers AI speaks the Responses API only** — chat `messages` throw AiError 8001. We rebuilt the agent loop around `input` items and flattened function tools.
- **Honest measurement is a design problem**: the AOV counterfactual needed stratified baseline orders, and ops-view probes must never log impressions or the acceptance metric lies.
- **The cart-blindness bug**: a 500k bucket cart was still being pitched a 189k bucket — the fix became a feature (meal-completion mode + a cart-aware profiler whose bias means "what to suggest *next*").
- **Small bugs with big faces**: a vacuously-true token matcher glued an egg-tart photo onto every short-named dish; NFD/NFC Unicode broke the Christmas skin; Playwright can't click a pulsing button; TinyFish's sync long-poll dies while the run quietly completes server-side.

## Accomplishments that we're proud of
Production-ready from hour one: deployed at hour zero, tested continuously (74 E2E assertions on the live URL), and honest everywhere — real menu, real attach rates, labeled strategies, itemized costs. The kindness rules (money off first, stop selling, no-nag) are the part we'd defend hardest: they're why the acceptance rate holds.

## What we learned
Trust is the highest-converting upsell strategy. A deterministic core with a generative voice beats letting the LLM decide everything. Per-store context (cluster, hour, inventory, holiday) matters more than model size. And honest copy — showing customers real numbers — sells better than hype.

## What's next
Nightly POS export integration (the engine already reads plain co-occurrence/popularity tables) · opt-in loyalty-linked memory for returning customers · the same brain on drive-thru voice · per-surface A/B testing of strategies · white-label for any QSR brand.

## Optional links
- Live desktop ops view: https://kfc-kiosk-agent.gentle-sky-3b0e.workers.dev
- Standalone kiosk: https://kfc-kiosk-agent.gentle-sky-3b0e.workers.dev/kiosk
- Admin control center: https://kfc-kiosk-agent.gentle-sky-3b0e.workers.dev/admin
- Pitch deck: `slide-deck.pdf` in the repo · Demo run sheet: `PITCH.md` · AI usage: `AI-DOCUMENTATION.md`

---

# AABW partner tech (last form section)

## Partner tools to select
TinyFish · OpenAI (gpt-oss-120b) · Cloudflare (Workers, D1, Workers AI) · Langfuse (tracing-ready)

## How we used each partner's technology
**TinyFish** — agentic web crawls of kfcvietnam.com.vn: the complete live menu (92 items with Vietnamese names, prices and official images) plus a follow-up 92-image sweep; our seed pipeline ingests TinyFish run output directly, so the kiosk sells the real catalog.
**OpenAI gpt-oss-120b** (served on Cloudflare Workers AI) — powers the P4 conversational ordering agent's tool-use loop (9 D1-grounded tools: menu search, vouchers, loyalty, cart, order, human handoff) via the Responses API, and writes every bilingual sales pitch, raced against a 1.2s timeout with deterministic fallback copy.
**Cloudflare** — the entire runtime: one Worker (TypeScript, no build step), D1 for menu/POS/orders/profiles/telemetry, Workers AI for all inference (gpt-oss-120b + llama-3.2-11b-vision for the camera glance + llama-3.1-8b-fast for hypothesis refinement), and static assets. The ops view prices every customer session live at Cloudflare's public list prices: ~13₫ (~$0.0005) per session.
**Langfuse** — zero-SDK tracing integration ships in the repo (`src/langfuse.ts`) and activates by setting keys; all agent steps are already structured for it.
