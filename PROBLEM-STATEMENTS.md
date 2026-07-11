# Your 6 Locked Problem Statements — Full Detail
Crawled from the AABW Builder Hub portal (aitalent.genaifund.ai) on 2026-07-11, logged in as Sanh Vo (thachsanhoracle@gmail.com).
Project: **"Customer data Agentic layer"** (draft) — targets all 6 statements below.

Track prize note (from portal API): **Retail track prize = "Up to USD 50K PoC for selected teams with deployable solutions."** F&B prize TBA at Kick-Off.

---

## F&B Track (KFC) — P2: AI-powered product recommendation engine for self-ordering kiosks
URL: /tracks/fnb/kiosk-recommendations

**Summary:** Kiosks show static menus and manually curated suggestions, missing real-time upsell and cross-sell opportunities based on context and current basket.

**Problem statement:** KFC Vietnam operates 250+ restaurants with self-ordering kiosks serving millions of customers monthly. Kiosks currently display static menus with no personalization. Customers are not prompted with relevant upsell or cross-sell suggestions based on order context such as time of day, current selection, or combo affinity. This creates missed revenue opportunities and a suboptimal ordering experience. KFC estimates 15-20% potential uplift in average order value if relevant recommendations are surfaced at the right moment in the ordering journey.

**Relevant AI technologies:** Generative AI. Predictive Analytics / Forecasting. Recommendation Systems / Personalization.

**Expected outcomes / success metrics:** Increase Average Order Value by 10-15% through contextual upsell and cross-sell at kiosk.

**Current solutions:** Kiosks currently display a static "You may also like" section manually curated by the marketing team and updated monthly. There is no real-time personalization; recommendations are identical for all customers regardless of time of day, current selections, or location.

**Target users / teams impacted:**
- End customers across 250+ KFC Vietnam restaurants get a faster and more relevant ordering experience.
- Marketing gains a dynamic, data-driven upsell channel replacing manual curation.
- Operations and restaurant teams can increase AOV without additional staff effort.

**Data availability & readiness:**
- POS transaction records: item-level order history across 250+ restaurants.
- Menu catalog: structured product data including categories, pricing, combos, and nutritional info in a relational database.
- Contextual signals: restaurant location, time of day, day of week, and current promotional calendar.

**Integration/deployment:** The recommendation engine must integrate with the existing self-ordering kiosk platform.

**BUILD DIRECTION:** Build a contextual recommendation engine that uses item-level order history, menu catalog, location, time, promotions, and cart context to recommend relevant products.

---

## F&B Track (KFC) — P4: AI-powered conversational ordering via chat
URL: /tracks/fnb/conversational-ordering

**Summary:** Customers engage through messaging apps, but ordering requires them to switch to another app or website, creating drop-off and extra staff work.

**Problem statement:** KFC Vietnam customers increasingly prefer messaging apps such as Facebook Messenger and Zalo as their primary communication channel, yet the current ordering flow forces them to switch to a separate app or website. There is no conversational ordering experience. Customers cannot place orders, apply vouchers, or check loyalty points through natural language chat. This creates friction in the ordering journey and causes lost conversion opportunities from high-intent customers who are already engaged in chat.

**Relevant AI technologies:** Generative AI. Voice AI. Conversational AI / Chatbots.

**Expected outcomes / success metrics:** Order completion. Voucher application. Natural language understanding accuracy. Loyalty point inquiry. Order by channel.

**Current solutions:** No conversational AI ordering solution exists. Current handling is 100% staff-based.

**Target users / teams impacted:** Customers. Call center staff.

**Data availability & readiness:** APIs are available.

**Integration/deployment:** Messenger. Mobile App. Zalo. OMS. Loyalty integration.

**BUILD DIRECTION:** Build a conversational ordering assistant for channels such as Messenger and Zalo that can place orders, apply vouchers, check loyalty points, and hand off when needed.

---

## Retail Track (Phong Vu) — P1: AI sales agent for e-commerce website/app
URL: /tracks/retail/sales-agent

**Summary:** Online shoppers do not get timely real-time assistance during product discovery, contributing to low conversion and drop-off.

**Problem statement:** Low conversion rate on the Website/App due to a lack of real-time interaction and timely assistance for online shoppers.

**Relevant AI technologies:** Generative AI. Recommendation Systems / Personalization. Search & Knowledge Retrieval. Conversational AI / Chatbots.

**Expected outcomes / success metrics:**
- Increase Website/App Conversion Rate by 15-20% within the first 6 months of deployment.
- Reduce average customer drop-off rate by 20% during the product discovery phase through real-time conversational assistance.
- Offload 40% of basic product inquiries (specs, warranty policies) from the human support team.

**Target users / teams impacted:** Phong Vu online shoppers. Operations and sales teams (offloading basic product and policy inquiries).

**Data availability & readiness:** Structured data required in DB/CSV format. Product specifications. Pricing. Promotional campaigns. Live inventory and stock data.

**Integration/deployment:** Seamless integration with the existing e-commerce backend to dynamically query live data such as price, stock, and promotions, and trigger core actions such as auto-add to cart or direct checkout.

**Tags:** AI, Automation, Chatbot, Web, Mobile

**BUILD DIRECTION:** Build a conversational sales agent that can answer product questions, retrieve stock, price and promotion data, compare products, and guide checkout.

---

## Retail Track (Phong Vu) — P2: Omnichannel personalized recommendation and smart cross/up-sell engine
URL: /tracks/retail/personalized-recommendations

**Summary:** Customer experiences are generic because behavioral and purchase data is not optimized into real-time personalized bundles and recommendations.

**Problem statement:** Online customer experiences are generic and lack personalization due to unoptimized behavioral data, leading to missed opportunities for intelligent, automated cross-selling and up-selling that could optimize Average Order Value.

**Relevant AI technologies:** Recommendation Systems / Personalization. Generative AI. Conversational AI / Chatbots. Data Analytics.

**Expected outcomes / success metrics:**
- Increase Average Order Value by 12-15% within 6 months via real-time customized product bundling and accessory recommendations.
- Boost customer retention and repeat purchase rates by 10% by replacing static product grids with behavior-driven, individual shopping profiles.
- Achieve a 30% increase in recommendation engagement across homepage, listing block, and cart touchpoints via deep Customer Data Platform synchronization.

**Target users / teams impacted:** Existing and returning Phong Vu online shoppers. CRM, Growth, Marketing, and Commercial teams enabling precision targeting and automated combo strategies.

**Data availability & readiness:** Customer Data Platform integration. Clickstream and user behavior tracking data. Historical purchase profiles. Product category relationships. Active combo deals.

**Integration/deployment:** Integration connecting the Recommendation Engine, the CDP system, and the e-commerce checkout/cart system to dynamically update layouts and apply smart discounts in real time.

**Tags:** AI, Personalization, Data Analytics, Automation, Web, Mobile

**BUILD DIRECTION:** Build a recommendation engine that uses customer behavior, purchase history, product relationships, active deals, and cart context to recommend products and bundles.

---

## Retail Track (Phong Vu) — P3: AI copilot for omnichannel sales and customer support
URL: /tracks/retail/social-commerce-copilot

**Summary:** Sales and support teams are overloaded managing multi-channel social commerce conversations across chat platforms.

**Problem statement:** Sales and support team efficiency is low, and agents face severe overload when managing multi-channel customer conversations across social commerce platforms.

**Relevant AI technologies:** Conversational AI / Chatbots. Generative AI. NLP. Automation.

**Expected outcomes / success metrics:**
- Reduce average agent response time by 50% via AI-generated smart replies and auto-drafted product answers.
- Increase sales team ticket-handling capacity by 40% without adding headcount.
- Improve customer satisfaction scores by 15% due to faster and more accurate resolutions on social channels.

**Target users / teams impacted:** Telesales. Social Commerce Sales. Customer Support teams. Online shoppers on social channels such as Facebook and Zalo.

**Data availability & readiness:** Live chat streams and webhooks. Historical chat logs for training. Product Knowledge Base. FAQ documents. Internal Order/CRM APIs.

**Integration/deployment:** Integration with Social Media APIs such as Meta and Zalo, and internal CRM/Omnichannel chat management tools, to display real-time AI reply suggestions directly to agents.

**Tags:** AI, Automation, Chatbot, NLP, Enterprise

**BUILD DIRECTION:** Build an agent-assist copilot that drafts product answers, suggests replies, searches policy/product knowledge, and integrates with social and CRM workflows.

---

## Retail Track (Phong Vu) — P4: Generative AI-powered self-service business intelligence
URL: /tracks/retail/self-service-bi

**Summary:** Business teams wait on Data/IT for reports, delaying decisions and creating a recurring analytics bottleneck.

**Problem statement:** The traditional BI/Reporting system creates a critical bottleneck within the Data/IT team, delaying insights and failing to support the business team's need for rapid decision-making.

**Relevant AI technologies:** Search & Knowledge Retrieval. Generative AI. Data Analytics. NLP.

**Expected outcomes / success metrics:**
- Reduce report generation turnaround time by 70% by enabling business users to query data using natural language.
- Decrease ad-hoc data requests to the IT/Data team by 50%, freeing them for complex infrastructure tasks.
- Increase daily data-driven decision frequency among business and commercial managers due to instant dashboard updates.

**Target users / teams impacted:** Business leaders. Commercial managers. Marketing Operations teams. Data Analysts and IT Engineering teams relieved from routine reporting tasks.

**Data availability & readiness:** Securely structured Data Warehouse tables. Analytical databases. Clear data dictionaries and metadata schemas. Query access permissions.

**Integration/deployment:** Secure integration with the internal corporate Data Warehouse (e.g., BigQuery, Snowflake, or localized databases) via an AI-to-SQL orchestration layer with strict role-based access control.

**Tags:** AI, Data Analytics, Enterprise, Automation, NLP

**BUILD DIRECTION:** Build a secure natural-language analytics layer that converts business questions into governed queries, explanations, and dashboards.

---

## Non-selected F&B statements (context, from portal API)
- **P1 Recurring payment processing (250+ store QSR chain):** ~300 recurring payment requests/month; replace paper-based 5-level approval chain with digital workflow; cut cycle time ~80%. For Accounting/Finance teams.
- **P3 Sales forecasting and anomaly detection for restaurant performance.**
