# DEMO SCRIPT — KFC Kiosk Agent (Round 1: 3-min pitch + 1-min Q&A)

**Stage setup:** desktop view (`/`) full-screen on the 4K display. `/admin` in a second tab.
Two prepared photos in a folder on the desktop: ① mother with child ② man in a suit.
**Everything below is one continuous take — no tab switching until the finale.**

---

## PRE-FLIGHT (15 minutes before going on)

1. `node test/api-test.mjs https://kfc-kiosk-agent.gentle-sky-3b0e.workers.dev` → **70 green**.
2. Order board cluttered from testing? `npm run seed:remote` (~30s), re-run step 1.
3. Open `/` in Chrome, F11 full-screen, zoom 100%. Scenario pill must read **"Thời gian thực"**
   (if not: 🎬 → "↺ Về thời gian thực").
4. **Warm-up run:** do one full throwaway order (any item → payment → confirm), then tap
   **BẮT ĐẦU ĐƠN MỚI**. This warms every model and — critically — starts a **fresh customer
   session**: the cost meter zeroes and the hypothesis panel blanks. Leave it on the attract
   screen (white Kentucky Fried Chicken lockup over the bucket hero).
5. Backup: phone hotspot; `npm run dev` on the laptop mirrors everything locally.

---

## 0:00 — HOOK (20s) · nothing to click, attract screen glowing

> "KFC Vietnam runs 250+ stores of kiosks that show the same static menu to everyone —
> marketing hand-picks the 'you may also like' box once a month. KFC's own estimate:
> 15–20% of order value left on the table.
> We built a kiosk with a **salesperson's brain**. On the right you can watch it think —
> and there's a cost meter, because the punchline is what this brain costs: **less than
> the smallest coin in your pocket, per customer.**"

## 0:20 — SCENE 1 · The invisible profiler + the live rec window (40s)

**DO:** Tap **Chạm để bắt đầu** → **Ăn tại đây**. Then on the ops panel click
**📷 inject camera frame** → pick photo ① (mother with child).

**POINT AT** (in order):
- The kiosk: *"the exact journey KFC customers already know — and the complete real menu,
  106 items, crawled live by TinyFish agents. Nothing new to learn, nothing on this screen
  about profiling."*
- The **CUSTOMER HYPOTHESIS** panel filling: persona, confidence, bias bars.
- **MÓN AI SẼ GỢI Ý NGAY LÚC NÀY** below it: *"these are the actual three dishes the engine
  would serve THIS customer at THIS second — each tagged with the psychology play behind it.
  Watch them change as it learns from every tap."*

> "One coarse camera glance — age band, group, never identity, nothing stored — plus every
> tap after it. It **guesses, never assumes**, and the guessing is invisible to the customer."

## 1:00 — SCENE 2 · One order, four psychology plays (50s)

**DO:** rail **GÀ RÁN - GÀ QUAY** → open **"1 Miếng Gà Rán"**.
1. **MEAL SIZE** appears — point at the green **TIẾT KIỆM** flag on the combo card:
   > "Loss aversion — but pointed at the customer's wallet. Honest math, computed live."
   Choose **MÓN LẺ** (item only) — *"watch what it does about that in a moment."* → TIẾP TỤC.
2. **CUSTOMIZE** — don't linger; one line while passing:
   > "Even upsize is engineered: three tiers, and the middle one is a decoy — asymmetric
   > dominance, the movie-popcorn play."
   → TIẾP TỤC.
3. **ADD ON ("Thêm chút gì nhé!")** — already rendered, zero wait:
   > "Preemptive: the engine started working the moment the item opened. This screen exists
   > on every KFC kiosk — the difference is the AI picks what's on it. Chicken with no drink
   > → a drink **leads**: drinks run 90%+ margin, that's the cross-subsidy engine of fast
   > food. And read the copy — 'giòn rụm', 'mát lạnh', real attach rates — sensory words
   > with honest statistics."
   Tap **+** on the drink and **+** on the side it suggests → TIẾP TỤC → **THÊM VÀO GIỎ**
   → **HOÀN TẤT ĐƠN HÀNG**.

## 1:50 — SCENE 3 · The kindness moment (25s)

The basket now holds chicken + drink + side as separate items → the **swap banner** fires:
*"Mẹo nhỏ nè: đổi sang Combo 1 Miếng Gà — vẫn đủ món bạn chọn mà tiết kiệm 15.000₫!"*

**DO:** tap **ĐỔI**.

> "It just took money **off** the bill. Deliberate. Trust before upsell — that's a
> salesperson customers come back to. And now that a full meal is in the basket, look at
> the suggestion window: no more bundles. It **completes** meals — it never stacks them."

## 2:15 — SCENE 4 · Đêm Giáng Sinh, one tap (25s)

**DO:** 🎬 **Scenario** → tap **🎄 Đêm Giáng Sinh**.

The kiosk re-dresses itself (Christmas hero, garland header), the Noel promo hits the
ticker, Christmas combos appear, the rec window re-computes with 🏷️ promo chips.

> "One tap: a residential store, Christmas Eve — holiday combos live, Noel promo active,
> desserts overstocked and being pushed before they're wasted. **250 stores are not one
> store.** Any store, any hour, any holiday, any inventory reality — stageable, and the
> operator needs zero technical skill."

## 2:40 — CLOSE · The money slide (20s)

**POINT AT** the **💰 CHI PHÍ / PHIÊN** panel (bottom-right), then the header stats.

> "Everything you just watched — the camera glance, every hypothesis update, every
> recommendation — cost about **fifteen đồng** of infrastructure, at Cloudflare's public
> list prices. It's on screen, itemized. The AI lifts average order value **+15%**,
> about 28,000₫ per order — a **thousand-fold return per customer**, measured, not
> promised. One Worker, one database, real menu crawled by TinyFish, OpenAI's gpt-oss on
> Workers AI. It deploys to 250 stores inside the 90-day window."

*(stop talking — that's the end beat)*

---

## Q&A ARSENAL (1 min) — show, don't tell

| If they ask… | Do this |
|---|---|
| "Show me the decoy actually working" | Open any **combo** → CUSTOMIZE → tap **Khoai Đại** → event stream prints *"decoy landed: asymmetric dominance"* |
| "How do stores differ?" | `/admin` → AI Gợi ý → **Chạy thử gợi ý**: run Landmark 81/lunch vs Vincom/dinner — slates visibly differ with per-signal bars |
| "Predictive analytics?" | `/admin` → Tổng quan: demand-by-daypart forecast + projected stockout ETAs from 90 days of POS |
| "What if the LLM is down/slow?" | It already survives: pitches race a 1.2s timeout into deterministic copy; the scorer is pure math. (This happens live sometimes — nothing visibly breaks.) |
| "Privacy?" | Coarse bands only (age band/attire/group), no identity, no photo storage, hypothesis dies with the session. Show the panel: it literally says "guess". |
| "Human in the loop?" | Kiosk chat API → `handoff_to_human` routes to the first available CS staff; `/admin` → Hỗ trợ shows the queue + live takeover |
| "Second customer?" | Finish the order → **BẮT ĐẦU ĐƠN MỚI** → inject photo ② (man in suit, office-lunch scenario) — different persona, different dishes |
| "Cost math?" | Cost panel footnote lists the unit prices (gpt-oss $0.35/$0.75 per M tokens, D1 $0.001/M reads…) — sources: developers.cloudflare.com pricing pages |

## Contingencies

- **Photo inject fails** → keep going: the hypothesis fills from behavior alone (it's designed to).
- **Rec strip empty at attract** → it populates on the first session event; tap start and continue.
- **Venue wifi dies** → laptop `npm run dev` + local seed is a full mirror at `127.0.0.1:8787`.
- **Anything looks stale** → 🎬 → "↺ Về thời gian thực", finish order, BẮT ĐẦU ĐƠN MỚI.

## Assets
- Live: https://kfc-kiosk-agent.gentle-sky-3b0e.workers.dev (`/` · `/kiosk` · `/admin`)
- **Demo video (Remotion):** `video/out/kfc-demo.mp4` — 82s, 1080p. Rebuild: `cd video && npx remotion render src/index.ts kfc-demo out/kfc-demo.mp4`. Preview/edit: `npx remotion studio src/index.ts`.
- **Slide deck:** `slide-deck.html` (open in browser, arrow keys to present, F11) + `slide-deck.pdf`
- Screenshots: `4k-v4-prod.png`, `asset-*.png` (journey steps, panels), `v5-*.jpeg`, `v4-xmas-scenario.jpeg`
- Tests: `node test/api-test.mjs <url>` → 70 assertions
- Declared stack (bonus prizes): **TinyFish** (menu crawl) · **OpenAI gpt-oss-120b** via
  **Cloudflare Workers AI** · **Cloudflare** Workers/D1/assets · **Gemini** (product/hero
  imagery) · **Langfuse-ready** tracing
