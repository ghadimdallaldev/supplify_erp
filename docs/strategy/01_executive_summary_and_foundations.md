# Part 1 — Executive Summary & Strategic Foundations

**Document status:** Draft, part 1 of 16. **Company stage:** pre-launch (product built and
internally tested; no live paying tenants yet), bootstrapped (no institutional capital
raised, not currently running a raise). Figures in this part are either verified facts from
the Supplify codebase/public sources (cited) or explicitly labeled targets/assumptions. See
[README.md](./README.md) for document scope and status of remaining parts.

---

## 1.1 Executive Summary

Supplify is a multi-tenant B2B commerce and operations platform that connects restaurants,
hotels, cafés, and other food-service buyers with their suppliers in a single, role-based
system. Where a typical independent restaurant today coordinates purchasing through phone
calls, WhatsApp messages, and spreadsheets across five to fifteen suppliers, and a typical
distributor reconciles orders across the same fragmented channels, Supplify replaces that
fragmentation with one connected workspace covering ordering, fulfillment, receiving,
invoicing, inventory, reservations, and platform administration.

The product is not a pitch-deck concept. It is a working system with 180 database
migrations, 225+ backend tests and 100+ frontend tests, full role-based access control,
enforced subscription tiering, GPS-tracked delivery, and a reservations and staff module —
built over roughly 12–18 months of iterative engineering (Source: internal codebase audit,
2026-07-01). What Supplify does not yet have is a single live paying customer, a
completed seed round, or a market presence outside internal testing. This document treats
that honestly throughout: it is a plan for what a genuinely capable product does next, not
a retrospective of traction that does not exist yet.

The company's near-term thesis is narrow by design: launch commercially in Lebanon, where
the founding team has direct market access and language/relationship advantages, prove the
subscription and unit-economics model with a small number of real paying tenants on both
sides of the marketplace (restaurants and suppliers), and use that evidence — not
projections — as the basis for a first institutional raise and subsequent GCC expansion.

## 1.2 Company Overview

**What Supplify is.** A cloud-based, multi-tenant SaaS platform serving two primary tenant
types — **restaurants** (including hotels, cafés, cloud kitchens, bakeries, and catering
companies) and **suppliers** (initially food and beverage distributors; packaging,
cleaning, and equipment suppliers are an explicit market-expansion target, not yet a
GTM focus — see [1.6 Strategic Objectives](#16-strategic-objectives)) — plus a platform
administration layer that operates the marketplace itself.

**What it does today**, grounded directly in the shipped codebase rather than
aspirational marketing copy:

| Domain                  | Capability                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordering                | Cart/checkout across multiple suppliers, order status workflow (draft → placed → confirmed → fulfilling → completed/cancelled), amendments, decline reasons, calendar-based delivery planning, saved "quick lists" with optional weekly automation |
| Catalog                 | Supplier product CRUD, bulk CSV import, asynchronous bulk image (ZIP) import, contract/negotiated pricing, bilingual (Arabic/English) product fields                                                                                               |
| Inventory               | Supplier warehouse stock; restaurant par-level and multi-branch inventory tracking; expiry and waste tracking (Gold+ plans)                                                                                                                        |
| Fulfillment & logistics | Driver dispatch, live GPS tracking, route planning, proof-of-delivery capture, multi-warehouse routing (Gold+)                                                                                                                                     |
| Receiving               | Restaurant goods-in workflow with quality photo capture and scoring                                                                                                                                                                                |
| Finance                 | Invoices linked to orders, payment recording across seven payment methods, disputes and credit notes                                                                                                                                               |
| Communication           | Real-time chat (Socket.IO + Redis) scoped to orders/products/conversations                                                                                                                                                                         |
| Front-of-house          | Reservation board, public guest booking portal, floor plan, staff self-service portal (PTO, shift swaps)                                                                                                                                           |
| Consumer/B2C            | Public supplier "mini-store" storefronts, guest checkout without login, basic loyalty structure                                                                                                                                                    |
| Growth tooling          | Supplier-side customer import, referral/connection requests, paid promotions with admin approval                                                                                                                                                   |
| Platform administration | Tenant/subscription management, database-backed feature flags (global and per-tenant), limit overrides, impersonation, audit logging                                                                                                               |

_(Full technical inventory: [docs/onboarding/01-executive-overview.md](../onboarding/01-executive-overview.md) and [docs/product/feature-catalog-full.md](../product/feature-catalog-full.md).)_

**What it does not yet do**, stated for the same reason investors are told about
liabilities on a balance sheet — because it is decision-relevant:

- No live production tenants; every number about usage, retention, or revenue in this
  document is a **target**, never an actual, until stated otherwise.
- Several Platinum-tier marketing claims (full API/order webhooks, advanced custom reporting, central purchasing) remain **catalog entries** — priced and displayed — without full backend enforcement yet (Source: `docs/product/tier-matrix.md`, §7). **Smart quick lists, notification webhooks, custom catalog domains, and smart reorder** are enforced — see `docs/product/PLATINUM_CATALOG_ONLY_FEATURES.md`.
- Single-region infrastructure (Railway, one deployment per environment) — no multi-region
  failover or data residency options yet, relevant once GCC/EU expansion requires local
  data hosting.
- Add-on billing (extra branches/warehouses) is admin-triggered, not yet automated through
  the billing engine.
- A native mobile app is tracked as a separate, parallel workstream, not yet at parity with
  the web application.

**Legal and operating base.** Founding team and initial go-to-market based in Lebanon.
_(Corporate entity/jurisdiction, founder composition, and cap table are commercially
sensitive and intentionally omitted from this document; provided directly to qualified
counterparties under NDA.)_

## 1.3 Vision _(proposed — for founder confirmation)_

> **Every restaurant and every supplier runs its business on one connected system — not on
> phone calls, spreadsheets, and memory.**

Vision, mission, and values were not previously codified in the product documentation
(only a brand-personality brief exists — see `PRODUCT.md`). The statements in §1.3–1.5 are
proposed drafts synthesized from that brief and the product's actual behavior; they should
be confirmed, edited, or replaced by the founder before this document is finalized or
shared externally.

## 1.4 Mission _(proposed — for founder confirmation)_

> Supplify gives restaurants and their suppliers one system to order, fulfill, reconcile,
> and grow together — built with the operational depth chains expect, priced so an
> independent, single-location restaurant can actually afford it.

The second clause is a deliberate strategic stance, not filler: most competitors documented
in Part 4 either target enterprise chains (high price, long sales cycle) or offer
lightweight ordering tools with shallow operational depth. Supplify's tiering — a $49/month
Silver plan sitting below a $149/month "most popular" Gold plan (`docs/product/tier-matrix.md`,
§1) — is built to serve the independent operator segment that most competitors underserve,
while retaining Platinum/Enterprise depth for chains.

## 1.5 Core Values _(proposed — for founder confirmation)_

1. **Operator-first pragmatism.** Every feature must save a real person real time on a real
   shift. This mirrors the existing design principle that the UI should "disappear into the
   task" (`PRODUCT.md`).
2. **Precision over decoration.** The product's own design brief anti-references generic
   enterprise ERP chrome and templated admin dashboards (`PRODUCT.md`) — the same standard
   applies to how the company represents itself to the market: substantiated claims, not
   inflated ones.
3. **Trust is the product.** In a two-sided marketplace handling invoices, payments, and
   deliveries, a single broken promise (a missed delivery, a wrong invoice) damages both
   sides' businesses. Reliability is treated as a feature, not an assumption.
4. **Built for scale, priced for reality.** Multi-branch, multi-warehouse, and RBAC depth
   exist from Silver upward — not gated exclusively to Enterprise — so a growing customer
   never has to leave the platform to get more serious about using it.
5. **Regional-first, globally architected.** Lebanon-first go-to-market; bilingual
   (Arabic/English) data model already in place at the schema level, so expansion is a
   go-to-market problem to solve, not a rewrite.

## 1.6 Strategic Objectives

Objectives are grouped by horizon and stated as targets, not commitments with fixed dates,
since the company has not yet launched commercially.

| Horizon      | Objective                                                                                                                                              | Why this, why now                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–6 months   | Commercial launch in Lebanon; first paying restaurant and supplier tenants on Silver/Gold plans                                                        | Converts a built product into evidence; nothing else in this document (unit economics, retention, expansion) can be verified before this happens         |
| 6–12 months  | Close the gap between catalog-only Platinum claims and shipped functionality (webhooks, white-label, AI quick lists) documented in `tier-matrix.md` §7 | Selling a feature that is not enforced is a churn and trust risk once a paying Platinum customer tests it                                                |
| 12–18 months | Reach a cohort of paying tenants large enough to calculate real CAC, LTV, and net revenue retention (see Part 12 for the model once real inputs exist) | Real unit economics, not projected ones, are the basis on which a seed round should be raised                                                            |
| 18–24 months | First GCC market entry (see Part 14)                                                                                                                   | GCC food-service digitization is further along than Lebanon's on average, and the bilingual/multi-currency groundwork is already partially in the schema |
| 24–36 months | Category expansion beyond food/beverage suppliers into packaging, cleaning, and equipment suppliers                                                    | The tenant/catalog model is supplier-type agnostic today; expansion is a go-to-market and category-specific catalog exercise, not a re-architecture      |

## 1.7 Problem Statement

**Restaurants** coordinate purchasing across multiple suppliers using phone calls,
WhatsApp, and spreadsheets. Inventory, orders, and supplier communication live in separate
tools, so no one has a single view. What was ordered, what arrived, and what is owed are
reconciled manually, which is slow and error-prone. Scaling to a second location multiplies
this manual overhead rather than simplifying it.

**Suppliers** receive orders through the same fragmented channels — email, phone, and
whatever portal each customer prefers — and consolidating them for fulfillment is
error-prone. They have limited visibility into which customers order what and how often,
and invoicing/collections take time away from growing the business.

_(This restates, with tighter framing, the problem already documented internally in
`docs/sales/01_problem.md`; it is the correct problem statement and is preserved here
rather than rewritten for its own sake.)_

**On sizing this problem:** no reliable, verifiable public dataset quantifies "hours lost
to manual procurement" for Lebanese or MENA restaurants specifically — that statistic, when
it appears in vendor materials elsewhere in this industry, is almost always a vendor
estimate presented without methodology, which is exactly the kind of unverifiable figure
this document avoids. What can be stated from public sources:

- Lebanon's restaurant sector employs an estimated 80,000+ people at an average of ~18
  employees per establishment, which implies roughly **4,000–4,500 operating F&B
  establishments** — a derived estimate, not an official register count (Source:
  [Hospitality News ME, "Lebanon's F&B industry: what's cooking in 2025"](https://www.hospitalitynewsmag.com/lebanon-fb-industry/)).
- Lebanon's food market is estimated at **US$6.35 billion in 2025**, forecast to grow at a
  **CAGR of ~8.66% through 2030** (Source: Statista Market Insights, Food — Lebanon
  outlook, accessed 2026-07-01; third-party aggregator estimate, not a government figure —
  treat as directional).

These two figures bound the addressable buyer population and category size; they do not,
on their own, prove procurement inefficiency. The problem statement above rests on the
product-and-sales team's direct qualitative observation of the market (documented
separately in `docs/sales/01_problem.md`), not on a fabricated efficiency statistic.

## 1.8 Solution

Supplify replaces the fragmented toolset above with one role-based platform: restaurants
build carts from linked supplier catalogs, place and track orders, record receiving, and
reconcile invoices in the same system; suppliers manage catalog, warehouses, fulfillment,
driver dispatch, and receivables in the same system; and chat scoped to orders/products
removes the "which channel did we discuss this in" problem entirely. Plans scale from a
single-location Silver tenant to a multi-branch, multi-warehouse Platinum tenant without a
platform migration — the same schema and RBAC model serve both (see §1.2 and
`docs/product/tier-matrix.md`).

## 1.9 Value Proposition

| Persona                                  | Core value                                                                                                       | Supporting capability                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Independent restaurant                   | Stop losing time reconciling orders across suppliers and channels                                                | Unified ordering, quick lists, chat-in-context, receiving with quality capture                    |
| Restaurant chain / multi-branch operator | Central visibility and control across locations without per-location tool sprawl                                 | Multi-branch inventory, advanced roles, tenant audit log, central purchasing (Platinum)           |
| Distributor / supplier                   | Fewer missed or duplicated orders, clearer prioritization of customers                                           | Centralized order intake, fulfillment board, driver dispatch/GPS, growth/referral tooling         |
| Platform operator (Supplify itself)      | A defensible two-sided marketplace with usage-based upgrade pressure built into the product, not bolted on after | Tiered limits enforced at the API layer (`requireFeature`/`checkLimit`), not just UI-level gating |

## 1.10 Business Model

Supplify is a **subscription SaaS marketplace** monetized primarily through tiered plans
sold to both sides of the marketplace (restaurants and suppliers), not through transaction
fees or commission on order value. This is a deliberate choice already reflected in the
shipped pricing model (`docs/product/tier-matrix.md`, §1):

| Plan       | Monthly | Yearly | Positioning                                                      |
| ---------- | ------: | -----: | ---------------------------------------------------------------- |
| Free Trial |      $0 |      — | Time-limited (7–90 days, default 30) sandbox; not "forever free" |
| Silver     |     $49 |   $490 | First paid tier — single-location operators                      |
| Gold       |    $149 | $1,490 | "Most Popular" — default plan for daily, serious use             |
| Platinum   |    $349 | $3,490 | "Unlimited Ops" — chains and large suppliers                     |
| Enterprise |  Custom | Custom | Admin-assigned only; not self-serve today                        |

**Secondary revenue lines already built into the product:**

- **Branch/warehouse add-ons** — $19–$69/month per unit depending on tenant type and plan
  (`docs/product/tier-matrix.md`, §5b). Currently admin-provisioned, not self-serve billed —
  an near-term automation opportunity, not a hypothetical one.
- **Paid promotions/deals** — suppliers pay (via plan-gated promotion slots) to surface
  offers to restaurant buyers, with admin approval as a trust/compliance gate.

**What Supplify deliberately does not do today:** charge a percentage of gross merchandise
value (GMV) or take a cut of payments processed. This keeps pricing simple and predictable
for operators on thin margins, at the cost of a revenue line (payments/take-rate) that
larger competitors (e.g., Toast) use — a trade-off examined further in Part 5 (Ansoff
Matrix / future revenue streams) and Part 7.

## 1.11 Business Model Canvas

| Block                      | Content                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Key Partners**           | Payment processors (Stripe referenced in payment methods); Keycloak (identity, self-hosted OSS); Railway (infra/hosting); MinIO/S3-compatible storage; eventually POS/accounting integration partners (not yet built) |
| **Key Activities**         | Product engineering (multi-tenant platform), two-sided sales (restaurants + suppliers must both be sold), tenant onboarding, trust & safety (deal approvals, dispute mediation)                                       |
| **Key Resources**          | The codebase itself (180 migrations, full RBAC/billing engine); founding team's Lebanon market access; bilingual data model as an expansion asset                                                                     |
| **Value Propositions**     | See §1.9 — unified ordering/fulfillment/finance for restaurants; centralized order intake/logistics/receivables for suppliers                                                                                         |
| **Customer Relationships** | Self-serve signup/trial → in-app upgrade prompts (already instrumented — see conversion-funnel tracking in `docs/sales/08_pricing_strategy.md`) for Silver/Gold; high-touch sales for Platinum/Enterprise             |
| **Channels**               | Direct sales (initially founder-led in Lebanon), self-serve web signup, supplier-driven referral of restaurant customers (growth program already built), future: trade associations, industry events (Part 8/9)       |
| **Customer Segments**      | Independent restaurants/cafés/cloud kitchens/bakeries/caterers/hotels; F&B distributors (initial focus); packaging/cleaning/equipment suppliers (expansion target)                                                    |
| **Cost Structure**         | Engineering (dominant cost pre-revenue), infrastructure (Railway/Redis/Postgres/storage), founder-led sales and support (no dedicated sales team yet)                                                                 |
| **Revenue Streams**        | Tiered subscriptions (both tenant types) + branch/warehouse add-ons + paid promotions; no transaction take-rate today (see §1.10)                                                                                     |

## 1.12 Elevator Pitch

**10-second version:** "Supplify is the operating system for restaurant-supplier
relationships — one platform to order, fulfill, and get paid, instead of five apps and a
notebook."

**30-second version:** "Restaurants juggle five to fifteen suppliers across WhatsApp,
phone calls, and spreadsheets — and suppliers juggle just as many restaurants the same
fragmented way. Supplify replaces all of that with one connected platform: restaurants
order, receive, and pay in one place; suppliers manage catalog, fulfillment, delivery, and
invoicing in the same place. It's built with the depth a restaurant chain needs, priced so
a single independent restaurant can actually afford it — starting in Lebanon, built to
expand across the region."

## 1.13 Investment Highlights

Presented honestly for a pre-launch, bootstrapped company — these are reasons the company
will be a credible fundraising candidate **once it has launched and produced real usage
data**, not a claim that it is fundable today on traction:

- **Product risk is already substantially retired.** This is not a prototype seeking
  product-market validation from zero — it is a tested, multi-tenant platform (225+
  backend tests, 100+ frontend tests, 180 migrations) with the operationally hard parts
  (RBAC, billing enforcement, GPS-tracked logistics, real-time chat) already built
  (Source: internal codebase audit, 2026-07-01). Capital raised after launch can go
  disproportionately toward go-to-market, not toward finishing the product.
- **Founder market access.** Lebanon-based go-to-market with direct relationships in the
  target segment (specifics provided under NDA).
- **Pricing designed for an underserved segment.** Most named competitors (Part 4) target
  either enterprise restaurant chains or offer shallow point solutions; Supplify's
  $49–$149 entry tiers with real operational depth target the independent-operator segment
  between those two extremes.
- **Two-sided data model already bilingual.** Arabic/English fields exist at the schema
  level today, lowering the cost of GCC expansion relative to a rewrite.
- **Deliberately disclosed gaps.** The catalog-only feature gap (§1.2) and lack of
  automated add-on billing are known, scoped, and small relative to the platform already
  shipped — the kind of finding a diligence process should surface, surfaced here first.

**What this section is not:** a claim of revenue, users, or committed capital. None exist
yet. Part 12 (Financials) will model a raise scenario once the company decides to pursue
one; this document does not currently include a funding ask.

## 1.14 Why Now

- **Global restaurant procurement software is a genuine, growing category**, estimated at
  roughly **$1.2–1.4 billion in 2024**, projected to reach **$3.4–3.5 billion by 2033** at
  a **10–13% CAGR** (Source: [DataIntelo, Restaurant Procurement Software Market Research Report 2033](https://dataintelo.com/report/restaurant-procurement-software-market);
  cross-checked against [MarketIntelo](https://marketintelo.com/report/restaurant-procurement-software-market) —
  both are third-party market-research aggregators, not primary sources; treat as
  directional, not authoritative, and re-verify before citing in an investor deck).
  This validates category demand without requiring Supplify-specific traction to prove the
  category exists.
- **Lebanon's food market is sizeable and growing** (~$6.35B in 2025, ~8.66% CAGR through
  2030 per Statista Market Insights — see §1.7), giving a real near-term addressable base
  before any regional expansion is needed to justify the thesis.
- **Digitization gap remains wide** in Lebanon/MENA restaurant-supplier coordination
  relative to the US/EU market most named competitors (Part 4) were built for — most of
  those competitors have shallow or no MENA presence, localization, or Arabic support today
  (to be verified competitor-by-competitor in Part 4; not asserted here as a fact beyond
  the absence of evidence found so far).
- **The technology bet already de-risked**: cloud infrastructure, managed Postgres/Redis,
  and OIDC identity (Keycloak) are mature, inexpensive building blocks — Supplify did not
  need to solve novel infrastructure problems to reach its current maturity, and won't need
  to for the next stage of growth either.

## 1.15 Success Metrics _(targets — no actuals exist yet)_

These are proposed milestones for the 0–18 month horizon, explicitly framed as targets to
be replaced with real figures once the company launches. They are not commitments and
should be revisited once real usage data exists (see Part 12 for the financial model these
targets would feed).

| Metric                            | 6-month target                          | 12-month target                                                               | 18-month target                      |
| --------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| Paying restaurant tenants         | First paying cohort (low single digits) | Tens                                                                          | Low hundreds                         |
| Paying supplier tenants           | First paying cohort (low single digits) | Tens                                                                          | Dozens                               |
| Free-trial → paid conversion rate | Measured, baseline established          | Improving against baseline                                                    | Benchmarked against Part 7 model     |
| Plan mix                          | N/A                                     | Gold as modal plan (per pricing design intent, §1.10)                         | Gold as modal plan, Platinum present |
| Feature-catalog integrity         | N/A                                     | Zero Platinum features sold without full backend enforcement (close §1.2 gap) | Maintained                           |
| Net revenue retention             | N/A                                     | Measured, no target set until real cohort exists                              | Target to be set from Part 12 model  |

---

### Sources & assumptions used in this part

- Product/feature/architecture claims: internal codebase audit conducted 2026-07-01
  against `apps/api`, `apps/web`, and `docs/product/`, `docs/onboarding/`,
  `docs/sales/tier-matrix.md` (verified 2026-05-28 per that document's own header).
- Lebanon F&B establishment estimate: derived from headcount figures in
  [Hospitality News ME (2025)](https://www.hospitalitynewsmag.com/lebanon-fb-industry/);
  not an official register count — flagged as a derived estimate throughout.
- Lebanon food market size/CAGR: Statista Market Insights, Food — Lebanon outlook,
  accessed 2026-07-01.
- Global restaurant procurement software market size/CAGR: DataIntelo and MarketIntelo
  market research reports, accessed 2026-07-01 — both are paid-report aggregators without
  disclosed primary methodology in the search snippet; suitable for directional framing
  only, and should be re-verified (or replaced with a Gartner/Grand View Research figure)
  before this document is shown to sophisticated investors. This will be revisited with
  additional cross-checks in Part 2.

**Open items for founder review before this part is considered final:**

1. Confirm or rewrite the proposed Vision (§1.3), Mission (§1.4), and Core Values (§1.5).
2. Confirm whether corporate entity/jurisdiction/cap-table details (currently omitted, §1.2)
   should be added to a restricted appendix.
3. Confirm the 0–36 month objective horizon (§1.6) is realistic given actual team size and
   runway (not modeled in this part — will be needed for Part 12).
