# Part 7 — Business Strategy

**Status:** Draft, part 7 of 16. Builds directly on Part 1 (§1.10 Business Model, §1.11
Business Model Canvas). Company remains pre-launch and bootstrapped — the pricing model
below is real and implemented in production code; the LTV/CAC figures are explicitly a
**forward model with stated assumptions**, not measured outcomes, because no paying cohort
exists yet. See [README.md](./README.md) for document scope.

---

## 7.1 Revenue Model

Supplify's revenue model is **dual-sided subscription SaaS**: both restaurant tenants and
supplier tenants are charged directly for platform access, independent of the value or
volume of orders flowing between them. This is a structural choice, not a placeholder — it
is fully implemented (`docs/product/tier-matrix.md`) with plan-based feature gating
enforced at the API layer (`requireFeature`/`checkLimit` middleware), not just hidden in
the UI. The practical implication: revenue is predictable and usage-independent per tenant,
at the cost of forgoing a GMV-linked revenue line that competitors with payment
rails (e.g., Toast) can capture. §7.6 addresses whether and how to revisit that trade-off.

## 7.2 Pricing Strategy

The pricing ladder is designed around a specific psychological and operational mechanic
already documented in `docs/sales/08_pricing_strategy.md`: **Free demonstrates value
without enabling real operations, Gold is the intended default for serious daily use, and
Platinum removes the need to think about limits at all.**

| Plan       | Price (mo / yr) | Restaurant orders/day | Restaurant SKUs | Branches |     Users | Positioning                                                                                       |
| ---------- | --------------: | --------------------: | --------------: | -------: | --------: | ------------------------------------------------------------------------------------------------- |
| Free Trial |          $0 / — |                     3 |              10 |        1 |         1 | Time-limited (7–90 days, default 30) sandbox — deliberately too low a ceiling for real operations |
| Silver     |      $49 / $490 |                    20 |             250 |        1 |         3 | First paid tier — single-location, price-sensitive operators                                      |
| Gold       |   $149 / $1,490 |                   100 |           3,000 |        2 |        15 | "Most Popular" — the intended default for any tenant running real daily volume                    |
| Platinum   |   $349 / $3,490 |             Unlimited |       Unlimited |        3 | Unlimited | "Unlimited Ops" — chains and large distributors who should never hit a wall                       |
| Enterprise |          Custom |                Custom |          Custom |   Custom |    Custom | Admin-assigned only; not self-serve (`tier-matrix.md` §1)                                         |

**Why this ladder, specifically:** the jump from Silver (20 orders/day) to Gold (100
orders/day) is a 5x step deliberately sized so that any restaurant doing more than
roughly 2–3 orders per weekday per branch outgrows Silver quickly — converting usage
pressure into an upgrade trigger rather than a support ticket. The annual discount
(~17% off monthly-equivalent on every paid tier) is a standard SaaS lever to improve cash
predictability and reduce monthly churn exposure; it has not yet been tested against real
customer price sensitivity in this market and should be treated as a hypothesis, not a
proven optimum, until post-launch data exists.

**Branch/warehouse add-ons** extend the ladder without forcing a full plan upgrade:
$39–49/month per extra restaurant branch, $49–69/month per extra supplier branch, $19–25
per extra supplier warehouse (`tier-matrix.md` §5b), capped at 6 total branch accounts
before Enterprise sales engagement is required. This is currently **admin-provisioned, not
self-serve billed** — a real, disclosed gap, not a hypothetical enhancement (see §7.6).

## 7.3 Subscriptions

The subscription engine is not a simple plan flag — it is a resolved-limits system with
three layers: plan default → plan-level override → tenant-level override, with overrides
constrained to increase-only (`tier-matrix.md` §9). This matters commercially because it
means Supplify can run **targeted commercial deals** (e.g., a limited-time higher SKU cap
for a pilot customer) without shipping new code or creating a new plan SKU — a real
negotiation lever the sales motion in Part 10 should use deliberately, not accidentally.

The Free Trial currently ships with **Gold-equivalent feature flags** and only Free-tier
limits (`tier-matrix.md` §6, disclosed as risk item). Commercially, this is a double-edged
design: it makes the trial maximally persuasive (a prospect sees the full Gold feature set,
not a crippled demo), but it also means the upgrade story has to be told entirely through
usage limits, not feature unlocks, for the Free→Silver/Gold conversion moment specifically.
Marketing and sales copy (Part 8/9/10) must be built around this reality, not around an
assumption that features are the upgrade hook at every tier boundary.

## 7.4 Enterprise

Enterprise is real in the schema (a distinct plan code with custom limits and SLA framing)
but **inactive and not self-serve** today (`tier-matrix.md` §1, §7) — it exists as a sales
container, not a live product tier. This is the correct sequencing for a pre-launch
company: Enterprise deals require a sales process, contractual terms, and support SLAs that
don't yet exist organizationally. Recommendation: do not actively sell Enterprise until
Gold/Platinum self-serve motion has at least one real reference customer — an Enterprise
deal closed on a product with zero live tenants is a credibility risk in the sales
conversation itself.

## 7.5 Marketplace (Take-Rate) Revenue — Deliberately Not Used Today

Unlike marketplace-style competitors that take a percentage of gross merchandise value or
payment volume, Supplify charges neither side a transaction fee. This is disclosed clearly
because it is a real strategic choice with real trade-offs:

- **Why not now:** a take-rate requires Supplify to sit in the payment flow (as a payment
  facilitator or via a licensed processor), which is a materially larger compliance and
  engineering lift (KYC, PCI scope, money transmission licensing considerations vary by
  country) than a subscription business — the wrong problem to solve before the company has
  a single paying subscription customer.
- **Why it remains attractive long-term:** at scale, a modest take-rate (even 0.5–1.5% of
  processed order value) compounds with GMV growth in a way flat subscription fees do not,
  and is standard in the category (evaluated further, competitor-by-competitor, in Part 4).
- **Recommendation:** revisit only after (a) Gold/Platinum subscription revenue is
  established and (b) a specific payment-processing partner (already referenced in the
  invoicing payment-method list — Stripe is present as a payment method today) can be
  evaluated for a facilitated-payments product. This is a Part 11 (Product Strategy) and
  Part 14 (Expansion) dependency, not a Part 7 decision to make in isolation.

## 7.6 Advertising / Sponsored Placement Revenue

The **paid promotions/deals** feature is already shipped: suppliers pay (via plan-gated
promotion slots — 1/3/25/unlimited active promotions on Silver/Gold/Platinum/Enterprise
respectively, `tier-matrix.md` §5) to surface deals to restaurant buyers, subject to admin
approval as a trust gate. This is Supplify's actual advertising/sponsored-placement revenue
line today — smaller and more contained than a full ad marketplace, appropriately so for
a pre-launch platform still establishing trust on both sides. **Do not expand this into an
open ad marketplace (e.g., pay-to-rank in search/catalog results) before launch** — it
would undermine the buyer trust the core value proposition depends on (§1.9), and there is
no evidence yet (zero live tenants) that demand for paid placement exists at all.

## 7.7 Future Revenue Streams

Ranked by proximity to what's already built, not by size of opportunity (an unlaunched
company should sequence by execution risk, not theoretical TAM):

1. **Automate add-on billing** (branches/warehouses) — closes an existing gap (§7.2) rather
   than adding a new product; lowest execution risk, should happen before most other items
   on this list.
2. **Payment facilitation / take-rate** (§7.5) — highest long-term value, highest
   compliance complexity; sequence after subscription revenue is proven.
3. **Category-expansion catalogs** (packaging, cleaning, equipment suppliers per Part 1
   §1.6) — same subscription model, new supplier categories; primarily a go-to-market and
   catalog-taxonomy exercise since the tenant model is already supplier-type agnostic.
4. **Accounting/POS integration marketplace** (Part 11 dependency) — potential future
   revenue via integration-tier pricing (e.g., an "integrations" add-on) once specific
   integrations exist; speculative until Part 11's integration roadmap is prioritized and
   built.
5. **API/webhooks as a paid tier differentiator** — `api_integrations` / `full_api_webhooks`
   (developer read API + order/invoice events) remains catalog-only; **notification webhooks**
   (`email_whatsapp_webhook`) are enforced (July 2026). Closing the developer API gap is
   still a trust/legal priority for Platinum IT buyers.

## 7.8 Expansion (Revenue Lens)

Expansion sequencing (Lebanon → GCC → MENA → Europe, per Part 1 §1.6 and detailed in Part 14) has direct pricing implications not yet resolved and flagged here as open questions for
Part 14: should GCC pricing be USD-denominated at the same $49/$149/$349 ladder (GCC
purchasing power is materially higher than Lebanon's), or should it be repriced upward for
GCC specifically? No decision is made in this document — it requires the GCC market
research in Part 14, not an assumption made in isolation here.

## 7.9 Customer Retention

Retention mechanics already built into the product, not hypothetical:

- **Usage-based upgrade nudges** (`docs/product/monetization-ux.md`): standardized
  `LIMIT_EXCEEDED`/`FEATURE_NOT_AVAILABLE` API responses drive an `UpgradeModal`, an 80%
  usage-warning banner, and a proactive nudge after 3+ blocks in 7 days. This is a real,
  shipped retention/expansion mechanic — it converts friction into a guided upgrade path
  rather than silent churn.
- **Supplier-driven customer growth program** (`docs/features/supplier-customer-growth.md`):
  suppliers import their existing restaurant customer base, invite or sponsor onboarding,
  and earn rewards (1 free month or a billing credit) when a referred restaurant converts
  to paid. This is a genuine product-led-growth and retention loop: a supplier who has
  sponsored a restaurant's onboarding has a direct incentive to keep that restaurant active
  on the platform, aligning supplier retention with restaurant retention.
- **Referred-restaurant incentive:** 30-day Free Trial + 20% off first paid subscription
  (admin-configurable), which lowers the effective CAC for referred restaurants
  specifically (see §7.11).

**What is not yet built:** a formal churn-prevention/win-back flow for tenants who
downgrade or lapse, and no net-revenue-retention instrumentation exists yet because no
paying cohort exists. Both are Part 12 (Financials) and Part 15 (Roadmap) dependencies once
real data exists.

## 7.10 LTV — Modeled, Not Measured

**No real LTV exists — zero paying customers today.** What follows is a transparent,
bottom-up model with explicit assumptions, built so it can be replaced cell-by-cell with
real numbers after launch. Treat every number below as a placeholder assumption, not a
forecast to raise capital against.

| Input                                           |                          Assumed value | Basis / caveat                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | -------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blended average revenue per paying tenant/month |                                  ~$110 | Assumption: modal plan is Gold ($149) per pricing design intent (§7.2), blended down by a minority of Silver tenants and a small number of unit-priced add-ons; **not measured**                                                                                                                              |
| Assumed monthly gross churn                     | 4% (~24-month average tenant lifetime) | Assumption only — SaaS benchmarks for SMB-focused vertical software commonly range 3–7% monthly; Supplify has no cohort data to confirm where it falls. **No source-specific citation exists for this number; it is a stated assumption**, consistent with this document's rule against fabricated statistics |
| Modeled average tenant lifetime                 |                             ~24 months | Derived from the churn assumption above (1/0.04); mechanically follows from it, not independently sourced                                                                                                                                                                                                     |
| Modeled gross LTV                               |                                ~$2,640 | $110 × 24 months; **before** CAC, support cost, or payment processing cost — a gross revenue figure, not a profit figure                                                                                                                                                                                      |

This model should be rebuilt entirely once the first 20–30 paying tenants have at least
3–6 months of billing history — modeling churn before any customer has had the chance to
churn is not meaningfully predictive, and this document does not pretend otherwise.

## 7.11 CAC — Modeled, Not Measured

Similarly, no real CAC exists. The near-term go-to-market motion (Part 9/10) is
founder-led, direct sales in Lebanon — meaning near-term CAC is dominated by **founder time
opportunity cost**, not paid acquisition spend, which is typical and appropriate for a
pre-launch, bootstrapped company and should not be dressed up as a "low CAC" advantage
without that caveat.

| Channel                                   |                                                             Assumed cash cost per acquired paying tenant | Caveat                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Founder-led direct sales (initial motion) |                                                                     Near-$0 cash, high founder time cost | Time cost not monetized here; real opportunity cost should be tracked in hours/customer once launched                                                 |
| Supplier-driven referral (§7.9)           | Effectively subsidized by the 20% first-paid discount + supplier reward (1 month free or billing credit) | Real, shipped mechanic — the actual "CAC" here is the discount/reward cost, which is directly calculable once conversions occur, unlike paid channels |
| Future paid channels (Part 9)             |                                                                                              Not modeled | No paid marketing spend exists yet; do not forecast a CAC for a channel that hasn't run                                                               |

**Implied LTV:CAC framing:** with near-zero cash CAC in the earliest cohort (founder-led
and referral-driven), even the conservative gross LTV assumption above (~$2,640) implies a
favorable ratio — but this is an artifact of pre-launch, founder-led distribution, not
evidence of a scalable, paid-channel-viable CAC. The real test is what CAC looks like once
Part 9's paid/outbound channels are attempted; until then, this ratio should not be
presented to investors as a proven unit-economics result.

---

### Sources & assumptions used in this part

- Pricing, limits, and add-on figures: `docs/product/tier-matrix.md` (verified 2026-05-28
  per that document's own header).
- Pricing design rationale: `docs/sales/08_pricing_strategy.md`.
- Upgrade-nudge and monetization UX mechanics: `docs/product/monetization-ux.md`.
- Referral/growth program mechanics: `docs/features/supplier-customer-growth.md`
  (migration `0169`).
- LTV/CAC inputs (§7.10–7.11): stated modeling assumptions, explicitly not sourced from
  real usage data, because none exists at time of writing (company is pre-launch).

**Open items for founder review:**

1. Confirm the annual-discount-drives-lower-churn hypothesis (§7.2) is one you want tested
   at launch, or whether monthly-only pricing should be tried first to simplify the initial
   commercial motion.
2. Decide whether GCC expansion (§7.8) should reprice or hold the same USD ladder — needed
   as an input to Part 14.
3. Confirm the LTV/CAC assumptions in §7.10–7.11 (blended ARPU, churn assumption) are ones
   you're comfortable publishing even with caveats, or whether they should be removed
   entirely until real data exists.
