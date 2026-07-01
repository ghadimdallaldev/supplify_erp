# Part 6 — Feasibility Study

**Status:** Draft, part 6 of 16. Builds on Part 1 (§1.2 product inventory and disclosed
gaps, §1.6 strategic objectives, §1.7 market sizing) and Part 7 (§7.2 pricing, §7.9–7.11
retention/LTV/CAC). Company remains **pre-launch** and **bootstrapped**. Every figure here
is a verified fact carried over from Parts 1/7 (cited), a newly cited public source, or an
explicitly labeled **modeling assumption with visible methodology** — per the [README](./README.md)'s
rule against fabricated statistics. See §6.15 for the full source list.

**What this part is, and is not:** a feasibility study asks "can this plan actually be
executed," not "how big is the opportunity." Full market sizing (TAM/SAM/SOM) is deferred to
Part 2 and Part 3; §6.2 uses only the Lebanon figures Part 1 already established. This study
evaluates nine feasibility dimensions — market, technical, financial, operational,
commercial, legal, organizational, investment/capital, and scalability — then consolidates
them into a risk table (§6.11), a sensitivity analysis (§6.12), a break-even summary
(§6.13), and three ROI scenarios (§6.14). Every quantitative model shows its formula and
inputs, not just a conclusion, so it can be recomputed and challenged.

---

## 6.2 Market Feasibility

**Question:** is there a real, reachable addressable market for Supplify's Lebanon-first
sequencing (Part 1 §1.6, 0–6 month objective), independent of the deeper sizing work
scheduled for Parts 2–3?

Part 1 §1.7 already established two figures worth restating here rather than re-deriving:

- **~4,000–4,500 operating F&B establishments in Lebanon** — a derived estimate from sector
  headcount data, not an official register count (Source:
  [Hospitality News ME, "Lebanon's F&B industry: what's cooking in 2025"](https://www.hospitalitynewsmag.com/lebanon-fb-industry/)).
- **Lebanon's food market at ~US$6.35 billion (2025)**, growing at roughly **8.66% CAGR
  through 2030** (Source: Statista Market Insights, Food — Lebanon outlook, accessed
  2026-07-01).

Two feasibility observations follow directly, without inventing new numbers:

1. **The restaurant-side buyer population is bounded and countable, not an abstraction.**
   4,000–4,500 establishments is small enough that a founder-led, direct-sales motion (Part
   7 §7.11) can plausibly reach a meaningful fraction through personal relationships and
   referrals, rather than requiring paid demand generation at scale.
2. **The figure is restaurant/F&B-side only.** It says nothing about the supplier-side
   population (distributors, and eventually packaging/cleaning/equipment vendors per Part 1
   §1.6), the marketplace's other half, not sized anywhere in this document — deferred to
   Part 2/3, a real gap here, not an oversight to paper over.

**Feasibility conclusion:** total addressable population is unlikely to be the binding
constraint on reaching the break-even tenant count calculated in §6.4 (55 tenants, blended —
see §6.13): a conservative low-single-digit penetration of 4,000–4,500 establishments
(40–90 restaurants) alone would exceed half that count. The honest answer here is **"is the
market big enough" (yes)** — not **"will Supplify capture enough of it on the Part 1 §1.6
timeline,"** a commercial-execution question addressed in §6.6, not a market-sizing one.

---

## 6.3 Technical Feasibility

**Question:** given what is actually built (not a roadmap), is continued technical
execution a real risk to the Part 1 §1.6 objectives?

**What lowers technical risk, verifiably:** the platform is not a prototype. It has 180
database migrations, 225+ backend tests, and 100+ frontend tests (Source: internal codebase
audit, 2026-07-01, per Part 1 §1.2/§1.13), covering the operationally hard subsystems (RBAC,
tiered billing enforcement, GPS-tracked logistics, real-time chat) that are typically the
highest-rework areas of a multi-tenant B2B platform. The stack is deliberately unoriginal —
React/Vite/TypeScript, Node/Express/PostgreSQL/Redis/Keycloak, on Railway — and per Part 1
§1.14 required no novel infrastructure problem to be solved. No coverage **percentage** is
available or verified for either suite; the test **counts** above are the only verified
figures.

**Where the real technical feasibility risk actually sits — the two gaps Part 1 already
disclosed, not generic ones:**

1. **Catalog-only Platinum features.** Full API/webhooks, white-label domains, AI-driven
   "quick lists," and advanced reporting are priced and displayed but not fully
   backend-enforced yet (Source: `docs/product/tier-matrix.md`, §7). A **scoped, finite
   backlog item**, not an open-ended architectural risk — the enforcement pattern already
   exists and is proven elsewhere; this is implementation, not discovery, work. The risk is
   sequencing: Part 1 §1.6 targets closing it in the 6–12 month window, at or before the
   first Platinum sale, since a customer testing an unenforced feature is a trust event.
2. **Single-region infrastructure.** One Railway deployment per environment, no
   multi-region failover or data-residency option (Part 1 §1.2) — not a defect in a
   Lebanon-only launch, but a scoping constraint once GCC/EU expansion requires local data
   hosting (18–24 months; see §6.10 for when this starts to bind).

A secondary item worth naming because it recurs across this document: **add-on billing
(extra branches/warehouses) is admin-triggered, not automated** (Part 1 §1.2; Part 7 §7.2).
This is better classified as an **operational** feasibility risk than a technical one — the
code path to charge a card programmatically is a bounded engineering task; the risk is the
manual labor it requires at scale today (see §6.5).

**Feasibility conclusion:** technical execution risk is low relative to a typical pre-launch
SaaS company, since the hard, novel parts are already built and tested. The residual risk is
narrow: close the catalog-vs-enforcement gap on schedule, and treat single-region
infrastructure as a future trigger, not a current defect.

---

## 6.4 Financial Feasibility — Bottom-Up Break-Even Model

**Question:** how many paying tenants, at the ARPU already modeled in Part 7 §7.10
(~$110/month blended), does Supplify need to cover a realistic bootstrapped monthly
operating cost base?

### 6.4.1 Monthly operating cost inputs (modeling assumptions)

No verified, Lebanon-specific SaaS-industry payroll benchmark exists. Public salary surveys
for Lebanon (PayScale, Glassdoor, both accessed 2026-07-01) report **LBP-denominated**,
general economy-wide figures, and currency instability since 2019 makes LBP→USD conversion
unreliable for planning. The cost inputs below are instead stated as **explicit
USD-denominated assumptions**, consistent with the common Lebanese tech-employer practice of
paying technical staff in USD ("fresh dollars") for this reason — a stated methodology, not
a sourced figure.

| Cost category                                                               | Monthly assumption (USD) | Basis / methodology                                                                                                                                                                 |
| --------------------------------------------------------------------------- | -----------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core engineering (2 FTE-equivalent)                                         |      $3,600 ($1,800 × 2) | Assumption: subsistence-to-modest USD compensation for Lebanon-based senior technical staff at bootstrapped stage; no verified Lebanon SaaS payroll source found (see caveat above) |
| First support/operations hire (part-time)                                   |                     $900 | Assumption: junior/part-time support and onboarding role, USD-denominated                                                                                                           |
| Infrastructure (Railway hosting, managed Postgres/Redis, storage, Keycloak) |                     $300 | Assumption: typical cost for a single-region small-to-mid multi-tenant SaaS on a Railway-class PaaS, per Part 1 §1.2                                                                |
| SaaS tooling (support desk, monitoring, email/analytics, accounting)        |                     $200 | Assumption: typical minimal bootstrapped tool stack                                                                                                                                 |
| Legal, accounting, compliance retainer                                      |                     $300 | Assumption: minimal part-time retainer (see §6.7 for scope)                                                                                                                         |
| **Subtotal**                                                                |               **$5,300** |                                                                                                                                                                                     |
| Contingency (10%)                                                           |                     $530 | Standard buffer for an unmodeled line item                                                                                                                                          |
| **Total modeled monthly fixed operating cost**                              |             **≈ $5,800** |                                                                                                                                                                                     |

This cost base **excludes** founder equity value and any raise-funded headcount — a bare,
cash-survival structure, not a funded startup's burn rate. It also excludes one-time costs
(Lebanese SARL registration fees, on the order of LBP 3.2 million in nominal
notary/registry/bar fees — USD-equivalent not stated given the conversion caveat above);
these are solved, small, non-recurring costs, not a feasibility risk (Sources: [IDAL — Company Registration Cost](http://investinlebanon.gov.lb/Content/uploads/SideBlock/181204035837920~BSU-COMPANY%20REGISTRATION%20COST.pdf); [Healy Consultants — Lebanon registration fees](https://www.healyconsultants.com/lebanon-company-registration/fees-timelines/)).

### 6.4.2 Variable cost per tenant

Subscription billing (Part 1 §1.11 references Stripe) typically carries a card-processing
fee around 2.9%+ per transaction — generic, not Supplify-specific. Applied to the $110
blended ARPU this is approximately **$3/tenant/month**, leaving a modeled **net contribution
margin of ≈ $107/tenant/month**. Infrastructure is treated as fixed rather than per-tenant at
this scale, since marginal Postgres/Redis cost per tenant is negligible until the scale
threshold discussed in §6.10.

### 6.4.3 Break-even formula

$$
\text{Break-even tenants (N*)} = \frac{\text{Fixed monthly operating cost}}{\text{Net contribution margin per tenant}}
$$

$$
N^{*} = \frac{\$5{,}800}{\$107} \approx 54.2 \rightarrow \textbf{55 paying tenants (rounded up)}
$$

This is a **blended** tenant count across both sides, matching the ARPU basis in Part 7
§7.10. It is a static, single-month snapshot — it answers "how many tenants must be active
and paying in a given month to cover that month's costs," not "how long it takes to get
there" (addressed with an explicit accumulation model in §6.12).

**Cross-check against Part 1 §1.15 targets:** the 12-month target is "tens" of restaurants
plus "tens" of suppliers (plausibly 20–80 combined); the 18-month target is "low hundreds"
plus "dozens" (plausibly 120–250+ combined). A break-even count of 55 sits within the upper
half of the 12-month range and comfortably below the 18-month target — meaning break-even,
if Part 1's targets are hit, is modeled to fall **within the 12–18 month horizon**. This is a
consistency check between two previously-independent parts of this document, not a new
forecast.

---

## 6.5 Operational Feasibility

**Question:** can a small, founder-led team actually run onboarding, support, and sales
across the plan tiers in Part 1 §1.6, without a dedicated operations organization?

Two disclosed product facts compound into a specific, nameable bottleneck rather than a
generic "support will be hard" statement:

1. **The Free Trial ships with Gold-equivalent feature flags** and only Free-tier usage
   limits (Part 7 §7.3). Deliberately persuasive for conversion, but it also means trial
   users can exercise nearly the full operational depth of the platform — multi-branch
   inventory, driver dispatch, reservations, receiving — generating a support surface area
   per trial signup that a stripped-down demo would not. Support load scales with trial
   _feature usage_, not just trial _count_.
2. **Add-on billing (extra branches/warehouses) is admin-triggered, not automated** (Part 1
   §1.2; Part 7 §7.2). Every request requires a human to provision it — immaterial at
   single-digit tenant counts, but a real operational tax once dozens of tenants are
   concurrently active.

**Where the bottleneck is likely to bite first:** using an order-of-magnitude judgment (no
public benchmark exists for a product with this feature depth), one to two people handling
sales, onboarding, and support simultaneously are likely to be stretched once **concurrent
active tenants (trial + paid) cross roughly 20–30** — _below_ the 55-tenant break-even point
in §6.4. **The operational bottleneck is likely to appear before financial break-even**, not
after — so the first support/operations hire (§6.8) should be budgeted on the way to
break-even, not funded as a reward after it, already reflected in §6.4.1's cost base.

**Feasibility conclusion:** operationally feasible through month 12, but only if the first
support hire is made proactively, and only if automating add-on billing (Part 7 §7.7's
lowest-execution-risk revenue item) is prioritized before tenant count exceeds current
manual capacity.

---

## 6.6 Commercial Feasibility

**Question:** is founder-led direct sales plus the supplier-driven referral loop (Part 7
§7.9/§7.11) a realistic way to reach the Part 1 §1.6 objectives on the stated timeline?

**What supports feasibility:**

- The founder-led motion matches the market size in §6.2 — a bounded population of
  4,000–4,500 restaurants is reachable through direct relationships in a way a larger market
  would not be.
- The referral loop is a real, shipped mechanic: suppliers import existing restaurant
  customers and earn a reward (a free month or billing credit) when a referral converts,
  while the referred restaurant gets a 30-day trial plus 20% off its first subscription
  (Part 7 §7.9) — aligning supplier and restaurant retention incentives structurally.

**What is a genuine, honestly-stated risk, not addressed elsewhere in this document:**

- **Two-sided cold start.** Supplify must sell to restaurants _and_ suppliers, and the
  referral loop's value only activates once a supplier is already onboarded and willing to
  import its customer list — the loop **amplifies** an existing base, it does not **create**
  the first one. Part 1 §1.6's 0–6 month objective implicitly assumes this cold start is
  solvable through the founder's Lebanon market access (Part 1 §1.2), which this document
  cannot independently verify since relationship specifics are withheld as sensitive.
- **Founder time is the actual constraint, not cash.** Part 7 §7.11 already states CAC here
  is "near-$0 cash, high founder time cost." Commercial feasibility is gated by founder
  bandwidth until a first commercial hire (§6.8) exists — and that hire cannot reasonably be
  made before revenue justifies it, a sequencing tension with the §6.4 break-even model.
- **No sales-cycle data exists.** With zero live tenants, this document cannot state how
  long a sales conversation takes in this market — a material unknown for the 0–6 month
  objective, to be tracked from the first real conversation onward.

**Feasibility conclusion:** plausible, given the founder's stated Lebanon market access and
small market size — but dependent on one constrained resource (founder time) executing an
unproven two-sided cold start, with no sales-cycle data to validate the 0–6 month timeline.
A real, not theoretical, risk (carried into the risk table, §6.11).

---

## 6.7 Legal Feasibility

**Question:** what legal and regulatory considerations apply to Supplify operating in
Lebanon today and expanding into the GCC per Part 1 §1.6?

**Lebanon — data protection.** Law No. 81/2018 on Electronic Transactions and Personal Data,
in force since March 2019, requires a legitimate basis or consent for processing personal
data, purpose limitation, and breach-related safeguards, with the Ministry of Economy and
Trade holding oversight — though the law creates no independent data-protection regulator,
weakening enforcement predictability (Sources: [DLA Piper — Data Protection Laws of Lebanon](https://www.dlapiperdataprotection.com/?t=law&c=LB); [Digital Watch Observatory — Law No. 81](https://dig.watch/resource/electronic-transactions-and-personal-data-law-law-no-81-of-lebanon); [Madkour Law Firm — overview](https://www.madkourlawfirm.com/articles/blog-post-title-four-y5jb8-pth3a)). Supplify already processes restaurant/supplier business data and, via reservations
and B2C storefronts (Part 1 §1.2), some consumer personal data — a basic compliance review
(consent flows, breach notification, processing documentation) is a reasonable near-term
task, not a blocker.

**Lebanon — tax/e-invoicing signal (unverified in full).** One source states Lebanon's
Ministry of Finance mandated electronic submission of all tax documents from October 2025
(Source: [VATupdate — Lebanon's 2026 Budget Proposal](https://www.vatupdate.com/2025/09/23/lebanons-2026-budget-proposal-vat-deduction-limits-and-expanded-digital-enforcement-measures/), accessed 2026-07-01). This document could **not** verify the full
scope, format, or applicability threshold from public search results, and does not guess at
what it cannot confirm — **flagged as an open item for Lebanese tax counsel** before
Supplify's invoicing module is treated as compliant or non-compliant with it.

**GCC e-invoicing (Saudi Arabia and UAE), relevant to GCC expansion (Part 1 §1.6, 18–24
months).** Saudi ZATCA "FATOORAH" covers B2B/B2C/B2G in two phases — generation, then
integration (a clearance model submitting invoices to ZATCA's Fatoora platform for
cryptographic stamping before delivery) — rolled out in waves by turnover threshold; the
most recent wave covers 2022–2024 turnover above SAR 750,000, compliant by Q1 2026 (Sources: [ZATCA — Roll-out phases](https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/Roll-out-phases.aspx); [EY — 23rd wave of Phase 2 integration](https://www.ey.com/en_gl/technical/tax-alerts/saudi-arabia-announces-23rd-wave-of-phase-2-e-invoicing-integration)). The UAE mandate phases in similarly: a July 2026 pilot, mandatory
Accredited-Service-Provider XML (UBL/PINT-AE) for large businesses (AED 50M+) from January
2027, and all in-scope VAT-registered businesses from July 2027 — PDFs will not qualify
(Sources: [Hawksford — UAE's e-invoicing system](https://www.hawksford.com/insights-and-guides/uae-e-invoicing); [Deloitte — UAE E-Invoicing Legislation](https://www.deloitte.com/middle-east/en/services/tax/perspectives/release-of-uae-einvoicing-legislation.html)). In both cases, if Supplify's invoicing module generates tax invoices for an
in-scope tenant, that obligation flows through to the product — Supplify would need a
compliant integration path, or tenants would invoice outside the platform. Noted as a Part
14 dependency to resolve before, not during, the corresponding go-to-market.

**Europe — GDPR** (relevant once EU expansion, Part 1 §1.6's 24–36 month horizon, becomes
real). GDPR applies extraterritorially under Article 3(2) to any organization offering
goods/services to, or monitoring, individuals in the EU — no EU entity required to trigger
it, and an EU representative is typically required once in scope; penalties reach €20M or 4%
of global revenue (Source: [GDPR.eu — Does the GDPR apply to companies outside of the EU?](https://gdpr.eu/companies-outside-of-europe/)). Not immediate for a Lebanon-only launch, but worth designing data
practices toward now given the bilingual schema groundwork already in place (Part 1 §1.5).

**Not covered here, stated rather than guessed at:** e-invoicing/data-residency rules for
Qatar, Kuwait, Bahrain, or Oman; payment-facilitator/money-transmission licensing relevant
only under the take-rate model (Part 7 §7.5); Lebanon-specific SaaS sales-tax treatment. All
are specialist local-counsel review items for the corresponding market entry.

---

## 6.8 Organizational Feasibility

**Question:** what roles does Supplify need next to execute Part 1's objectives?

Current team composition, headcount, and roles are **not modeled in this document** — Part 1
§1.2 intentionally omits founder composition as commercially sensitive, and this part does
not invent a team size to fill that gap. What can be stated feasibly, in relative terms tied
directly to the bottlenecks already identified in §6.5 and §6.6, is the **order in which the
next roles are needed**, not a fabricated headcount:

1. **First dedicated commercial/sales hire** — needed once founder time (§6.6) becomes the
   binding constraint on tenant acquisition; trigger is calendar saturation, not a tenant
   count.
2. **First dedicated support/customer-success hire** — needed at or before the ~20–30
   concurrent-tenant threshold identified in §6.5. Already reflected as a cost line in the
   §6.4 model (a pre-break-even cost, not a post-break-even reward).
3. **First billing/RevOps owner (or automation effort)** — closes the manual add-on-billing
   gap (Part 7 §7.2, §7.7's lowest-execution-risk item); could be an engineering deliverable
   rather than a headcount.
4. **First infrastructure/DevOps-oriented hire or fractional contractor** — needed ahead of
   GCC/EU market entry, to plan the single-to-multi-region transition (§6.3, §6.10) and the
   e-invoicing dependencies in §6.7.

**Feasibility conclusion:** the sequence is sound (support before sales scales further,
billing automation before add-on volume grows, infra investment before GCC entry) but is
entirely dependent on the financial feasibility of funding these hires, addressed in §6.9.

---

## 6.9 Investment / Capital Feasibility

**Question:** how much capital would plausibly be needed to reach the break-even point
calculated in §6.4? Part 1 states Supplify is not currently raising — this is a **model
output for planning purposes**, not a funding ask.

**Conservative upper-bound calculation**, using this document's own base case from §6.12
(11.2 months to break-even under base-case churn/ARPU):

$$
\text{Capital required (upper bound)} = \text{Months to break-even} \times \text{Monthly fixed operating cost}
$$

$$
= 11.2 \times \$5{,}800 \approx \textbf{\$65,000}
$$

This upper bound assumes **zero revenue** before the break-even month, which is unrealistic
since tenants are acquired progressively, not all at once. A ramp-adjusted refinement, using
the break-even MRR from §6.4 ($55 \times \$110 = \$6{,}050$) and assuming revenue grows
roughly linearly to that figure (so **average** revenue during the ramp is approximately
half of break-even MRR):

$$
\text{Capital required (net of ramp revenue)} = \text{Months to break-even} \times \left(\text{Fixed cost} - \tfrac{1}{2}\text{Break-even MRR}\right)
$$

$$
= 11.2 \times (\$5{,}800 - \$3{,}025) = 11.2 \times \$2{,}775 \approx \textbf{\$31,000}
$$

**Modeled range: ~$31,000 (ramp-adjusted) to ~$65,000 (conservative upper bound).** Both are
**model outputs describing what bootstrapped cash runway this plan implies**, not a capital
request. The two inputs worth stress-testing are the $5,800 fixed-cost assumption (§6.4.1)
and the linear ramp-revenue shape assumed here — modeling choices, not measured facts.

---

## 6.10 Scalability Feasibility

**Question:** given the single-region Railway/Postgres/Redis architecture disclosed in Part
1 §1.2, what is a realistic ceiling before infrastructure investment becomes necessary?

This is stated as **informed technical judgment**, not a fabricated precise threshold — no
Supplify-specific load-testing data exists publicly, and none is invented here.

- A single well-indexed PostgreSQL primary serving a shared multi-tenant schema with
  row-level tenant scoping (the pattern implied by Supplify's architecture per Part 1 §1.2)
  typically has comfortable headroom into the **low thousands of active tenants** before
  read replicas or vertical-scaling ceilings become binding — a standard, widely-documented
  characteristic of PostgreSQL at small-to-mid SaaS scale, not a Supplify-specific
  measurement. Redis (Socket.IO-backed chat) scales to a large number of concurrent
  connections per node before clustering is needed; chat volume at Part 1's 18-month target
  (low hundreds of tenants) is very unlikely to approach that ceiling.
- **Practical conclusion:** raw throughput is unlikely to force infrastructure investment
  before Supplify reaches several hundred to low thousands of tenants — well beyond the
  18-month target. The more probable trigger, per §6.3 and §6.7, is **regulatory/
  data-residency requirements** from GCC or EU entry (18–36 months), not raw scale.
  Multi-region investment is better framed as a **market-entry prerequisite for specific
  geographies**, not a scale-driven necessity to solve pre-emptively.

**Feasibility conclusion:** scalability is not a near-term risk at the tenant counts modeled
through month 18; it becomes relevant exactly where Part 1 already flags GCC expansion
(18–24 months) — correct sequencing, not a gap to close sooner.

---

## 6.11 Risk Feasibility Summary

| #   | Risk                                                                                                  | Likelihood             | Impact      | Discussed in          |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------- | ----------- | --------------------- |
| 1   | Support bottleneck appears before the first support hire is made, as tenant count grows               | High                   | Medium      | §6.5 Operational      |
| 2   | Two-sided marketplace cold start slows the 0–6 month objective                                        | Medium                 | High        | §6.6 Commercial       |
| 3   | Catalog-only Platinum features tested by a paying customer before backend enforcement completes       | Medium                 | Medium-High | §6.3 Technical        |
| 4   | Break-even tenant count (55, blended) not reached within the modeled 12–18 month window               | Medium                 | High        | §6.4, §6.13 Financial |
| 5   | GCC e-invoicing obligations (Saudi ZATCA, UAE mandate) unresolved in the product before GCC launch    | Medium                 | Medium-High | §6.7 Legal            |
| 6   | Founder time constraint limits sales throughput with no commercial hire funded yet                    | Medium-High            | High        | §6.6, §6.8            |
| 7   | Single-region infrastructure becomes a blocker at GCC/EU entry rather than pre-emptively resolved     | Low / Medium (18–24mo) | High        | §6.3, §6.10           |
| 8   | Lebanon digital tax-submission mandate (Oct 2025 signal, scope unverified) applies in unreviewed ways | Low-Medium             | Medium      | §6.7 Legal            |

---

## 6.12 Sensitivity Analysis

The break-even model in §6.4 depends on two inputs already flagged as assumptions: **blended
ARPU (~$110, Part 7 §7.10)** and **monthly gross churn (4%, Part 7 §7.10)**. This section
shows how the answer moves under a ±30% swing on each, via two mechanisms: **ARPU** directly
changes the break-even _tenant count_ (N\*) via contribution margin (§6.4.3); **churn**
leaves that count unchanged (a static snapshot) but changes **how long it takes to
accumulate and hold it**, since churn erodes the base being built. Modeled with a standard
subscriber-accumulation formula: starting from zero, with constant gross new-tenant
additions **g** per month and monthly churn **c**, the tenant count after **t** months is:

$$
N(t) = \frac{g}{c}\left(1-(1-c)^{t}\right)
$$

Solving for **t** when $N(t) = N^{*}$ gives the modeled time to break-even:

$$
t = \frac{\ln\left(1 - \dfrac{N^{*} c}{g}\right)}{\ln(1-c)}
$$

**Assumption:** $g = 6$ new paying tenants added per month (gross, before churn) — an
illustrative figure broadly consistent with the pace implied by Part 1 §1.15's
6-to-12-month growth targets, not an independently sourced number.

| ARPU scenario   | Contribution margin/tenant | Break-even tenants (N\*) | Churn −30% (2.8%) | Churn base (4.0%) | Churn +30% (5.2%) |
| --------------- | -------------------------: | -----------------------: | ----------------: | ----------------: | ----------------: |
| **−30%** ($77)  |                     $74.70 |                       78 |       16.0 months |       18.0 months |       21.1 months |
| **Base** ($110) |                    $107.00 |                       55 |       10.4 months |       11.2 months |       12.1 months |
| **+30%** ($143) |                    $138.70 |                       42 |        7.7 months |        8.0 months |        8.5 months |

**Reading the table:** ARPU has the larger effect on required tenant count (42 to 78 across
the ±30% range); churn has a smaller but material effect on _how long_ it takes to get there
(a 4–5 month spread at base-case ARPU). Both directions of error compound — the worst
modeled cell (ARPU −30%, churn +30%) pushes break-even to roughly 21 months, past the entire
18-month Part 1 §1.6 horizon; the best cell (ARPU +30%, churn −30%) pulls it under 8 months.
This range, not the single base-case number, is the honest planning takeaway.

---

## 6.13 Break-Even Summary

Restating the headline result plainly: under the stated cost and pricing assumptions in
§6.4, Supplify's modeled break-even point is **approximately 55 paying tenants, blended
across restaurant and supplier sides, at the ~$110/month blended ARPU already modeled in
Part 7 §7.10**, generating roughly **$6,050 in break-even monthly recurring revenue**
against the **~$5,800/month modeled fixed operating cost base**. Under the base-case churn
and gross-acquisition assumptions in §6.12, this is modeled to take **approximately 11
months** of tenant accumulation from a standing start, placing break-even within the
12–18 month horizon Part 1 §1.6 already targets — consistent with, not independent of, that
plan. Every number in this sentence is a **model output from stated assumptions**, not a
measured or promised result.

---

## 6.14 ROI Scenarios — 18-Month Horizon (Modeled, Not Forecasted)

Using the 18-month horizon from Part 1 §1.6 and the 18-month "low hundreds of restaurants,
dozens of suppliers" target from Part 1 §1.15, three scenarios are modeled below. Each states
its own conversion, plan-mix, and churn assumptions explicitly — these are illustrative
planning scenarios, not predictions with any claimed confidence level.

| Scenario          | Key assumptions                                                                          |                                     Modeled paying tenants (18mo) |    Modeled blended ARPU | Modeled MRR (18mo) |
| ----------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------: | ----------------------: | -----------------: |
| **Best case**     | Higher trial→paid conversion; mix skews Gold/Platinum as chains adopt; churn −30% (2.8%) |  ~190 (150 restaurants + 40 suppliers — high end of §1.15 target) |      ~$130 (richer mix) |           ~$24,700 |
| **Expected case** | Conversion/mix per Part 7 §7.2 design intent (Gold modal); churn at base (4%, §7.10)     | ~120 (100 restaurants + 20 suppliers — mid-range of §1.15 target) | ~$110 (§7.10 base case) |           ~$13,200 |
| **Worst case**    | Slower conversion; mix skews entry-level Silver; churn +30% (5.2%)                       |      ~50 (the 18-month plan slips to roughly the 12-month target) | ~$90 (Silver-heavy mix) |            ~$4,500 |

**Reading this table honestly:** even the "worst case" does not model zero traction — it
models the 18-month plan slipping to roughly where the 12-month plan should already be, a
realistic execution delay, not a catastrophic-failure scenario (Part 13 covers the latter).
The "best case" MRR of ~$24,700/month is still a small-business figure, not a venture
outcome — appropriate for an 18-month milestone in a bootstrapped company. None of these
three figures should be presented to a counterparty as a projection; they are scenario
bookends built from explicit, challengeable assumptions.

---

## 6.15 Sources & Assumptions Used in This Part

- Market figures (§6.2): Part 1 §1.7 — Lebanon F&B establishment estimate ([Hospitality News ME, 2025](https://www.hospitalitynewsmag.com/lebanon-fb-industry/)) and food-market size/CAGR (Statista
  Market Insights, accessed 2026-07-01). Not re-derived; TAM/SAM/SOM deferred to Parts 2–3.
- Product/test-coverage/disclosed-gap facts (§6.3, §6.5): internal codebase audit,
  2026-07-01, and `docs/product/tier-matrix.md` (verified 2026-05-28), per Part 1 §1.2 and
  Part 7 §7.2–7.3.
- Pricing/ARPU/churn/LTV/CAC inputs (§6.4, §6.12, §6.14): Part 7 §7.2 and §7.10–7.11
  (explicitly modeled, not measured).
- Lebanon salary-data caveat (§6.4.1): [PayScale — Software Developer Salary in Lebanon](https://www.payscale.com/research/LB/Job=Software_Developer/Salary); [Glassdoor — Software Developer Beirut, Lebanon](https://www.glassdoor.com/Salaries/beirut-lebanon-software-developer-salary-SRCH_IL.0,14_IM1534_KO15,33.htm) — LBP-denominated and judged unreliable for USD conversion given Lebanon's currency
  instability, hence the explicit USD-assumption methodology used instead.
- Lebanon company formation costs (§6.4.1, informational only): [IDAL — Company Registration Cost sheet](http://investinlebanon.gov.lb/Content/uploads/SideBlock/181204035837920~BSU-COMPANY%20REGISTRATION%20COST.pdf); [Healy Consultants — Lebanon company registration fees and timelines](https://www.healyconsultants.com/lebanon-company-registration/fees-timelines/).
- Lebanon data-protection/tax-digitization (§6.7): [DLA Piper — Data Protection Laws of Lebanon](https://www.dlapiperdataprotection.com/?t=law&c=LB); [Digital Watch Observatory — Law No. 81 of Lebanon](https://dig.watch/resource/electronic-transactions-and-personal-data-law-law-no-81-of-lebanon); [Madkour Law Firm — Lebanese Data Protection Law overview](https://www.madkourlawfirm.com/articles/blog-post-title-four-y5jb8-pth3a); [VATupdate — Lebanon's 2026 Budget Proposal](https://www.vatupdate.com/2025/09/23/lebanons-2026-budget-proposal-vat-deduction-limits-and-expanded-digital-enforcement-measures/) (scope unverified beyond this single source).
- Saudi ZATCA e-invoicing (§6.7): [ZATCA — Roll-out phases](https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/Roll-out-phases.aspx); [EY — 23rd wave of Phase 2 e-invoicing integration](https://www.ey.com/en_gl/technical/tax-alerts/saudi-arabia-announces-23rd-wave-of-phase-2-e-invoicing-integration).
- UAE VAT/e-invoicing (§6.7): [Hawksford — UAE's e-invoicing system](https://www.hawksford.com/insights-and-guides/uae-e-invoicing); [Deloitte — Release of UAE E-Invoicing Legislation](https://www.deloitte.com/middle-east/en/services/tax/perspectives/release-of-uae-einvoicing-legislation.html).
- GDPR extraterritorial scope (§6.7): [GDPR.eu — Does the GDPR apply to companies outside of the EU?](https://gdpr.eu/companies-outside-of-europe/).
- All cost, break-even, sensitivity, capital, and ROI-scenario figures in §6.4, §6.9, §6.12,
  §6.13, and §6.14 are **explicitly stated modeling assumptions**, not measured outcomes —
  no paying cohort exists at time of writing (company is pre-launch).

**This feasibility study should be re-run with real inputs once the company has 3–6 months
of post-launch billing data; every financial figure here is a planning model, not a
prediction.**

**Open items for founder review:**

1. Confirm or challenge the $5,800/month fixed-cost assumption (§6.4.1), particularly the
   USD-denominated salary assumptions with no verified Lebanon-specific SaaS source.
2. Commission specialist Lebanese tax-counsel review of the October 2025 digital
   tax-document mandate referenced in §6.7 before relying on any compliance conclusion.
3. Confirm whether the gross new-tenant-acquisition assumption in §6.12 (g = 6/month) is
   realistic given the founder's actual go-to-market bandwidth (§6.6).
