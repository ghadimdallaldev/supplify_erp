# Part 3 — Market Research

**Document status:** Draft, part 3 of 16. Builds directly on [Part 2](./02_industry_research.md)
(industry sizing, Lebanon/GCC regional data) and cross-references pricing from
[Part 7](./07_business_strategy.md) and product capabilities from
[Part 11](./11_product_strategy.md). This part does not re-derive TAM/SAM/SOM — that
figure belongs to Part 6 — it segments the market Part 2 sized, describes the two
tenant types Part 1 defined, and maps buyer behavior to the product touchpoints that
already exist in the shipped platform.

**A standing disclosure carried from every prior part**: Supplify has zero live paying
tenants today. Nothing in this part is derived from customer interviews, surveys, usage
data, or sales-call notes. Where this part describes personas, needs, or buying
behavior, it either (a) cites external, third-party research from Part 2, (b) restates
the company's own disclosed problem/solution framing (`docs/sales/01_problem.md`,
`docs/sales/02_solution.md`), or (c) is explicitly labeled an illustrative hypothesis
for founder validation.

---

## 3.1 Market Segmentation

Supplify sells into a two-sided marketplace. This section segments the **buyer side**
(restaurants and related food-service establishments) along three axes — establishment
type, operational size, and geography — each of which maps to a real product or pricing
decision already shipped, not a theoretical framework layered on afterward.

### 3.1.1 By establishment type

Part 1 (§1.2) defines Supplify's "restaurant" tenant type as an umbrella covering six
establishment categories. Each has a distinct purchasing pattern, even though all six
share the same underlying tenant schema and pricing ladder:

| Establishment type                  | Purchasing pattern                                                                                                                                                                                                                | Product fit                                                                                                                                                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Independent restaurants**         | Frequent, low-volume orders across 5–15 suppliers (Part 1, §1.1); owner or a single manager typically places orders personally                                                                                                    | Core segment for Silver/Gold; the segment the pricing ladder is explicitly designed around (Part 1, §1.4)                                                                                                                                                       |
| **Hotels (F&B operations)**         | Higher volume, broader SKU range (banquets, multiple outlets under one property), more formal purchasing/receiving discipline                                                                                                     | Multi-branch inventory and receiving-with-quality-capture features map directly to hotel F&B back-of-house needs; hotel F&B is itself a large, fast-growing global segment (US$73–480B range depending on scope, §2.2)                                          |
| **Cafés**                           | Narrower SKU range (beverage/pastry inputs), frequent small-basket reorders, often thinner staffing than full-service restaurants                                                                                                 | Fits Silver-tier limits well (250 SKUs, 20 orders/day) without needing Gold's multi-branch depth for a single location                                                                                                                                          |
| **Cloud kitchens / ghost kitchens** | No dine-in, delivery-dependent, and — per Part 2 (§2.2) — the fastest-growing food-service segment globally (12–18% CAGR) with the tightest dependency on inventory, ordering, and receiving discipline of any segment researched | Structurally the best product-market fit of any establishment type, even though Supplify does not yet market to this segment specifically (Part 2, §2.11, item 2) — a candidate segment for deliberate GTM prioritization, not just passive tenant type support |
| **Bakeries**                        | Perishable-input-heavy, short reorder cycles, high sensitivity to waste (Part 2's food-waste findings, §2.7, apply with particular force here)                                                                                    | Waste-tracking and expiry features (Gold+) are directly relevant; bakeries are a smaller establishment count than restaurants generally but a plausible early-adopter segment given the waste pain point is acute and visible day-to-day                        |
| **Caterers**                        | Irregular, event-driven order volume rather than steady daily reorder; large one-off orders spike SKU and quantity needs                                                                                                          | Less natural fit for daily-cadence features (quick lists, daily order limits); a segment to monitor rather than lead with in early GTM, since the product's rhythm assumptions (daily/weekly reorder) fit less cleanly than for the other five types            |

**Implication**: the six types share one schema (Part 1, §1.2) but are not equally
strong go-to-market fits. Cloud kitchens stand out as the segment where the product's
core value proposition (ordering + inventory + receiving discipline) matches the buyer's
operating constraints most tightly — worth carrying into Part 8/9 (Marketing), even
though it is not part of the current GTM plan.

### 3.1.2 By operational size

Supplify's own pricing ladder (Part 7, §7.2) is, in effect, an implicit size
segmentation, and this document treats it as the authoritative size cut rather than
inventing a separate one:

| Segment                                  | Typical profile                                                                                                                       | Mapped plan                               | Branch/warehouse ceiling                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Independent, single-location**         | One owner-operator, thin staffing, price-sensitive, most exposed to the 3–5% margin structure documented industry-wide (Part 2, §2.3) | Silver ($49/mo)                           | 1 branch                                                                                                                                   |
| **Small chain (2–3 locations)**          | A manager or small ops team coordinating more than one site; needs central visibility without enterprise complexity                   | Gold ($149/mo)                            | 2 branches (restaurant)                                                                                                                    |
| **Enterprise chain / large distributor** | Multi-location or multi-warehouse operation needing unlimited operational ceilings and advanced RBAC                                  | Platinum ($349/mo) or Enterprise (custom) | 3 branches base + add-ons, hard cap of 6 total branch accounts before an Enterprise sales conversation is required (`tier-matrix.md`, §5b) |

This ladder deliberately targets the **independent-to-small-chain range** as the primary
wedge (Part 1, §1.4) — the segment most named competitors (Part 4, forthcoming)
underserve because their pricing or complexity assumes an enterprise buyer. No
establishment-count breakdown by size exists in any source reviewed for Lebanon or the
GCC (this is a genuine data gap, consistent with the general absence of granular MENA
foodservice data noted throughout Part 2) — the segmentation above is structural, based
on the product's own ladder design, not a third-party market-size split.

### 3.1.3 By geography

Sequencing is Lebanon first, then Jordan and the wider GCC, then Europe (per the
company's stated deployment plan; Part 1, §1.6 and Part 14, forthcoming, will detail this
further). Part 2's regional data bears directly on how each geography should be read as a
market segment:

- **Lebanon** — the near-term addressable base. Establishment-count estimates conflict
  across sources and are presented, not reconciled, in Part 2 (§2.12): a derived estimate
  of **4,000–4,500 establishments** (Hospitality News ME headcount-based derivation) versus
  a trade-press figure of **~5,500 today, down from ~8,500 pre-2019** (The Beiruter).
  Both should be treated as directional. A relevant offsetting signal: **402 new
  restaurant brands registered with Lebanon's Ministry of Economy** in a single mid-2025
  window (Part 2, §2.12) — a fresh-openings wave that is itself a natural adoption trigger
  (see §3.5 below), tempered by the same source's finding that new entrants have a
  sub-20% survival rate versus ~90% for established operators.
- **Jordan** — not separately sized in Part 2's regional research pass; the only
  Jordan-specific data points available anywhere in this document's source base are Jordan's
  approximate VAT rate (~16%, Part 2 §2.14) and its inclusion in the Buna regional payment
  rail (JOD is one of Buna's six settlement currencies, Part 2 §2.14). This is a genuine
  research gap this document does not fill with an invented establishment count or market
  size — it should be closed before Jordan-specific go-to-market planning begins (flagged
  again in §3.9 below).
- **GCC (UAE, Saudi Arabia, Qatar, Kuwait)** — sized in Part 2, §2.13: UAE foodservice at
  ~US$23–27B, Saudi Arabia at ~US$30–32B, Qatar at ~US$2.0B, Kuwait at ~US$3.5–3.8B (Mordor
  Intelligence basis). Critically, UAE and Saudi Arabia already have named, funded,
  structurally similar competitors (Supy, Kaso, Foodics — Part 2, §2.13), which is a
  double-edged segmentation signal: proof that buyer demand for this category exists, at
  the cost of a harder competitive entry than Qatar or Kuwait, where no local incumbent was
  identified.

**Cross-reference to Part 2's core geographic finding**: no reliable public data exists
quantifying restaurant digital-ordering or POS penetration in Lebanon specifically
(§2.12) — read as a market-segmentation matter, this means Lebanon is best treated as a
**greenfield segment from a measurement standpoint**, not a segment where Supplify must
displace a well-documented incumbent base, in contrast to UAE/Saudi Arabia where
competitor traction is directly evidenced.

---

## 3.2 Supplier-Side Segmentation

Supplify is a two-sided marketplace; the supplier tenant type is a distinct market to
segment, not a mirror image of the restaurant side. Part 1 (§1.2) already scopes the
initial supplier focus as **food and beverage distributors**, with packaging, cleaning,
and equipment suppliers named explicitly as a later expansion target rather than a
current go-to-market focus.

| Supplier segment                               | Profile                                                                                                                                                                                                           | Product fit / plan mapping                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local/independent distributors**             | Single-warehouse operations serving a defined city or district; order intake by phone/WhatsApp per restaurant customer, the same fragmentation problem described from the buyer side (`docs/sales/01_problem.md`) | Silver (1 warehouse) or Gold (up to 3 warehouses) depending on scale; the natural entry tier for most Lebanese distributors given the single-warehouse norm implied by a market this size                                                                                                                   |
| **Regional/multi-warehouse wholesalers**       | Multiple warehouses, broader restaurant customer base, likely already juggling manual reconciliation across a larger number of accounts than an independent distributor                                           | Gold or Platinum (up to 5 warehouses, `tier-matrix.md` §5); the segment most likely to benefit from — and be willing to pay for — the driver dispatch/GPS and multi-warehouse routing features (Gold+, Part 1 §1.2)                                                                                         |
| **Specialty/import suppliers**                 | Narrower catalog (e.g., imported alcohol, specialty proteins, bakery inputs), often serving a smaller number of higher-value restaurant accounts rather than high order-volume, low-value accounts                | Could fit Silver's lower SKU/warehouse ceiling despite meaningful revenue per account; a segment where promotion/deal tooling (all tiers) may matter more than volume-based features                                                                                                                        |
| **Packaging / cleaning / equipment suppliers** | Longer reorder cycles, non-perishable inventory, different compliance/documentation needs (e.g., safety data sheets) than food suppliers                                                                          | Explicitly **not** a current GTM focus (Part 1, §1.6); the product's supplier-type-agnostic catalog model supports this segment today, but no category-specific catalog fields (units of measure, compliance docs) exist yet — a Part 11 roadmap item (§11.1, "Later" horizon), not a near-term opportunity |

**Why supplier-side segmentation matters as much as the buyer side**: Supplify's
referral-driven growth loop (`docs/features/supplier-customer-growth.md`, detailed in
§3.6 below) makes suppliers a **distribution channel for restaurant acquisition**, not
just a second revenue line. A supplier's willingness to import its customer list and
sponsor onboarding depends on the supplier's own segment characteristics — a
multi-warehouse regional wholesaler with hundreds of restaurant accounts has
categorically more referral leverage than a single-warehouse specialty importer with a
dozen accounts. This should inform which supplier segment Supplify prioritizes for its
earliest paying cohort, since the two sides of the marketplace are not independent
acquisition problems.

---

## 3.3 Buyer Personas

**Explicit framing**: the personas below are **illustrative hypotheses synthesized from
the company's disclosed problem/solution documentation (`docs/sales/01_problem.md`,
`docs/sales/02_solution.md`) and the product's actual tier design (`tier-matrix.md`)** —
not personas derived from customer interviews, surveys, or usage analytics. They should
be treated as founder-testable hypotheses to validate against the first real cohort, not
as research findings.

### Restaurant-side personas

**Persona 1 — "Rami," the independent restaurant owner-operator** _(illustrative, not
derived from customer interviews)_

- **Profile**: Owns and personally runs a single mid-size restaurant in Beirut; no
  dedicated back-office or purchasing staff — Rami or his one manager places every
  supplier order.
- **Day-to-day pain, per the disclosed problem statement**: coordinates 5–15 suppliers by
  phone and WhatsApp (Part 1, §1.1), reconciles what arrived against what was ordered
  manually, and has no single view across inventory, orders, and supplier conversations
  (`docs/sales/01_problem.md`).
- **Economic context**: operates on the thin 3–5% restaurant margins documented
  industry-wide (Part 2, §2.3), which makes both his tolerance for wasted time and his
  price sensitivity on new software unusually high at the same time.
- **Likely plan fit**: Silver ($49/mo) — the tier explicitly designed for
  "single-location, price-sensitive operators" (Part 7, §7.2).
- **What would make him switch**: a credible promise that Supplify actually saves time on
  a task he does every day (ordering, reconciling receiving against invoices), not a
  generic "digital transformation" pitch — consistent with the product-first, feature-led
  value proposition already stated in Part 1 (§1.9).

**Persona 2 — "Layla," the multi-branch operations manager**

- **Profile**: Manages purchasing and inventory across 2–3 branches of a small regional
  chain or a hotel's F&B outlets; reports to an owner or GM but holds day-to-day budget
  authority for supplier relationships.
- **Day-to-day pain**: the same fragmentation problem as Rami, multiplied — Part 1's own
  problem framing states plainly that "scaling to a second location multiplies this
  manual overhead rather than simplifying it" (§1.7).
- **Likely plan fit**: Gold ($149/mo) — the tier built around multi-branch inventory,
  advanced roles, and a tenant audit log (Part 1, §1.2), and explicitly positioned as the
  default plan for daily, serious use (Part 7, §7.2).
- **What would make her switch**: central visibility across locations without
  per-location tool sprawl — precisely the value proposition Part 1 (§1.9) states for this
  persona type.

**Persona 3 — "Karim," the cloud-kitchen operator**

- **Profile**: Runs one or more delivery-only kitchen units with no dine-in traffic;
  margins are tighter and order cadence more frequent than a traditional restaurant, per
  the structural profile of the cloud-kitchen segment described in Part 2 (§2.2, §2.11).
- **Day-to-day pain**: the fastest-reordering, most inventory-sensitive segment
  researched — stockouts or over-ordering translate directly into wasted (already thin)
  margin, with no dine-in revenue to absorb the loss.
- **Likely plan fit**: Gold, trending toward Platinum as order volume scales — smart
  reorder forecasting (Gold+, §11.2) is disproportionately valuable to this persona given
  the segment's reordering intensity.
- **Why he is included despite not being a current GTM target**: Part 2 (§2.11, item 2)
  already identifies cloud kitchens as having the tightest structural fit with Supplify's
  core value proposition of any segment researched; this persona is included to make that
  finding concrete for founder review, not because a cloud-kitchen-specific campaign is
  planned today.

### Supplier-side personas

**Persona 4 — "Nadine," the independent distributor owner**

- **Profile**: Owns a single-warehouse food distribution business serving restaurants
  across a city or district; she or a small sales team take orders by phone, WhatsApp, and
  occasionally email.
- **Day-to-day pain, per the disclosed problem statement**: "order chaos" — orders arrive
  through multiple channels and consolidating them for fulfillment is error-prone; limited
  visibility into which restaurants order what and how often; invoicing and collections
  take time away from growing the business (`docs/sales/01_problem.md`).
- **Likely plan fit**: Silver or Gold depending on warehouse count and order volume.
- **Growth-program relevance**: Nadine is a strong candidate to use the supplier customer
  import and referral tooling (`docs/features/supplier-customer-growth.md`) — she likely
  already has a real, if informal, list of restaurant customers she could import and
  invite, making her both a revenue prospect and an acquisition channel for restaurant
  tenants simultaneously (see §3.2 above).

**Persona 5 — "Youssef," the sales rep / order-desk coordinator at a mid-size distributor**

- **Profile**: Not the plan-purchasing decision-maker, but the day-to-day user who takes
  orders from restaurant accounts and manages fulfillment prioritization; works at a
  larger distributor with a warehouse manager or owner holding budget authority.
- **Day-to-day pain**: consolidating orders from email, phone, and "whatever portal each
  customer prefers" (Part 1, §1.2) into a single fulfillment workflow; the same
  visibility gap Nadine faces but experienced as an operational, not ownership,
  frustration.
- **Why he matters distinctly from the buyer persona**: Youssef is frequently the
  internal champion who would advocate for a tool like Supplify even though he does not
  sign the check — a distinction directly relevant to the buying-behavior discussion in
  §3.5 below (decision-maker vs. day-to-day user are not always the same person on the
  supplier side, particularly once a distributor grows past a single owner-operator).

---

## 3.4 Customer Needs & Pain Points

This section restates, without embellishment, the pain points already disclosed in
`docs/sales/01_problem.md` — the correct source document per Part 1's own citation
practice (§1.7) — organized by which side of the marketplace experiences them and mapped
to the specific product capability that addresses each one (Part 1, §1.2).

| Pain point (restaurant side)                                                                     | Product capability addressing it                                                                                                  |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Manual ordering across spreadsheets, phone calls, and emails with multiple suppliers             | Unified cart/checkout across linked supplier catalogs; saved "quick lists" with optional weekly automation                        |
| No single view — inventory, orders, and supplier communication live in separate tools            | One role-based platform; chat scoped to orders/products removes the "which channel did we discuss this in" problem (Part 1, §1.8) |
| Receiving and invoicing don't connect — what was ordered, arrived, and owed is hard to reconcile | Receiving workflow with quality photo capture; invoices linked directly to orders                                                 |
| Scaling to a new location multiplies manual overhead rather than simplifying it                  | Multi-branch inventory and RBAC available from Silver upward, not gated to Enterprise (Part 1, §1.5)                              |

| Pain point (supplier side)                                                                                      | Product capability addressing it                                                                                                |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Order chaos — orders arrive by email, phone, and portal; consolidating and fulfilling is error-prone            | Centralized order intake and fulfillment board                                                                                  |
| Limited visibility into which restaurants order what, how often, and how to prioritize                          | Growth/customer-import tooling with prospect tracking (`docs/features/supplier-customer-growth.md`); order history per customer |
| Invoicing and payments — tracking who paid and following up on late payers takes time from growing the business | Invoices linked to orders, payment recording across seven payment methods, disputes and credit notes                            |

**On sizing this pain quantitatively**: Part 1 (§1.7) already states plainly that no
reliable, methodology-disclosed public dataset quantifies "hours lost to manual
procurement" for Lebanese or MENA restaurants specifically, and that such figures, where
they appear in vendor materials elsewhere in the category, are typically unverifiable
vendor estimates. This document does not depart from that discipline: the pain points
above are qualitatively real (grounded in the company's own product-and-sales team
observation, per Part 1) but are not attached to a fabricated efficiency percentage.
Two adjacent, well-sourced findings from Part 2 corroborate the _general_ shape of the
problem without claiming to measure Supplify's specific customer base: food costs
typically run 28–35% of restaurant sales (ReFED, Part 2 §2.7) and labor costs reached
36.5% of average restaurant operating costs in 2024 (Part 2 §2.3) — meaning the margin
available to absorb reconciliation errors, missed deliveries, or waste from poor
inventory visibility is genuinely thin, which is the economic logic underlying why this
pain point matters, even without a Supplify-specific hours-lost statistic.

---

## 3.5 Buying Behavior & Decision-Making Process

**Who decides.** For the independent-restaurant persona (Rami, §3.3), the purchasing
decision is almost certainly single-person — owner or sole manager — consistent with the
single-location, thin-staffing profile Part 1 (§1.1, §1.4) assumes in its pricing
design. For the multi-branch or chain persona (Layla), authority is more likely split
between an operations manager who identifies the need and an owner/GM who approves
recurring spend — a longer, more considered cycle than the independent-operator case. On
the supplier side the pattern is similar: an owner-operator distributor (Nadine) decides
alone, while a larger distributor may have a day-to-day champion (Youssef) who is not the
final budget authority.

**Budget authority and price sensitivity context.** No Supplify-specific data exists on
either side's software budget or approval process — a genuine gap to close with the
first real sales conversations. From Part 2's general industry research: restaurant
margins run 3–5% industry-wide (§2.3), and 52% of operators rank food/ingredient
inflation as their top challenge (same source) — both signal that any new recurring
software cost faces real budget scrutiny, particularly for the independent-operator
segment Supplify is prioritizing.

**Adoption triggers, drawn from general industry research (not Supplify-specific
data).** Part 2 (§2.3, §2.6) documents several consistent, non-Supplify-specific patterns
in how SMB/food-service buyers come to adopt back-office software generally:

- **Cost-of-ownership sensitivity favors cloud/SaaS deployment.** Panorama Consulting
  Group's independent ERP survey found 78.6% of organizations implementing new ERP chose
  a cloud solution in 2024 (75% in 2025) — a majority-and-rising trend from a
  methodology-disclosed source, not vendor marketing (Part 2, §2.6). This is directly
  relevant to Supplify's cloud-native, no-dedicated-IT-required positioning.
- **Growth events are a natural trigger.** The same source notes cloud ERP's appeal is
  "scalability without new capital infrastructure spend as a business adds locations or
  warehouses" — directly analogous to the moment Layla's persona (a restaurant opening a
  second branch) would be most receptive to a purchasing decision.
- **A fresh-openings wave in Lebanon is a concrete, dated trigger event.** The 402 new
  restaurant brands registered with Lebanon's Ministry of Economy in a single mid-2025
  window (Part 2, §2.12) represents a cohort of buyers making purchasing-system decisions
  from scratch, with no legacy tool to migrate away from — a meaningfully easier sale than
  displacing an entrenched incumbent, tempered by the same source's finding that most new
  entrants lack feasibility studies and have a sub-20% survival rate.
- **Structural barriers to adoption, industry-wide, not Supplify-specific**: Part 2
  (§2.3) documents high upfront implementation cost relative to thin margins, staff
  resistance and retraining burden, and a pattern of restaurant technology being built
  first for enterprise chains and pushed downmarket at price points not suited to
  independents — all directly relevant to why Supplify's own pricing and design choices
  (Part 1, §1.4–1.5) are positioned the way they are.
- **Digital-payment infrastructure is a compounding, Lebanon-specific constraint.** Only
  23% of Lebanese adults had a bank or mobile-money account in 2024 (Part 2, §2.12),
  meaning even a buyer motivated to adopt Supplify may still transact with suppliers in
  cash outside the platform's own payment-recording features for some time — a real
  behavioral friction this document names rather than assumes away.

---

## 3.6 Customer Journey Mapping

Unlike the sections above, this journey can be mapped directly to real, shipped product
touchpoints rather than hypothesized — the mechanics below exist in the codebase today
(Part 7, §7.9; `docs/features/supplier-customer-growth.md`), even though no live tenant
has yet moved through them.

| Stage                                              | What happens                                                                                                                                                                                                    | Product touchpoint                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Awareness**                                      | Buyer becomes aware of Supplify through founder-led direct sales (Lebanon launch motion, Part 1 §1.11), a supplier's referral, or — later — trade associations/industry events (Part 1, §1.11, forward-looking) | Supplier-initiated: CSV customer import → auto-match → connection request (existing Supplify tenant) or invite (email/WhatsApp/link) for a restaurant not yet on the platform (`docs/features/supplier-customer-growth.md`)                                                                                                                                                                                                 |
| **Trial**                                          | Prospect registers, optionally via a referral link (`/register?ref={token}`)                                                                                                                                    | Free Trial signup — time-limited (7–90 days, default 30), Gold-equivalent feature flags with Free-tier limits (`tier-matrix.md` §6) — deliberately built to be "maximally persuasive" per Part 7 (§7.3)                                                                                                                                                                                                                     |
| **Conversion**                                     | Prospect hits a usage limit or gated feature during the trial or on a paid tier below their actual needs                                                                                                        | Standardized `LIMIT_EXCEEDED`/`FEATURE_NOT_AVAILABLE` API responses drive an in-app `UpgradeModal`; an 80%-usage warning banner; a proactive nudge after 3+ blocks in 7 days (Part 7, §7.9, `docs/product/monetization-ux.md`)                                                                                                                                                                                              |
| **Conversion (referred restaurants specifically)** | A referred restaurant reaches first paid checkout                                                                                                                                                               | Referral discount (20% off first paid subscription, admin-configurable) applied automatically via `referral-conversion.service.js`; `first_paid_discount_used` flag prevents reuse (`docs/features/supplier-customer-growth.md`)                                                                                                                                                                                            |
| **Retention**                                      | Tenant runs daily operations — ordering, receiving, invoicing, chat — inside the platform                                                                                                                       | The full ordering/fulfillment/finance loop described in Part 1 (§1.8); reliability is explicitly treated as a core value (Part 1, §1.5, "Trust is the product") because a single missed delivery or wrong invoice damages both sides of the relationship                                                                                                                                                                    |
| **Expansion**                                      | Tenant adds a branch/warehouse, upgrades from Silver→Gold→Platinum as usage grows, or becomes a referrer itself                                                                                                 | Branch/warehouse add-ons (currently admin-provisioned, Part 7 §7.2); plan upgrade flows; for suppliers specifically, the growth-program loop closes here — a supplier who has sponsored or referred a restaurant earns a reward (1 free month or a billing credit) on that restaurant's first paid conversion, creating a second-order retention incentive tying supplier and restaurant lifecycles together (Part 7, §7.9) |

**A structural observation worth naming explicitly**: because the Free Trial ships with
Gold-equivalent features and only Free-tier _limits_ (Part 7, §7.3), the entire
Free→Silver/Gold conversion story for a self-serve prospect has to be told through usage
limits, not feature unlocks — a design fact that should directly shape how sales and
marketing copy (Parts 8–10) frame the trial experience, since a prospect will not
discover new _capabilities_ on upgrade, only higher _ceilings_.

---

## 3.7 Willingness to Pay / Price Sensitivity

**No willingness-to-pay survey data exists for Supplify, and none is fabricated here.**
This section discusses price sensitivity qualitatively, against the real, shipped tier
pricing from Part 7 (§7.2): Free Trial ($0), Silver ($49/mo), Gold ($149/mo), Platinum
($349/mo), Enterprise (custom).

- **Silver's $49/month sits below the threshold where restaurant technology purchases
  typically require multi-stakeholder approval**, consistent with the independent-owner
  persona (Rami) being able to decide alone — this is a reasonable inference from the
  buying-behavior discussion in §3.5, not a measured conversion-rate fact.
- **The jump from Silver to Gold (5x on the orders/day limit, roughly 3x on price) is a
  deliberate upgrade-pressure design** (Part 7, §7.2), meaning price sensitivity at this
  boundary is expected to be usage-driven rather than purely psychological — a restaurant
  outgrowing Silver's 20 orders/day ceiling faces the upgrade as an operational necessity,
  not a discretionary upsell.
- **Lebanon's macro environment cuts two ways on price sensitivity.** USD-denominated
  pricing insulates Supplify's own revenue from LBP volatility (Part 2, §2.12), but the
  restaurant customer's own revenue and cost base may still be LBP-exposed or affected by
  the contested 2026 inflation trajectory (Part 2, §2.12 — World Bank forecasts
  single-digit 2026 inflation, while more recent monthly bank-research data shows
  re-acceleration to ~19–20% year-on-year). A customer under real cost pressure is
  simultaneously a stronger case for a tool that reduces waste and reconciliation error,
  and a harder sell on any new fixed monthly cost — this tension is not resolved by
  today's evidence and should inform how firmly Silver-tier pricing is held during launch
  (an open item also flagged in Part 2's own implications section).
- **The annual discount (~17% off monthly-equivalent) is an untested hypothesis, not a
  proven lever**, as Part 7 (§7.2) already states plainly — it should not be assumed to
  drive meaningfully lower churn until real cohort data exists.
- **Structural industry context supports the pricing tier's basic premise but does not
  validate the specific price points.** Cloud ERP's documented appeal on total cost of
  ownership relative to on-premise alternatives (Part 2, §2.6) supports the _category_ of
  low-fixed-cost, no-IT-staff-required software being attractive to SMB food businesses —
  it does not, on its own, confirm that $49 or $149 specifically are the right numbers for
  the Lebanese market, which only real conversion data can answer.

**What this document does not do**: claim any conversion rate, elasticity estimate, or
customer-stated maximum price, because no such data exists. Part 12 (Financials) is the
correct place to build a forward pricing-sensitivity model once real trial and upgrade
data exists.

---

## 3.8 Market Entry Barriers for Customers

The most significant entry barrier for Supplify's buyer is not a competing software
product — Part 2 (§2.12) found no reliable data on existing digital-ordering penetration
in Lebanon, and no incumbent's presence was confirmed there — but **switching cost away
from an existing, deeply embedded manual process**:

- **Phone/WhatsApp ordering has effectively zero marginal cost and high relationship
  trust.** A restaurant owner who has ordered from the same supplier by phone for years
  has an established, personal relationship with that supplier's sales rep — a genuine
  behavioral and trust asset that a new software layer must not appear to threaten or
  replace outright. This is consistent with why Supplify's own value proposition (Part 1,
  §1.8) frames the product as connecting existing restaurant-supplier relationships, not
  disintermediating them.
- **Digital payment infrastructure is a compounding barrier in Lebanon specifically.**
  Only 23% of Lebanese adults have a bank or mobile-money account (Part 2, §2.12), and
  individual digital-transaction caps (reported around US$300/day or US$3,000/month as of
  March 2025, per the same section — flagged there as needing independent reconfirmation)
  constrain how fully digital B2B payment flows can replace cash-based settlement in the
  near term. This means Supplify's invoicing and payment-recording features will likely
  need to coexist with cash settlement for longer in Lebanon than in a market with higher
  financial inclusion.
- **New-entrant risk aversion versus established-operator inertia are different barrier
  types.** The sub-20% survival rate for new Lebanese restaurant entrants versus ~90% for
  established operators (Part 2, §2.12) implies two distinct adoption barriers: new,
  undercapitalized entrants may be reluctant to add any new recurring cost pre-launch,
  while established, survived operators have the inertia of years of working (if
  inefficient) manual habits and existing supplier relationships that a new tool must
  visibly out-perform, not merely match.
- **In GCC markets specifically, the barrier shifts from behavioral inertia to
  competitive displacement.** UAE and Saudi Arabia already have named, funded incumbents
  (Supy, Kaso, Foodics — Part 2, §2.13) with real customer bases; entering those markets
  means displacing an existing software choice, not just displacing a manual process — a
  materially different, and generally harder, sales motion than Lebanon's greenfield
  position.
- **No incumbent-software switching-cost data exists for Lebanon** because no incumbent
  penetration data exists there at all (Part 2, §2.12) — this document states that gap
  plainly rather than assuming either a favorable ("nothing to displace") or unfavorable
  ("hidden incumbent") reading without evidence.

---

## 3.9 Sources & Assumptions Used in This Part

- Establishment-type and tenant-model definitions: Part 1 (§1.2, §1.7).
- Industry, regional, and competitor sizing (Lebanon establishment counts, GCC
  foodservice market sizes, cloud-kitchen growth, named GCC competitors, Lebanon
  financial-inclusion and payment-cap data, ERP cloud-adoption survey, restaurant margin
  and cost-structure statistics): Part 2, §2.2, §2.3, §2.6, §2.7, §2.11, §2.12, §2.13,
  §2.14 — see that part's own source list for the underlying primary citations
  (Hospitality News ME, The Beiruter, Mordor Intelligence, Panorama Consulting Group,
  World Bank Global Findex, ReFED, National Restaurant Association via Restaurant Dive).
- Pricing, tier limits, and add-on structure: `docs/product/tier-matrix.md` (verified
  2026-05-28) and Part 7, §7.2–§7.11.
- Problem/solution framing and persona pain points: `docs/sales/01_problem.md`,
  `docs/sales/02_solution.md`, used in substance rather than rewritten to sound more
  research-derived than they are.
- Growth/referral mechanics and customer-journey touchpoints:
  `docs/features/supplier-customer-growth.md`, `docs/product/monetization-ux.md`, and
  Part 7, §7.9.
- Pricing-strategy design rationale: `docs/sales/08_pricing_strategy.md`.
- **No customer interviews, surveys, NPS/satisfaction data, or usage analytics exist and
  none are represented as existing anywhere in this part.** Every persona is labeled
  illustrative; every willingness-to-pay statement is qualitative.

### Open items for founder review

1. **Validate or replace the five buyer personas and two supplier personas (§3.3)**
   against the first real sales conversations — they are structured hypotheses built from
   disclosed product/problem documentation, not research findings, and should be the
   first thing overwritten with real data post-launch.
2. **Close the Jordan data gap (§3.1.3)** before Jordan-specific go-to-market planning
   begins — no establishment count, market size, or competitor landscape for Jordan
   exists anywhere in this document's source base today.
3. **Decide whether cloud kitchens (§3.1.1, §3.3 Persona 3) warrant a deliberate,
   named go-to-market segment** ahead of the current, establishment-type-agnostic launch
   plan, given the structural fit Part 2 (§2.11) already identified.
4. **Confirm how firmly Silver-tier pricing should be held during the Lebanon launch**
   given the contested 2026 inflation trajectory (§3.7) — this is a pricing-committee
   decision, not one this document can resolve with current evidence.
5. **Commission or prioritize primary research (even lightweight, e.g., 15–20 structured
   conversations with prospective restaurant and supplier tenants) before Part 8/9
   (Marketing) finalizes messaging** — this document has gone as far as secondary research
   and product-fact grounding can responsibly go without inventing customer data.
