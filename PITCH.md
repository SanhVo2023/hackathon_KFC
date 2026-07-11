# Pitch & Demo Script — KFC Kiosk Agent

**Round 1: 3 min pitch + 1 min Q&A.** Open the desktop view (`/`) full-screen on the 4K display before starting.

## 0:00 — Hook (20s)
> "KFC Vietnam runs 250+ stores of kiosks that show the same static menu to everyone —
> marketing hand-picks the 'you may also like' box once a month. KFC estimates 15–20% of
> order value is being left on the table. We built the agentic layer that captures it —
> and you can watch it think, live, on this diagram."

## 0:20 — P2 demo: the rec moment (60s)
On the kiosk (left): tap start → dine-in → add **Combo 1 Miếng Gà**.
- The golden **AI sheet** slides up: "83% khách chọn món giống bạn cũng thêm…"
- Point right: the diagram just pulsed Kiosk → Worker → **Rec Engine → D1 → Workers AI**.
- Say: "Six signals — real co-occurrence from POS baskets, affinity rules, it's 8pm so
  dinner items boost, tonight's promo calendar, margin, popularity. Scored in 70 milliseconds,
  the pitch line written by gpt-oss-120b with a hard timeout so the kiosk never lags."
- Accept the Pepsi → header stat "REC ACCEPT" ticks.

## 1:20 — P4 demo: conversational ordering + human handoff (60s)
Open **Trợ lý AI** on the kiosk, type: *"Có khuyến mãi gì tối nay không?"* → grounded answer
with tonight's real promos (watch Agent Loop → D1 → LLM pulse).
Then: *"Tôi bị dị ứng đậu phộng, cho tôi gặp nhân viên"* →
- Agent escalates → **CS/Sales node pulses green** → banner: "Nhân viên Ngọc Trâm đang hỗ trợ."
- Switch to `/admin` → Hỗ trợ khách: the conversation is there; reply as staff → it appears
  on the kiosk. "Human-in-the-loop is built in — the agent knows what it shouldn't handle."

## 2:20 — Per-store intelligence + the business case (40s)
Open `/admin` → AI Gợi ý → **Chạy thử gợi ý (what-if simulator)**:
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
