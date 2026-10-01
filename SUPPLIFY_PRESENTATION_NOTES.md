# Supplify Stakeholder Presentation — Source & Presenter Notes

Generated: 2026-09-30  
Deck: `SUPPLIFY_Stakeholder_Presentation.pptx`  
Format: 16:9 widescreen; editable text and native PowerPoint diagrams

## Positioning

Supplify is presented as a connected operating platform for F&B procurement and supply: a marketplace at the front, with workflow depth through pricing, fulfillment, delivery, receiving, finance, and operational intelligence.

## Evidence standard

- Claims were derived from the current repository, product documentation, registered API/web routes, database migrations, and matching Android/iOS source trees.
- Screenshots were captured from an isolated, locally seeded marketing-demo environment. Values shown are illustrative product data, not customer traction or production metrics.
- No external market statistics, customer logos, customer quotes, competitor metrics, or unsupported ROI figures are used.
- “Implemented” means present in the audited codebase and local demo path. It does not independently certify live customer adoption, production SRE readiness, or third-party provider activation.

## Intentional boundaries

- Delivery, receiving, invoicing, and payment are distinct milestones.
- New baskets do not silently split across arbitrary supplier tenants or warehouses.
- The assistant and intelligence features are read-only; they do not place orders, mutate inventory or pricing, or assign drivers.
- Full central purchasing, action-taking AI, live recurring PSP automation, accounting reconciliation, and advanced route optimization are roadmap or external-production work.
- Public supplier and restaurant-consumer ordering are additional channels; the core story remains B2B procurement and supply operations.

## Slide-by-slide notes

### 01 — Stop running F&B supply across chats, sheets, and guesswork

**Emphasize:** Open with the pain, then position Supplify as the shared operating layer—not only a marketplace.

**Nuance:** This is a product and operating-model overview, not a claim of customer traction. UI screenshots use isolated seeded demo data.

**Transition:** Start with the fragmented reality the platform is designed to replace.

**Repository basis:**
- apps/web/static/brand/supplify-logo.png
- PRODUCT_BUSINESS_LOGIC_AUDIT.md

### 02 — Every order still dies in a group chat

**Emphasize:** The core problem is not lack of screens; it is the absence of one connected operational record across both sides of the transaction.

**Nuance:** Avoid unsupported market-size or efficiency statistics. Keep the point grounded in workflow fragmentation.

**Transition:** Supplify connects those stages into one shared flow.

**Repository basis:**
- PRODUCT_BUSINESS_LOGIC_AUDIT.md — cross-domain business journeys

### 03 — One order. One timeline. One source of truth.

**Emphasize:** The differentiated value is continuity: the same order moves through pricing, fulfillment, delivery, receiving, and finance without being re-created.

**Nuance:** The six stages simplify a wider platform for business communication.

**Transition:** That shared flow serves a multi-actor ecosystem, not one persona.

**Repository basis:**
- apps/api/src/server.js
- apps/web/src/App.tsx
- PRODUCT_BUSINESS_LOGIC_AUDIT.md

### 04 — One ecosystem, role-aware experiences

**Emphasize:** Restaurant teams, supplier teams, warehouse operators, and drivers get purpose-built experiences tied to the same transaction.

**Nuance:** Public restaurant ordering and supplier public catalog are optional channels around the core B2B workflow.

**Transition:** First, see the restaurant experience as a control layer.

**Repository basis:**
- apps/web/src/App.tsx
- C:/myProjects/supplify-mobile/src
- C:/myProjects/supplify-mobile-ios/src

### 05 — Give restaurant teams control—not another shopping cart

**Emphasize:** Supplify starts with easier sourcing and ordering but extends into the disciplines that determine margin and consistency.

**Nuance:** Dashboard values are seeded demo data. Full centralized purchasing across every branch remains a future capability.

**Transition:** The supplier receives the same order as an executable operational commitment.

**Repository basis:**
- apps/web restaurant routes and modules
- presentation_source/assets/screenshots/restaurant-dashboard.png

### 06 — Turn every order into an executable operating plan

**Emphasize:** Supplify gives suppliers an operational command center—not merely a seller listing or order inbox.

**Nuance:** Inventory remains controlled by the operating supplier tenant and warehouse.

**Transition:** The common thread is one order lifecycle with clear state and ownership.

**Repository basis:**
- apps/api supplier routes and services
- presentation_source/assets/screenshots/supplier-command-center.png

### 07 — One order lifecycle—five moments of control

**Emphasize:** Physical delivery, receiving acceptance, invoicing, and payment are separate milestones—not one vague “complete” status.

**Nuance:** Invoices are grounded in accepted receiving quantities. Server-side state transitions and snapshots preserve the record.

**Transition:** This lifecycle stays coherent across branches and warehouses.

**Repository basis:**
- PRODUCT_BUSINESS_LOGIC_AUDIT.md — ordering, fulfillment, receiving, finance

### 08 — Built for organizations—not isolated locations

**Emphasize:** Supplify separates the customer relationship from the tenant and warehouse that operationally own inventory and fulfillment.

**Nuance:** A new basket resolves to one compatible supplier tenant and warehouse. Full central-purchasing orchestration is not complete.

**Transition:** The same discipline applies to price resolution.

**Repository basis:**
- PRODUCT_BUSINESS_LOGIC_AUDIT.md — organization model and cart routing

### 09 — Pricing follows the relationship—then becomes immutable

**Emphasize:** Supplify supports the real B2B hierarchy: catalog, relationship pricing, committed quotes, and promotions.

**Nuance:** Checkout revalidates on the server. The order line becomes a historical snapshot, not a live reference.

**Transition:** Once committed, the order becomes a controlled fulfillment job.

**Repository basis:**
- PRODUCT_BUSINESS_LOGIC_AUDIT.md — pricing hierarchy
- apps/api pricing, quote, promotion, and checkout services

### 10 — The marketplace continues into the warehouse and onto the road

**Emphasize:** Warehouse ownership, fulfillment queues, driver workflow, and proof are part of the product.

**Nuance:** New baskets do not arbitrarily split across tenants or warehouses; legacy assignments can still be read.

**Transition:** Receiving turns physical delivery into accepted operational truth.

**Repository basis:**
- presentation_source/assets/screenshots/supplier-fulfillment.png
- PRODUCT_BUSINESS_LOGIC_AUDIT.md

### 11 — The order becomes an operating data flywheel

**Emphasize:** Strategic value compounds when accepted order data improves inventory, payables, recipe costs, staffing context, and reporting.

**Nuance:** These modules exist, but not every cross-module loop is fully automated.

**Transition:** Selected offers can also extend beyond the authenticated B2B network.

**Repository basis:**
- apps/web/src/App.tsx — restaurant modules
- apps/api/src/server.js

### 12 — A B2B core—with optional public demand channels

**Emphasize:** Public channels widen demand capture while existing operational infrastructure supports downstream handling.

**Nuance:** Restaurant consumer ordering is a separate B2C hospitality loop and remains secondary to the B2B story.

**Transition:** The intelligence layer explains and prioritizes without uncontrolled action.

**Repository basis:**
- apps/api/db/migrations/0223_public_supplier_sales_channel.sql
- presentation_source/assets/screenshots/public-supplier-catalog.png

### 13 — Intelligence that explains the operation before it automates it

**Emphasize:** Current intelligence is deliberately safe: deterministic calculations and a permission-aware, read-only assistant.

**Nuance:** It cannot place orders, mutate stock, set prices, or assign drivers. Action-taking AI is roadmap.

**Transition:** The event system gets the right signals to the right people and channels.

**Repository basis:**
- HANDOVER_INTELLIGENCE.md
- docs/product/four-plan-pricing-model.md

### 14 — Events become coordinated action—not more noise

**Emphasize:** Recipients, preferences, plan features, and configured channels all shape operational communication.

**Nuance:** In-app and realtime are core. External channels depend on environment and configuration.

**Transition:** This workflow depth depends on a deliberate trust layer.

**Repository basis:**
- PRODUCT_BUSINESS_LOGIC_AUDIT.md — notifications
- apps/api notification services

### 15 — Trust is designed into the operating layer

**Emphasize:** Trust layers tenant context, permissions, private asset access, validation, audit, rate limits, and privileged-action safeguards.

**Nuance:** Production security also depends on deployment configuration, credentials, monitoring, and operations.

**Transition:** The same model is delivered through web, mobile, and public channels.

**Repository basis:**
- apps/api/src/middlewares
- apps/api storage, audit, impersonation, and rate-limit services
- docs/architecture/rbac-overview.md

### 16 — One platform, multiple role-aware surfaces

**Emphasize:** Web, Android, and iOS use the same domain model while giving each role an appropriate experience.

**Nuance:** Android and iOS source coverage is structurally aligned. Deployment services remain configuration-dependent.

**Transition:** This architecture enables workflow depth beyond a thin catalog marketplace.

**Repository basis:**
- apps/api/src/server.js
- apps/web/src/App.tsx
- C:/myProjects/supplify-mobile/src
- C:/myProjects/supplify-mobile-ios/src
- docker-compose.yml

### 17 — Where others stop at “order placed,” Supplify keeps going

**Emphasize:** Defensibility comes from connecting the operational steps after discovery and checkout—where complexity and data value accumulate.

**Nuance:** This is a category comparison, not a named competitor benchmark.

**Transition:** The commercial model maps that depth to each tenant’s operating complexity.

**Repository basis:**
- PRODUCT_BUSINESS_LOGIC_AUDIT.md
- docs/product/four-plan-pricing-model.md

### 18 — Subscriptions scale with operating complexity

**Emphasize:** Restaurant tiers scale by branch and intelligence depth; supplier tiers scale by active ordering customer locations and operating depth.

**Nuance:** Configured monthly prices are $49/$149/$349 for restaurants and $149/$349 for suppliers. Live recurring PSP automation is not production-complete.

**Transition:** The final question is what is ready now and what remains roadmap.

**Repository basis:**
- docs/product/four-plan-pricing-model.md
- docs/product/plans-and-limits.md
- apps/api/db/migrations/0212_final_intelligence_subscription_matrix.sql

### 19 — Ready enough to win—honest about what comes next

**Emphasize:** Supplify has credible end-to-end breadth. Readiness work is focused on production connections and closing selected loops.

**Nuance:** Implemented means present in the audited codebase and local demo path; it is not a claim of live customer adoption or third-party provider activation.

**Transition:** Close on one connected operating layer for the whole supply relationship.

**Repository basis:**
- PRODUCT_BUSINESS_LOGIC_AUDIT.md
- HANDOVER_INTELLIGENCE.md
- apps/api/src/server.js
- apps/web/src/App.tsx

### 20 — Let’s put one connected operating layer under your F&B supply

**Emphasize:** Close with invitation: choose the audience’s priority—restaurant control, supplier execution, commercial model, or pilot readiness—and schedule a live walkthrough.

**Nuance:** Keep claims product-true; invite a demo/pilot conversation rather than promising traction metrics.

**Transition:** End on the four verbs: Source. Order. Fulfill. Deliver.

**Repository basis:**
- Synthesis of audited platform capabilities

## Commercial source of truth

The current public catalog in `docs/product/four-plan-pricing-model.md` contains three restaurant plans and two supplier plans after a 30-day trial:

- Restaurant Growth — $49/month, 1 active branch
- Restaurant Intelligence — $149/month, 3 active branches
- Restaurant Scale — $349/month, multi-branch operations
- Supplier Growth — $149/month, 50 active ordering customer locations/month
- Supplier Scale — $349/month, 200 active ordering customer locations/month

Annual base-plan prices use the two-months-free convention (monthly × 10). Supplier Scale supports recurring add-ons for active customer-location, supplier-branch, and warehouse capacity. The repository supports manual/stub billing; live recurring payment-provider subscriptions and webhooks remain external production work.

## Visual system

- Brand colors: #5B21B6, #7C3AED, #A78BFA, #EDE9FE, #1E0B3A, #10B981
- Typeface: Segoe UI
- Product logo: `apps/web/static/brand/supplify-logo.png`
- Editable diagrams use native PowerPoint shapes; screenshots are replaceable bitmap assets.

## Primary repository sources

- `PRODUCT_BUSINESS_LOGIC_AUDIT.md`
- `HANDOVER_INTELLIGENCE.md`
- `docs/product/four-plan-pricing-model.md`
- `docs/product/plans-and-limits.md`
- `apps/api/src/server.js`
- `apps/web/src/App.tsx`
- `apps/api/db/migrations/0212_final_intelligence_subscription_matrix.sql`
- `apps/api/db/migrations/0223_public_supplier_sales_channel.sql`
- `C:/myProjects/supplify-mobile/src`
- `C:/myProjects/supplify-mobile-ios/src`
