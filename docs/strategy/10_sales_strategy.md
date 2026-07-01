# Part 10 — Sales Strategy

**Document status:** Draft, part 10 of 16. Same disclosure standard as
[Part 1](./01_executive_summary_and_foundations.md), [Part 7](./07_business_strategy.md),
and [Part 11](./11_product_strategy.md): every claim below is either a verified fact from
the codebase/docs (cited inline) or an explicitly labeled recommendation, target, or
assumption. Company stage, restated because it governs every recommendation in this part:
**pre-launch** (zero live paying tenants), **bootstrapped** (no institutional capital, no
sales team, no marketing spend committed). This part does not invent a sales organization
that does not exist — it describes the sales motion a founder-led, pre-launch company
should run with the product and mechanics that are actually shipped today.

---

## 10.1 Sales Model & Motion

**There is no sales team.** Part 1's Business Model Canvas states this directly: "founder-led
sales and support (no dedicated sales team yet)" (§1.11, Cost Structure), and Part 7 confirms
near-term customer acquisition cost is "dominated by founder time opportunity cost, not paid
acquisition spend" (§7.11). This part does not model quota-carrying reps, an SDR function, or
a sales org chart — none exist, and inventing one would contradict the rest of this document.

**The motion is a hybrid of self-serve product-led growth and founder-led direct sales**,
split along the same line the product itself already draws:

- **Self-serve (Free Trial → Silver/Gold).** A restaurant or supplier can register, complete
  setup, and activate a Free Trial with no human involved: Keycloak-hosted registration →
  `/register/complete` (choose Restaurant or Supplier, business name, optional phone) →
  `pending_activation` lock → **"Activate free plan"** with no payment method required
  (`docs/features/tenant-registration.md`). This is real and live today, not a roadmap item.
  Once inside the product, the standardized limit/feature-block system (§10.3 below) does
  most of the persuasion work without a salesperson present.
- **Founder-led (Gold/Platinum multi-branch, Enterprise-track).** Part 1's Business Model
  Canvas explicitly reserves "high-touch sales for Platinum/Enterprise" (§1.11). A real,
  already-written discovery and onboarding checklist exists for this motion
  (`docs/sales/enterprise_checklist.md`) — see §10.5 and §10.7.

**A material, disclosed constraint on this motion: real payment collection is not live in
production yet.** Part 11 states plainly that `apps/api/src/lib/billing/providers/stub.js`
is "explicitly labeled 'Development / placeholder gateway'" and that shipping a live
processor is "the single hardest blocker on Part 1's 0–6 month objective" (§11.1). What does
exist alongside the stub is a **manual gateway** (`apps/api/src/lib/billing/providers/manual.js`)
described in its own code comment as "admin-recorded or offline payments (bank transfer
confirmed manually)" — it tokenizes a payment method as `MANUAL`/`BANK_ACCOUNT` and marks a
charge `succeeded` unconditionally, i.e., it is a trust-based, admin-attested record of an
offline payment, not a verified real-time settlement. **The realistic implication for sales
in the first cohort:** the founder should expect to close the first paying restaurant and
supplier tenants via manual invoicing (bank transfer, confirmed and recorded by an admin
through the manual gateway) rather than promising self-serve card checkout, until a live
processor ships. This should be disclosed to any prospect who asks how billing works, and
to any investor evaluating the go-to-market motion — it is a real, current limitation, not
a hypothetical one.

**No sales CRM or pipeline-tracking tool is documented anywhere in the codebase or docs.**
A search across `docs/` for common CRM tooling (HubSpot, Pipedrive, Salesforce, Zoho,
Intercom) surfaces only the supplier-side "customer growth" feature — a CRM _for suppliers to
manage their restaurant customers_ inside the product, not a CRM for Supplify's own sales
pipeline. Not urgent while prospect volume fits in a spreadsheet; flagged as an open item
once volume increases (see closing section).

**Recommended framing for this part:** the "sales model" for the next 6 months is not a
motion to build — it is a motion to _run_, using instrumentation the product already ships
(§10.3), the discovery/enterprise checklist that already exists (§10.5), and manual invoicing
as a bridge until the billing gateway is real. The engineering-facing roadmap in Part 11
(payment gateway, catalog-only gap closure) is a sales-enablement dependency, not a separate
workstream — every week that gateway and gap remain open is a week the sales motion described
here operates with a real handicap.

## 10.2 Target Customer Segmentation & Prioritization

Lebanon's food-service sector is estimated at roughly **4,000–4,500 operating F&B
establishments**, a figure derived from headcount data rather than an official register
count (Source: [Hospitality News ME, "Lebanon's F&B industry: what's cooking in 2025"](https://www.hospitalitynewsmag.com/lebanon-fb-industry/),
as cited in Part 1 §1.7). No public dataset segments that population by supplier count,
branch count, or digitization readiness — the prioritization below is therefore a
**judgment call grounded in the product's own pricing and limit design**, not a market-sizing
exercise with independent data behind it. It should be validated against the founder's actual
Lebanon relationships, which this document does not have visibility into (see Part 1 §1.2,
"specifics provided under NDA").

**Restaurant-side prioritization, in order:**

1. **Multi-supplier independent restaurants, cafés, and cloud kitchens (5+ active suppliers,
   1–2 locations).** This is the segment for whom the core problem statement (`docs/sales/01_problem.md`
   — "manual ordering," "no single view," fragmented reconciliation) is most acute, and it maps
   directly onto the pricing ladder: Silver's `suppliers_per_restaurant` cap is 5, Gold's is 30
   (`docs/product/tier-matrix.md` §3) — a restaurant already juggling 5+ suppliers outgrows
   Silver quickly, which is the intended upgrade trigger (Part 7 §7.2). A restaurant with one
   or two suppliers has comparatively little fragmentation pain to solve and is a weaker early
   target regardless of size.
2. **Small restaurant groups (2–3 branches) already past the single-location stage.** These
   map to Gold's 2-branch default and the branch add-on mechanism (`restaurant_extra_branch`,
   $39–49/mo, `tier-matrix.md` §5b) — a segment where Supplify's "multi-branch depth without
   an Enterprise contract" positioning (Part 1 §1.4) is a genuine differentiator versus
   point-solution competitors.
3. **Hotels, larger chains, and catering companies (4+ branches, Platinum/Enterprise-track).**
   Deliberately sequenced last, not because the segment lacks value, but because it is the
   segment most likely to test the catalog-only Platinum gap (full API/webhooks, white-label,
   central purchasing — `tier-matrix.md` §7) and ask for integrations (EDI, SSO) that do not
   exist yet (`docs/sales/enterprise_checklist.md`, "Integration & SLA" section). Part 7's
   own recommendation applies here directly: do not actively pursue this segment until a
   Gold/Platinum reference customer exists (§7.4).

**Supplier-side prioritization, in order:**

1. **Mid-market F&B distributors with an existing, sizeable restaurant customer book
   (roughly dozens to a few hundred active accounts), but without a locked-in EDI/ERP
   relationship.** This is the highest-priority segment for a structural reason specific to
   Supplify's product, not a general market-attractiveness argument: the supplier-side CSV
   customer import (`docs/features/supplier-customer-growth.md`) only creates leverage if the
   supplier has a real book of existing restaurant relationships to import. A distributor
   with 5 customers has little to import; a distributor already committed to a competitor's
   EDI integration is a longer, harder sales cycle Supplify cannot currently win on
   integration depth (§10.6, objection 5). Mid-market is the sweet spot on both dimensions.
2. **Small/independent distributors and specialty suppliers (single warehouse, growing
   catalog).** A reasonable second-priority segment — Silver/Gold fits their scale directly
   (`tier-matrix.md` §5, 1–3 warehouses) — but with a smaller customer book to import, the
   chicken-and-egg mitigation in §10.4 is weaker for this segment specifically.
3. **Large/enterprise distributors and category expansion (packaging, cleaning, equipment
   suppliers).** Explicitly out of scope for the current sales motion. Part 1 places
   non-food-and-beverage supplier categories on a 24–36 month horizon (§1.6) — "a
   go-to-market and category-specific catalog exercise, not a re-architecture," but not a
   near-term GTM focus. Large enterprise distributors carry the same integration/EDI
   objection as large restaurant chains and should follow the same "not yet" sequencing.

## 10.3 Sales Funnel / Pipeline Stages

The funnel below is mapped to real, shipped product touchpoints — not a generic SaaS funnel
template. Every stage after "First Touch" is instrumented in the product today
(`docs/product/monetization-ux.md`; conversion tracking referenced in
`docs/sales/08_pricing_strategy.md`).

| Stage                                              | Real touchpoint                                                                                                                                                                                                                                                                                        | What exists today                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Awareness / first touch**                     | Founder direct outreach, demo booking                                                                                                                                                                                                                                                                  | No paid or organic marketing channel is modeled in this document — that is Part 9's scope (not yet started per `README.md`). At this stage, awareness is founder-network-driven, consistent with Part 1's "founder market access" framing (§1.13).                                                                                                                                 |
| **2. Discovery / demo**                            | `docs/sales/enterprise_checklist.md` discovery questions; `docs/onboarding/12-demo-script.md` scripted walkthroughs                                                                                                                                                                                    | Real, usable collateral exists for both self-guided and founder-led demos — see §10.5.                                                                                                                                                                                                                                                                                             |
| **3. Free Trial signup**                           | `/register/complete` → **Activate free plan**                                                                                                                                                                                                                                                          | Live, self-serve, no card required (`docs/features/tenant-registration.md`). Trial ships with **Gold-equivalent feature flags** and Free-tier limits, 7–90 days, default 30 (`docs/features/free-trial-expiry.md`) — the trial itself is the strongest self-serve sales asset the company has, because a prospect sees full Gold functionality, not a crippled demo (Part 7 §7.3). |
| **4. In-trial usage / product-qualified signal**   | Standardized `LIMIT_EXCEEDED` / `FEATURE_NOT_AVAILABLE` API errors → `UpgradeModal`; 80% usage-warning banner; proactive nudge after ≥3 blocks in 7 days; `RecommendedBadge` from `GET /api/subscriptions/recommendation`; Nav "Upgrade" CTA (`docs/product/monetization-ux.md`, B1–B3, Launch Polish) | Fully shipped. The admin dashboard's **conversion funnel** stats (blocks → upgrades, most-blocked feature/limit — `docs/sales/06_admin_and_operations.md`) let the founder identify which trial tenants are hitting real friction — a genuine, already-built product-qualified-lead (PQL) signal that most pre-launch companies have to build from scratch.                        |
| **5. Conversion (first paid)**                     | `POST /api/billing/checkout`                                                                                                                                                                                                                                                                           | Mechanically live, but see §10.1's billing caveat — expect this step to run through **manual invoicing** (bank transfer confirmed via the `manual` gateway) for the first cohort, not automated card checkout, until a live processor ships (Part 11 §11.1).                                                                                                                       |
| **6. Expansion (upsell / add-ons)**                | Branch/warehouse add-ons (admin-provisioned, `PUT /subscription-addons/:addonKey`); tier upgrade nudges continue post-conversion                                                                                                                                                                       | Add-on sales require a manual admin step today (`tier-matrix.md` §5b) — a real, disclosed operational gap (Part 11 §11.1), not a hypothetical one. Tier upsell (Silver→Gold→Platinum) is driven by the same usage-nudge system as trial conversion.                                                                                                                                |
| **7. Enterprise track (parallel, not sequential)** | `docs/sales/enterprise_checklist.md` — discovery, sizing, integration/SLA, contract fields, onboarding steps, indicative timelines                                                                                                                                                                     | A real, already-written internal template for a structured enterprise sales process. It should be treated as **the company's own planning assumption**, not a track record — no Enterprise deal has been run through it yet. Per Part 7 §7.4, this track should not be actively pushed until a Gold/Platinum self-serve reference customer exists.                                 |

**What this funnel does not yet have:** a top-of-funnel acquisition channel beyond founder
network and the referral/sponsorship loop described in §10.4. That gap is explicitly Part 9's
scope (Marketing Plan), not fabricated here.

## 10.4 Two-Sided Marketplace Sales Complexity

Supplify must acquire **both** restaurants and suppliers for either side to get value — a
restaurant with no connected suppliers has nothing to order from, and a supplier with no
restaurant customers on the platform has no orders to fulfill. This is the standard
cold-start problem for a two-sided marketplace, stated here as a structural fact about the
business model, not a sourced statistic.

**The product's actual, shipped mechanics for addressing this — not a hypothetical plan:**

1. **Supplier-side CSV customer import inverts the usual acquisition order.** A supplier
   already has an existing book of restaurant relationships (built over years of phone/email
   ordering) that Supplify has never had to acquire independently. The growth program
   (`docs/features/supplier-customer-growth.md`) lets a supplier import that book directly via
   CSV (columns: Restaurant Name, Contact Person, Phone, Email, Address, Area/Region, Credit
   Limit, Payment Terms, Sales Rep, Notes), with automatic matching against existing Supplify
   tenants (email exact → phone → name+area fuzzy). This means the correct sequencing for the
   founder-led motion is **the reverse of the typical marketplace playbook**: land one or two
   "anchor" suppliers first, and inherit a batch of already-warm restaurant prospects through
   their import — rather than cold-acquiring restaurants first and hoping suppliers follow.
2. **A matched-but-not-yet-connected restaurant gets a low-friction path, not a cold outreach
   problem.** If the imported restaurant is already a Supplify tenant, the supplier sends a
   **connection request** that the restaurant accepts to create a `supplier_follow` link — no
   re-onboarding required. If the restaurant is not yet on the platform, the supplier can
   **invite** (email, WhatsApp share link, or copy link) or **sponsor** onboarding entirely.
3. **Sponsorship removes the price objection from the acquisition wedge.** A supplier can pay
   to give a prospect restaurant one month of Silver, Gold, or Platinum access outright
   (`supplier_sponsorship` table), subject to per-plan annual limits: **2/year on Silver,
   10/year on Gold, 25/year on Platinum, unlimited on Enterprise**
   (`docs/features/supplier-customer-growth.md`, "Sponsorship limits"). This is a genuinely
   elegant mechanic commercially: it ties a supplier's own acquisition capacity to their plan
   tier, giving Supplify a second, non-obvious reason to upsell a supplier to Gold beyond that
   supplier's own operational limits — more sponsorship slots to acquire their own customers.
4. **Financial incentives are coupled across both sides, not independent.** A referred
   restaurant gets a 30-day Free Trial plus a 20%-off first-paid-subscription discount
   (admin-configurable); the referring supplier earns one free month or a platform billing
   credit when that referral converts to paid. Part 7 already frames this correctly: it
   "aligns supplier retention with restaurant retention" (§7.9) — and it substitutes for cash
   CAC in a channel that would otherwise require Supplify to fund acquisition directly
   (Part 7 §7.11).

**What this does not solve:** the very first anchor supplier(s) still have to be acquired
the hard way — founder-led, no importable book on Supplify's side to leverage yet. The growth
loop above only compounds _after_ at least one supplier is live and willing to import their
book, which is why §10.2 prioritizes anchor-supplier acquisition ahead of broad restaurant
outreach, not the reverse. This is a sequencing recommendation, not a proven playbook — it
has not been run yet.

**One RBAC fact worth confirming before relying on this mechanic in a sales conversation:**
the import/invite/sponsor permissions (`CUSTOMERS_IMPORT`, `CUSTOMERS_MANAGE`, `GROWTH_VIEW`)
are already seeded onto the Supplier **Owner** and **Supplier Manager** system roles
(`docs/features/supplier-customer-growth.md`, "RBAC") — meaning a supplier can use this
feature immediately upon signup, with no additional configuration or sales engineering
required. This is a genuine, usable-today asset, not a roadmap dependency.

## 10.5 Sales Enablement

**What is real and usable today:**

- **The Free Trial itself.** As noted in §10.3, a self-serve trial with Gold-equivalent
  features is the single most persuasive piece of "collateral" the company has — it is the
  product, not a deck about the product.
- **`docs/sales/01_problem.md` through `08_pricing_strategy.md`.** Eight internal narrative
  documents (problem, solution, platform overview, roles/security, subscriptions/controls,
  admin/operations, scalability/enterprise, pricing strategy) written in clean, buyer-facing
  prose. These are real, already-written source material for external collateral, but they
  exist today as internal markdown files, not a designed deck, one-pager, or website copy —
  a design/formatting pass, not new content creation, is what stands between these and
  externally shareable material.
- **`docs/onboarding/Supplify-Customer-Presentation.md`.** A genuinely customer-facing
  overview document already exists — pillar cards for each persona, a status-quo-pain table,
  a plan comparison table, a "go live in weeks" onboarding timeline, and closing CTAs ("Book
  a demo," "Start a Free Trial," "Go live"). This is the closest thing to a real pitch deck
  Supplify has today. It has not been confirmed as used with any real external prospect yet
  (see open items).
- **`docs/sales/enterprise_checklist.md`.** A genuinely operational one-page checklist for
  Platinum/Enterprise-track discovery, sizing, integration/SLA scoping, a contract-fields
  template, and an onboarding sequence with indicative phase durations. This is real,
  reusable internal collateral — not aspirational — though it is a **template with no deals
  run through it yet**, so its timelines are internal planning assumptions (used directly in
  §10.7), not track record.
- **A real, seeded demo environment.** `docs/onboarding/12-demo-script.md` documents a
  complete demo environment (local or staging, via `pnpm run seed:full`), named demo accounts
  at Gold tier with active billing (`admin@supplify.com`, `restaurant@supplify.com`,
  `supplier@supplify.com`), and five distinct scripted walkthroughs (5-minute executive,
  15-minute standard, 30-minute full, restaurant-only, supplier-only, admin/ops, plus a
  driver/logistics add-on) — each with narration, expected results, and a fallback path if a
  step doesn't render live. It also documents, honestly, what to avoid in a live demo:
  Delivery Zones/Contacts settings are not wired to a backend, restaurant finance opening
  balance is hardcoded to `0`, and the dashboard's 7d/30d/90d selector is visual only with a
  fixed 30-day spend trend underneath. This is a mature sales-enablement asset that a
  founder can run today.

**One distinction worth confirming before this is presented as "we have a demo
environment" externally:** the demo script's own header states the environment is "**Local
or staging**" — a founder-run environment prepared before a call, not a persistent,
prospect-facing sandbox a lead could self-serve into from a website. That is a materially
different claim ("we can demo the product live" vs. "anyone can try a live sandbox right
now"), and this document has no evidence the latter exists.

**What is genuinely missing, not just undiscovered:** a branded, externally shareable pitch
deck or one-pager (the content exists in the docs above; the artifact does not appear to);
customer references or case studies (structurally impossible before launch, not an
oversight); a lightweight sales pipeline/CRM tool (§10.1); and a security/compliance
one-pager for the enterprise/GCC segment — Part 11's security assessment (§11.4) is real and
detailed, but it is an internal document, not formatted for a prospect's questionnaire.

## 10.6 Objection Handling

Grounded in the same disclosed gaps this document's companion parts already name — not
softened for a sales context, because the same prospect asking these questions in a security
review or contract negotiation will find the gap regardless.

| Objection                                                                                                                                              | Honest, grounded response                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Platinum lists AI quick lists, advanced custom reports, full API/webhooks, white-label domains, and central purchasing — do these actually work?"** | Partially. **Smart Reorder forecasting, "explain" (Gold+), and "ask" (Platinum)** are real, shipped AI with a working OpenAI integration (`docs/features/ai-smart-reorder.md`; Part 11 §11.2). But "AI quick lists," "advanced/custom reports," full API/webhooks, white-label domain, and central purchasing are **catalog entries without backend enforcement** (`docs/product/tier-matrix.md` §7; Part 11 §11.1, §11.6). Do not represent these as available today. Sell Platinum on what is real, disclose the roadmap items explicitly, and consider a negotiated discount or committed date for any deal that specifically needs a catalog-only item. |
| **"How do I actually pay you — will my card be charged automatically?"**                                                                               | Not yet, in production. The live billing gateway is a development stub (Part 11 §11.1); the near-term path is manual invoicing (bank transfer, recorded via the `manual` gateway — §10.1). Be direct rather than implying automated recurring billing exists today.                                                                                                                                                                                                                                                                                                                                                                                         |
| **"Where is my data hosted — is it safe, and what happens if Supplify goes down?"**                                                                    | A static security review found zero Critical findings, with solid fundamentals (Keycloak OIDC, parameterized SQL, 52-key RBAC, audit logging) in place (Part 11 §11.4). Equally honest: infrastructure is **single-region** with no failover (Part 11 §11.5), rate limiting is in-memory, and there is **no SOC 2 or ISO 27001**. Reasonable for an independent restaurant; a genuine gap for an enterprise/GCC buyer running a security questionnaire — say so plainly.                                                                                                                                                                                    |
| **"We already coordinate fine over WhatsApp and phone calls — why switch?"**                                                                           | The exact problem Supplify's own materials name (`docs/sales/01_problem.md`; Part 1 §1.7). Acknowledge WhatsApp "works" at small scale; frame value around what breaks as suppliers/locations multiply (no shared record, manual reconciliation, evidence-free disputes) rather than a fabricated hours-saved figure — Part 1 declines to cite one for this exact reason (§1.7).                                                                                                                                                                                                                                                                            |
| **"Can you integrate with our EDI system, accounting software, or POS?"**                                                                              | Not today. The one real asset is a one-way, manual **QuickBooks-compatible CSV export** (Part 11 §11.3) — no live QuickBooks/Xero sync, no EDI, no POS integration. This is why larger, already-integrated distributors are sequenced lower in §10.2 — do not commit to a timeline Part 11's roadmap doesn't support.                                                                                                                                                                                                                                                                                                                                       |
| **"We're a hotel/chain with several branches — can we run central purchasing across all of them?"**                                                    | Not as a differentiated product today — "central purchasing" is a Platinum catalog-only string behaving like Gold's `multi_branch` (`tier-matrix.md` §7; Part 11 §11.1, §11.8). What's real: strong multi-branch RBAC, a Regional Manager role, and linked branch accounts under one org (`docs/architecture/tenancy.md`) — a credible foundation, described honestly as a foundation, not a finished engine.                                                                                                                                                                                                                                               |
| **"You have zero live customers. Why would we be first?"**                                                                                             | Product risk, not market risk, is what's retired here (Part 1 §1.13) — 180 migrations, 225+ backend and 100+ frontend tests, and the hard parts (RBAC, billing enforcement, GPS logistics, real-time chat) are already built. Frame being early as direct access to the builders, not a downside.                                                                                                                                                                                                                                                                                                                                                           |
| **"Given the economic situation in Lebanon, can we even reliably pay you in USD?"**                                                                    | A legitimate, structural concern. Part 13 documents the Lebanese currency/banking crisis in full (§13.3–13.4): a customer's inability to reliably access USD is a real payment-collection risk the pricing model doesn't solve. Offer payment-method flexibility (the manual gateway, negotiated terms) rather than a rigid card-only signup, and track payment-failure/churn-reason data once it exists (Part 13 §13.4).                                                                                                                                                                                                                                   |

## 10.7 Sales Cycle & Deal Size Expectations _(targets/assumptions — no actuals exist)_

**No real sales cycle or deal data exists — zero closed deals to date.** The figures below
are either (a) directly derived from real, shipped pricing (deal size) or (b) modeled
assumptions built from the company's own existing internal planning template
(`docs/sales/enterprise_checklist.md`), clearly labeled as such and not as track record.

**Deal size (ACV), derived directly from live pricing** (`docs/product/tier-matrix.md` §1):

| Plan       | Monthly × 12 | Annual (discounted) | Notes                                                                              |
| ---------- | -----------: | ------------------: | ---------------------------------------------------------------------------------- |
| Silver     |         $588 |                $490 | First paid tier, either tenant type                                                |
| Gold       |       $1,788 |              $1,490 | Modal/target plan (Part 1 §1.15)                                                   |
| Platinum   |       $4,188 |              $3,490 | Plus possible branch/warehouse add-ons ($19–$69/mo per unit, `tier-matrix.md` §5b) |
| Enterprise |       Custom |              Custom | Not self-serve; no pricing benchmark exists (`tier-matrix.md` §1)                  |

The blended ARPU assumption used in Part 7's LTV model (~$110/month, weighted toward Gold as
the modal plan) is restated here for consistency, with the same caveat Part 7 applies: it is
a **stated assumption, not a measured figure** (§7.10).

**Sales cycle, modeled — not measured:**

- **Self-serve (Silver/Gold, independent restaurant or small supplier).** Modeled assumption:
  same-day to roughly two weeks from Free Trial signup to first paid conversion, bounded on
  the high end by the trial window itself (7–90 days, default 30 —
  `docs/features/free-trial-expiry.md`). This is inferred from the product's own trial-length
  design, not from observed conversions, since none exist yet.
- **Founder-led (Gold/Platinum multi-branch, enterprise-track).** `docs/sales/enterprise_checklist.md`
  already states internal target timelines for this track: Discovery (1–2 calls), Proposal
  (3–5 days), Legal/DPA (1–3 weeks), Provisioning (1–2 days post-sign), Onboarding (1–2
  weeks), Go-live by week 2–4. Summed, this implies a **modeled target of roughly 3–7 weeks**
  end-to-end for a structured deal with light legal/DPA requirements — longer if a prospect
  requests SSO or EDI integration, since neither exists yet (§10.6, objection 5). This is the
  company's own planning template, being used here as a stated assumption; **no deal has
  actually been run through it**, so treat the timeline as directional, not a commitment.
- **Enterprise.** No cycle assumption is offered beyond the checklist template above. Part 7
  §7.4's recommendation stands: this track should not be actively pursued until a
  Gold/Platinum self-serve reference customer exists — modeling a cycle for a track the
  company should not yet be running would be misleading.

## 10.8 Channel Partnerships _(speculative — no partnerships exist today)_

No channel, reseller, or integration partnership agreement exists today. The items below are
opportunity-spotting, sequenced by how directly they depend on product work already scoped
elsewhere in this document — not a pipeline, and none should be represented as active.

- **POS integration partners (regional MENA POS providers).** Speculative until the POS
  integration item on Part 11's roadmap ships (§11.3, sequenced fourth in that list, after
  payment gateway, WhatsApp, and accounting sync) — a co-marketing or referral relationship
  with a POS vendor is only credible once a real integration exists to point to.
- **Accounting/bookkeeping practices serving multiple restaurant or supplier clients.**
  Speculative — potentially a referral channel once the existing one-way QuickBooks CSV
  export (Part 11 §11.3) matures into a genuine two-way sync; premature to formalize before
  that ships, since the current asset (a manual CSV export) is not a compelling reason for an
  accounting practice to refer clients.
- **F&B trade associations and industry events in Lebanon.** Named as a future channel in
  Part 1's Business Model Canvas ("future: trade associations, industry events (Part 8/9)" —
  §1.11) — no relationship is confirmed to exist; this is explicitly a Part 9 (Marketing Plan)
  dependency, not a claim made here.
- **Regional master-distributor or reseller relationships for GCC entry.** Speculative and
  tied to Part 14 (Expansion Strategy), which has not started. Not modeled here beyond
  flagging it as a mechanism worth evaluating once GCC market research exists.

## 10.9 Sales Metrics & KPIs _(targets to adopt at launch — no actuals exist)_

**Already instrumented and available from day one** — a genuine advantage, since most
pre-launch companies have to build this tracking from scratch:

- Plans viewed, upgrade modal opened, plan changed (`docs/sales/08_pricing_strategy.md`,
  "Conversion tracking").
- Blocked-event counts by feature/limit key, and the admin-visible **blocks → upgrades**
  conversion rate and most-blocked feature/limit (`docs/sales/06_admin_and_operations.md`;
  `docs/product/monetization-ux.md` B3).
- `GET /api/subscriptions/recommendation`-driven "Recommended" plan impressions, usable as a
  proxy for identifying product-qualified leads before they self-convert.
- Supplier growth program aggregates via `GET /api/supplier/growth/metrics` — import volume,
  connection-request acceptance, referral conversions (`docs/features/supplier-customer-growth.md`).

**KPIs to define explicit targets for once real signups exist** (all currently unmeasured;
none of the following should be reported as an actual until a real cohort produces data):

| KPI                                                                        | Status                                                | Note                                                                                                                                              |
| -------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free Trial signups/month (restaurant vs. supplier)                         | Target to be set at launch                            | No baseline exists                                                                                                                                |
| Free Trial → paid conversion rate                                          | Target: establish baseline in first 6 months          | Matches Part 1 §1.15's own framing                                                                                                                |
| Blocked-event → upgrade conversion rate                                    | Trackable today via existing instrumentation          | Should be the first KPI reviewed weekly post-launch — the mechanism already exists                                                                |
| Supplier CSV import volume and match/connection-acceptance rate            | Trackable today via growth metrics endpoint           | Leading indicator for the two-sided cold-start mitigation in §10.4                                                                                |
| Sponsorship redemption rate vs. per-plan annual limits (2/10/25/unlimited) | Trackable today                                       | Signals whether the acquisition subsidy mechanic in §10.4 is actually being used                                                                  |
| Plan mix (share on Gold)                                                   | Target: Gold as modal plan by month 12 (Part 1 §1.15) | Restated here for consistency, not re-derived                                                                                                     |
| Founder time cost per acquired paying tenant (hours)                       | Not tracked today — recommend starting immediately    | This is the real CAC in the founder-led phase (Part 7 §7.11); it should be logged from the first prospect conversation, not modeled retroactively |
| Net revenue retention                                                      | Deferred                                              | No cohort exists yet to measure it against (Part 7 §7.9)                                                                                          |

---

### Sources & assumptions used in this part

- Sales motion, pricing, and billing-gateway status: `docs/sales/01_problem.md` through
  `08_pricing_strategy.md`, `docs/sales/enterprise_checklist.md`; Part 11 §11.1, §11.3
  (billing gateway code inspection: `apps/api/src/lib/billing/providers/stub.js`,
  `manual.js`).
- Tenant registration and Free Trial mechanics: `docs/features/tenant-registration.md`,
  `docs/features/free-trial-expiry.md`.
- Pricing ladder and limits: `docs/product/tier-matrix.md`, `docs/product/subscriptions.md`
  (verified 2026-05-28 per that document's own header).
- Monetization UX / in-app upgrade mechanics: `docs/product/monetization-ux.md`.
- Two-sided growth mechanics: `docs/features/supplier-customer-growth.md` (migration `0169`).
- Demo environment and collateral: `docs/onboarding/12-demo-script.md`,
  `docs/onboarding/Supplify-Customer-Presentation.md`.
- Lebanon F&B establishment estimate: [Hospitality News ME (2025)](https://www.hospitalitynewsmag.com/lebanon-fb-industry/),
  as cited in Part 1 §1.7 — a derived estimate, not an official register count.
- Consistency cross-checks: Part 1 §1.11 (Business Model Canvas), Part 7 §7.2–§7.11
  (pricing, retention, LTV/CAC), Part 11 §11.1–§11.6 (product roadmap and disclosed gaps),
  Part 13 §13.1, §13.3–§13.4 (technical and Lebanon macro/currency risk).

**Open items for founder review before this part is considered final:**

1. Confirm the manual-gateway-first billing approach (§10.1) is operationally acceptable for
   the first paying cohort, given it is a trust-based, admin-attested payment record rather
   than automated reconciliation — or whether closing the live payment gateway should be
   treated as a hard precondition before any sales conversation reaches a close.
2. Confirm whether a lightweight sales CRM/pipeline tool should be adopted now or deferred
   until prospect volume exceeds what a spreadsheet can track — none exists today.
3. Confirm whether `docs/onboarding/Supplify-Customer-Presentation.md` has been used with any
   real prospect yet, and whether it needs a design/branding pass before external use.
4. Confirm whether a standing, prospect-facing demo/sandbox environment is worth building, or
   whether the current founder-run local/staging demo (`docs/onboarding/12-demo-script.md`) is
   sufficient for the expected deal volume in the first 6 months.
5. Validate the segmentation prioritization in §10.2 (multi-supplier independent restaurants;
   mid-market F&B distributors with an importable customer book) against the founder's actual
   existing relationships in Lebanon — this document has no visibility into those
   relationships (Part 1 §1.2).
6. Decide whether to sell Platinum at all before the catalog-only gap (Part 11 §11.1, §11.6)
   closes, or to restrict early Platinum sales to an explicitly disclosed "early access"
   framing with a committed closure date.
