# AI Documentation — KFC Kiosk Agent

*Submission requirement: which Agentic AI models/tools are used and how they work within the
solution. Agentic AI is the CORE of this build, not a supporting feature.*

## Models

| Model | Where it runs | Role |
|---|---|---|
| **OpenAI gpt-oss-120b** | Cloudflare Workers AI (`@cf/openai/gpt-oss-120b`, Responses API) | The ordering agent's reasoning + tool-calling loop (P4), and the recommendation pitch writer (P2) |
| **meta llama-3.3-70b-instruct-fp8-fast** | Cloudflare Workers AI | Fallback agent model (set `WA_MODEL` to switch); validated end-to-end |
| **OpenAI gpt-4.1-mini** | OpenAI API (optional) | Drop-in primary if `OPENAI_API_KEY` secret is set — the code carries a dual adapter |

## 1. The ordering agent (P4) — `src/agent.ts`

A classic agentic loop, not a prompt wrapper:

1. System prompt defines the role (KFC kiosk assistant, VN/EN), **grounding rules**
   ("answer ONLY from tool results"), sales behavior (exactly one upsell after a main lands),
   and confirmation gates (confirm before `add_to_cart`, explicit consent before `place_order`).
2. Cart state + current daypart are injected as session metadata.
3. Up to **6 reasoning steps**: the model chooses tools, the Worker executes them against D1,
   results are fed back, and the model continues until it produces a customer-facing answer.
   If the loop ends tool-hungry, a forced no-tools synthesis pass writes the final reply.
4. **9 tools** (`src/tools.ts`), all D1-grounded — `search_menu` (Vietnamese diacritic-folded
   search), `get_item`, `recommend_upsell`, `get_active_promotions` (daypart/day-of-week aware),
   `apply_voucher` (validates constraints, computes discount), `check_loyalty`, `add_to_cart`
   (emits a UI effect the kiosk applies to its real cart), `place_order` (persists to D1,
   accrues loyalty points), `handoff_to_human`.
5. **Human-in-the-loop:** `handoff_to_human` inserts a queue row routed to the first available
   CS/sales staff member. While a handoff is pending/active the chat endpoint bypasses the
   agent entirely and relays messages between customer and staff; on "resolved" the agent
   resumes. This is the production-realistic escalation path (allergies, complaints, refunds).

gpt-oss-120b is driven through the **OpenAI Responses API surface** on Workers AI:
conversation history maps to `input` items, tools are flattened function definitions,
`function_call` output items are executed and returned as `function_call_output` items.
Typical turn latency: **2–7s** including tool round-trips (measured by `test/chat-probe.mjs`).

## 2. The recommendation engine (P2) — `src/recs.ts`

A two-layer design so the kiosk moment is fast, explainable, and still generative:

- **Layer 1 — deterministic 7-signal scorer** (~70ms, one D1 batch): co-occurrence from
  9,000 POS baskets precomputed per **store cluster × daypart** (each of KFC's 250+ sites maps
  to a cluster: mall / office / residential / tourist — so every kiosk is tailored to its
  store's actual demand patterns), affinity rules, daypart fit with weekend/holiday boost,
  active promo boost, **inventory posture** (pushes overstocked items, protects near-stockout,
  never recommends what the store doesn't have), margin, and POS-derived popularity. Weights
  are admin-configurable; disabled signals are zeroed and the rest renormalized. Constraints:
  exclude cart items and the anchor's own category, addon ≤ price cap, max one item per
  category in the slate. Every slate ships with a per-signal score breakdown (visible in
  telemetry and the admin what-if simulator — the AI is auditable, not a black box). Pitch
  stats are honest attach rates: P(addon | anchor basket) within the store's cluster.
- **Layer 2 — LLM voice:** gpt-oss-120b turns the top-3 (with their statistical reasons and
  active promos) into short bilingual appetite-driven pitch lines, `Promise.race`d against a
  **1.2s timeout**; on timeout the customer sees deterministic copy built from the same data.
  The kiosk never waits on a slow LLM.

The same engine serves the kiosk's rec moments (`POST /api/recommend`) and the agent's
`recommend_upsell` tool — one brain, two channels.

**Measurement loop:** every impression → `rec_events`; accepts/dismissals → feedback endpoint;
accepted-item revenue → `orders.rec_attributed`. The admin overview computes
**AOV(with-rec) vs AOV(without-rec)** — the exact success metric in KFC's problem statement.

## 3. Agentic tooling used to BUILD the project

- **TinyFish CLI** (`tinyfish agent run`): an autonomous browser agent crawled the real KFC
  Vietnam menu (names, prices, official image URLs) where plain fetching was bot-blocked.
  Raw output: `seed/crawl-menu.json` (run `7305956e-...`, agent.tinyfish.ai).
- **Claude Code (Fable 5)** orchestrated the build: planning, code, Playwright-driven UI
  verification at 4K, and a 34-assertion API test suite run against local and production.

## 4. Observability of the AI (the desktop view)

Every LLM call, tool call, rec scoring pass, D1 query, handoff and staff reply is a telemetry
event (batched, non-blocking). The `/` desktop view renders the architecture as a live SVG —
edges pulse per event (gold = AI activity, red = customer, green = human), with a full event
stream beside it. `src/langfuse.ts` additionally ships a zero-SDK Langfuse ingestion client
(trace + span per tool step) that activates the moment keys are provided.

## 5. Honest-data statement

Menu data is really crawled from kfcvietnam.com.vn. POS history, promotions, loyalty
members, and baseline orders are synthetic (permitted: "crawled or synthetic"). The baseline
AOV comparison uses stratified assignment (matched base-order distributions; AI addons
strictly additive) so the reported ~15% uplift is a fair counterfactual within synthetic
data — deliberately inside KFC's own 10–15% projection, not an inflated demo number.
