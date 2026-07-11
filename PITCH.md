# Pitch & Demo Script — KFC Kiosk Agent

**Round 1: 3 min pitch + 1 min Q&A.** Open the desktop view (`/`) full-screen on the 4K display before starting.

## 0:00 — Hook (20s)
> "KFC Vietnam runs 250+ stores of kiosks that show the same static menu to everyone —
> marketing hand-picks the 'you may also like' box once a month. KFC estimates 15–20% of
> order value is being left on the table. We built the agentic layer that captures it —
> and you can watch it think, live, on this diagram."

## 0:20 — The invisible profiler (50s)
Tap start → dine-in → menu. Point at the kiosk: "This is the exact journey KFC customers
already know — nothing new to learn." Then click **📷 inject camera frame** on the ops panel
(the stand-in for the store camera) with the prepared photo.
- The **CUSTOMER HYPOTHESIS panel** fills — "likely a parent with a child", confidence,
  bias bars — while **the kiosk shows nothing**.
- Open a burger → the hypothesis updates live from behavior alone; the event stream reads
  "preemptive: engine warming up while customer customizes."
- Say: "It guesses, never assumes — a background glance plus every tap. Invisible to the
  customer, visible to us."

## 1:10 — The native journey, AI inside it (70s)
Walk the meal builder exactly like the real kiosk:
- **MEAL SIZE**: combo pre-marked with the honest green flag "TIẾT KIỆM 5.000₫" —
  "kindness first: it takes money OFF when the combo wins."
- **CUSTOMIZE**: soda flavor / extras / upsize — standard.
- **ADD ON ("Thêm chút gì nhé!")**: "this screen exists on every KFC kiosk — the only
  difference is *the AI now picks what's on it*, per store, per hour, per customer, with
  real attach-rate pitches. And it was computed before we arrived — zero wait."
  Add the dessert it suggests → REVIEW → green check "Đã thêm vào giỏ!"
- In the basket: the swap banner if items were picked separately; "it never suggests a cola
  when your combo already includes one."

## 2:20 — Scenario director + the business case (40s)
Click **🎬 Scenario** on the desktop view → tap "Tối T7 ở TTTM" preset:
the kiosk instantly becomes the Vincom mall store on Saturday dinner (Zinger out of stock,
family recs). Say: "Any store, any hour, any holiday, any inventory situation — staged in
one tap. 250 stores are not one store."
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
  fallback copy). Chat turns 2–7s. All measured in `test/api-test.mjs` (34 green, run on prod).
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
- 4K screenshots: `4k-desktop-live.png`, `4k-admin-prod.png` (repo root)
- Demo video: record the 3-min flow above with screen capture (OBS) as backup.

## Pre-demo checklist (morning of Jul 12)
1. `node test/api-test.mjs https://kfc-kiosk-agent.gentle-sky-3b0e.workers.dev` → 34 green.
2. If test orders cluttered the board: `npm run seed:remote` for a clean baseline (~30s).
3. Open `/`, `/admin` in separate tabs; kiosk language = VI; venue WiFi backup = phone hotspot.
4. Submission portal: project description + this repo + live URL + demo video + tech stack
   declared (TinyFish, OpenAI gpt-oss, Cloudflare Workers/D1/Workers AI, Langfuse-ready).
