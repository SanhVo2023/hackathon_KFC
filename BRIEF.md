# KFC F&B Track — Agent Working Folder
Self-contained brief for the F&B (KFC Vietnam) track of Agentic AI Build Week 2026.
Team's locked problem statements: **P2 (kiosk recommendations)** and **P4 (conversational ordering)**.
Deadline: **Jul 12, 9:00 AM ICT** via portal aitalent.genaifund.ai. Judging: production-readiness — technical implementation, solution quality to the enterprise problem, deployment feasibility, business impact, pitch clarity. Agentic AI must be a CORE component. Submission needs: description, demo video + live URL, AI documentation, source repo, track/problem targets, declared tech stack (bonus prizes tied to tools — TinyFish $20K/track, OpenAI $150K pool, Langfuse plans, Tencent $150K credits, etc.).

Track context: "KFC Vietnam's challenge areas cover finance automation, kiosk personalization, restaurant performance forecasting, and conversational ordering across messaging channels." (250+ QSR stores.)

---

## P2: AI-powered product recommendation engine for self-ordering kiosks

**Summary:** Kiosks show static menus and manually curated suggestions, missing real-time upsell and cross-sell opportunities based on context and current basket.

**Problem statement:** KFC Vietnam operates 250+ restaurants with self-ordering kiosks serving millions of customers monthly. Kiosks currently display static menus with no personalization. Customers are not prompted with relevant upsell or cross-sell suggestions based on order context such as time of day, current selection, or combo affinity. This creates missed revenue opportunities and a suboptimal ordering experience. KFC estimates 15-20% potential uplift in average order value if relevant recommendations are surfaced at the right moment in the ordering journey.

**Relevant AI technologies:** Generative AI. Predictive Analytics / Forecasting. Recommendation Systems / Personalization.

**Success metric:** Increase Average Order Value by 10-15% through contextual upsell and cross-sell at kiosk.

**Current solution:** Static "You may also like" section manually curated by marketing, updated monthly. No real-time personalization; identical for all customers regardless of time of day, selections, or location.

**Target users:** End customers across 250+ restaurants (faster, more relevant ordering); Marketing (dynamic data-driven upsell channel replacing manual curation); Operations (increase AOV without staff effort).

**Data available:** POS transaction records (item-level order history across 250+ restaurants); Menu catalog (structured product data: categories, pricing, combos, nutritional info in relational DB); Contextual signals (restaurant location, time of day, day of week, promotional calendar).

**Integration requirement:** Must integrate with the existing self-ordering kiosk platform.

**OFFICIAL BUILD DIRECTION:** Build a contextual recommendation engine that uses item-level order history, menu catalog, location, time, promotions, and cart context to recommend relevant products.

---

## P4: AI-powered conversational ordering via chat

**Summary:** Customers engage through messaging apps, but ordering requires them to switch to another app or website, creating drop-off and extra staff work.

**Problem statement:** KFC Vietnam customers increasingly prefer messaging apps such as Facebook Messenger and Zalo as their primary communication channel, yet the current ordering flow forces them to switch to a separate app or website. There is no conversational ordering experience. Customers cannot place orders, apply vouchers, or check loyalty points through natural language chat. This creates friction in the ordering journey and causes lost conversion opportunities from high-intent customers who are already engaged in chat.

**Relevant AI technologies:** Generative AI. Voice AI. Conversational AI / Chatbots.

**Success metrics:** Order completion. Voucher application. Natural language understanding accuracy. Loyalty point inquiry. Order by channel.

**Current solution:** None — handling is 100% staff-based.

**Target users:** Customers. Call center staff.

**Data available:** APIs are available.

**Integration requirements:** Messenger. Mobile App. Zalo. OMS. Loyalty integration.

**OFFICIAL BUILD DIRECTION:** Build a conversational ordering assistant for channels such as Messenger and Zalo that can place orders, apply vouchers, check loyalty points, and hand off when needed.

---

## Team architecture note (shared with Phong Vu build)
The Phong Vu build (in `../phongvu-agent/`) is a Cloudflare Worker: agent loop + tool-use (OpenAI/Workers AI), D1 catalog, TinyFish-crawled data, Langfuse tracing, widget injected into the retailer's site via reverse proxy. The same "customer-data agentic layer" core can be re-skinned for KFC P4 (menu catalog in D1 + ordering/voucher/loyalty tools + chat widget styled as Messenger/Zalo) and P2 (recommend_addons tool = basket-context combo recommendations with time-of-day signals). Reuse, don't rebuild: synthetic KFC menu + order history data is acceptable ("data must be crawled or synthetic").
