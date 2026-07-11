# Pitch & Demo Script — KFC Kiosk Agent

**Round 1: 3 min pitch + 1 min Q&A.** Open the desktop view (`/`) full-screen on the 4K display before starting.

## 0:00 — Hook (20s)
> "KFC Vietnam runs 250+ stores of kiosks that show the same static menu to everyone —
> marketing hand-picks the 'you may also like' box once a month. KFC estimates 15–20% of
> order value is being left on the table. We built the agentic layer that captures it —
> and you can watch it think, live, on this diagram."

## 0:20 — The invisible profiler + the live rec window (50s)
Tap start → dine-in → menu. Point at the kiosk: "This is the exact journey KFC customers
already know — nothing new to learn. And the menu is the *complete* KFC Vietnam menu,
106 items, crawled live by TinyFish agents." Then click **📷 inject camera frame** on the
ops panel (the stand-in for the store camera) with the prepared photo.
- The **CUSTOMER HYPOTHESIS panel** fills — "likely a parent with a child", confidence,
  bias bars — while **the kiosk shows nothing**.
- Point below it: **"MÓN AI SẼ GỢI Ý NGAY LÚC NÀY"** — the actual dishes the engine would
  serve THIS customer right now, each tagged with its psychology play (🥤 Bù chéo lợi nhuận,
  👁 Khớp chân dung…). "Watch these three dishes change as it learns."
- Open a burger → the hypothesis AND the dish slate update live from behavior alone.
- Say: "It guesses, never assumes — a background glance plus every tap. Invisible to the
  customer, visible to us."

## 1:10 — The native journey, buyer psychology inside it (70s)
Walk the meal builder exactly like the real kiosk:
- **MEAL SIZE**: combo pre-marked with the honest green flag "TIẾT KIỆM 5.000₫" —
  "kindness first: loss aversion working FOR the customer."
- **CUSTOMIZE**: soda flavor / extras / **upsize with the decoy**: Vừa +0 / Lớn +10k /
  Đại +12k. "The middle tier exists to make the jumbo the obviously smart choice —
  asymmetric dominance, the same play as movie-theater popcorn. When it lands, the event
  stream says 'decoy landed'."
- **ADD ON ("Thêm chút gì nhé!")**: "this screen exists on every KFC kiosk — the only
  difference is *the AI now picks what's on it*, per store, per hour, per customer, with
  real attach-rate pitches in sensory language — 'giòn rụm', 'mát lạnh' — words that make
  the brain simulate the bite. Computed before we arrived — zero wait."
  Add the dessert it suggests → REVIEW → green check "Đã thêm vào giỏ!"
- In the basket: the swap banner if items were picked separately; "it never suggests a cola
  when your combo already includes one. And if there's chicken but no drink, a drink leads
  the slate — drinks carry >90% margin; that's the cross-subsidy engine of QSR economics."

## 2:20 — Scenario director + the business case (40s)
Click **🎬 Scenario** on the desktop view — three iconic situations, one tap each.
Tap **"Đêm Giáng Sinh"**: the kiosk turns festive (Christmas hero, garland header), the
Noel promo activates, Christmas combos appear, desserts are overstocked and get pushed.
Say: "Any store, any hour, any holiday, any inventory situation — staged in one tap.
250 stores are not one store."
Then open `/admin` → AI Gợi ý → **Chạy thử gợi ý (what-if simulator)**:
> "250 stores are not one store. Same fried-chicken cart: the office tower at lunch gets
> Pepsi + salad; the mall on a Saturday night gets fries + ice cream for the kids. Every
> kiosk mines its own cluster's baskets — and the inventory signal pushes what the store
> has too much of, and never suggests what it's out of."
Run it twice (Landmark 81/lunch vs Vincom/dinner) — slates visibly differ, with per-signal
score bars. Then flip to Tổng quan:
> "Orders with AI recommendations average **+15% higher** — measured, not promised, exactly
> KFC's projected band. 35% acceptance. And the forecast card predicts today's demand per
> daypart and which items stock out first — from the same POS history."

## 2:50 — Close (10s)
> "One Cloudflare Worker, D1, Workers AI — pennies per store per day, deploys in seconds,
> integrates with any kiosk as an API. Menu crawled from kfcvietnam.com.vn by TinyFish agents.
> This is deployable across 250 stores within the 90-day window."

## Q&A ammunition
- **Latency?** Rec moment ≤1.5s (scorer 70ms; LLM raced vs 1.2s timeout with deterministic
  fallback copy). Chat turns 2–7s. All measured in `test/api-test.mjs` (68 green, run on prod).
- **Where's the psychology from?** Menu-engineering literature (Kasavana–Smith), decoy/
  asymmetric-dominance pricing research, QSR margin structure (drinks >90%, fries ~85%).
  Each tactic is implemented and labeled per-rec — not just claimed.
- **Real POS integration?** The engine reads co-occurrence/popularity tables keyed by store
  cluster; a nightly job from any POS export produces them. Menu/promos/loyalty/inventory are
  plain D1 tables mirroring their relational DB.
- **How do 250 stores differ?** Stores map to site clusters (mall/office/residential/tourist);
  each cluster's basket patterns are mined separately. New store = assign a cluster, day one;
  its own data refines it over time. Inventory and 86-ing are already per-store.
- **Hallucination control?** Grounding rule + tools-only data; forced synthesis pass;
  every tool call and its result is on the telemetry stream (and Langfuse-ready).
- **Why not a bigger model?** Dual adapter: set one secret and it runs gpt-4.1 (or any OpenAI
  model). Demoed fully on Workers AI = zero marginal inference cost.
- **Cold start / offline store?** Edge-deployed; D1 read replicas; deterministic fallback
  pitches mean the rec UX survives total LLM outage.
- **Voucher abuse?** apply_voucher validates daypart/day-of-week/min-order server-side.

## Assets
- Live URL: https://kfc-kiosk-agent.gentle-sky-3b0e.workers.dev (also /kiosk, /admin)
- 4K screenshots: `4k-v4-prod.png` (latest), `v4-xmas-scenario.jpeg`, `4k-desktop-live.png`,
  `4k-admin-prod.png` (repo root)
- Demo video: record the 3-min flow above with screen capture (OBS) as backup.

## Pre-demo checklist (morning of Jul 12)
1. `node test/api-test.mjs https://kfc-kiosk-agent.gentle-sky-3b0e.workers.dev` → 68 green.
2. If test orders cluttered the board: `npm run seed:remote` for a clean baseline (~30s).
3. Open `/`, `/admin` in separate tabs; kiosk language = VI; venue WiFi backup = phone hotspot.
4. Submission portal: project description + this repo + live URL + demo video + tech stack
   declared (TinyFish, OpenAI gpt-oss, Cloudflare Workers/D1/Workers AI, Langfuse-ready).
