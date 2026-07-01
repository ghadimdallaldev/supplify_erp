# Part 9 — Marketing Plan (Year 1)

**Document status:** Draft, part 9 of 16. Builds directly on [Part 8](./08_marketing_research.md)
(channel prioritization, message architecture, persona mapping), [Part 7](./07_business_strategy.md)
(pricing ladder, trial design, referral economics), [Part 6](./06_feasibility_study.md) (operating
cost envelope and break-even model), and [Part 10](./10_sales_strategy.md) (sales funnel,
two-sided acquisition sequencing). Cross-references product collateral in `docs/sales/*.md`,
`docs/onboarding/Supplify-Customer-Presentation.md`, and `docs/product/monetization-ux.md`.

**A standing disclosure carried from every prior part:** Supplify is **pre-launch** and
**bootstrapped**, with **zero live paying tenants** today. Nothing in this part is derived from
historical marketing performance, brand-tracking surveys, A/B tests, SEO rankings, paid-campaign
results, or conversion cohorts — because none exist. Where this part sets budgets, monthly
activities, or KPI targets, they are either (a) tied to verified product and pricing facts from
the codebase and internal docs, (b) carried forward from prior strategy parts with citations, or
(c) explicitly labeled **targets or assumptions** for founder validation before cash is committed.

---

## 9.1 Purpose and Scope

This part translates Part 8's research into an executable Year 1 marketing plan for a
founder-led, near-zero-cash go-to-market in Lebanon. Its job is not to model a scaled demand-
generation engine — Supplify does not yet have the budget, team, or proof points for one. Its
job is to specify **what marketing will do, in which month, with how much cash, and against
which measurable targets**, so that founder time is allocated deliberately and sales (Part 10)
receives a predictable flow of aware, trial-ready prospects.

**In scope:** Year 1 (Months 1–12 from commercial launch), Lebanon only, awareness and
consideration activities that feed the sales funnel in Part 10 §10.3. Budget is cash-only;
founder and engineering time is noted as opportunity cost but not monetized in the budget tables
(consistent with Part 7 §7.11).

**Out of scope:** GCC marketing (Part 14), paid search and paid social at scale, G2/Capterra
review programs, affiliate networks, open ad marketplace, and any marketing claim that requires
customer proof Supplify does not yet have (Part 8 §8.5.4, §8.6.3).

---

## 9.2 Strategic Context

Three constraints govern every decision in this plan:

**1. Two-sided cold start.** Marketing must acquire both restaurants and suppliers, but the
product's shipped referral loop (supplier CSV import → invite/sponsor → restaurant signup — Part
7 §7.9, Part 10 §10.4) inverts the usual sequence: **anchor suppliers first**, restaurants
second. Year 1 marketing effort is deliberately supplier-weighted in Months 1–6.

**2. Founder time is the binding constraint, not cash.** Part 6 §6.6 and Part 7 §7.11 establish
that near-term customer acquisition cost is dominated by founder opportunity cost. A marketing
plan that assumes a content team, agency retainers, or sustained paid media would be infeasible
against the ~$5,800/month total operating envelope modeled in Part 6 §6.4.1 — of which marketing
cash is a small, explicitly bounded slice.

**3. Product is the primary conversion asset.** The Free Trial ships Gold-equivalent features
with Free-tier limits only (Part 7 §7.3). Marketing's conversion job is to drive qualified
signups and set accurate expectations — not to compensate for a weak demo. Part 10 §10.5 confirms
that the trial, demo scripts, and internal sales docs are the strongest collateral available
today; Year 1 marketing work is largely **formatting and distributing** existing substance, not
inventing new claims.

---

## 9.3 Year 1 Marketing Objectives

Objectives are stated as **targets**, aligned with Part 1 §1.15 and Part 6 §6.12's accumulation
model. They will be replaced with actuals once launch produces data.

| Objective                                         | Rationale                                                                                                                                                                      | Year 1 target _(assumption)_                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Establish credible market presence in Lebanon** | ~4,000–4,500 F&B establishments (Part 2 §2.12) is small enough for founder-led coverage; "presence" means findable web properties and shareable collateral, not mass awareness | Indexable marketing site live by Month 2; bilingual core pages by Month 4                                                                                                                 |
| **Activate supplier-as-channel**                  | Only shipped zero-cash scale mechanism (Part 8 §8.6.1, Rank 1)                                                                                                                 | ≥3 anchor suppliers onboarded and actively importing by Month 6 _(founder-judgment target)_                                                                                               |
| **Generate trial pipeline for sales**             | Feeds Part 10 funnel stages 1–3                                                                                                                                                | Baseline trial signup rate established by Month 6; Month 12 cumulative trial signups consistent with Part 1 §1.15 "tens" of tenants on both sides _(directional, not a fabricated count)_ |
| **Instrument attribution from day one**           | Part 8 §8.9.2 — without UTMs and analytics, channel ranking cannot be validated                                                                                                | 100% of outbound links UTM-tagged from Month 1                                                                                                                                            |
| **Protect brand integrity pre-proof**             | Part 8 §8.2.3 — specificity and transparency over social proof                                                                                                                 | Zero customer-count, ROI-hour, or AI-feature claims in public copy                                                                                                                        |
| **Stay within bootstrapped cash envelope**        | Part 6 §6.4.1 total fixed cost ≈ $5,800/month                                                                                                                                  | Year 1 marketing cash spend ≤ $4,800 (see §9.4)                                                                                                                                           |

---

## 9.4 Budget Framework

### 9.4.1 Budget philosophy

Year 1 marketing spend follows a **70/20/10 allocation by effort type**, not by cash alone:

| Effort type                                              | Share of marketing effort _(assumption)_ | Cash implication                                          |
| -------------------------------------------------------- | ---------------------------------------: | --------------------------------------------------------- |
| Founder-led outbound, demos, network, WhatsApp/community |                                     ~70% | Near-$0 cash; high time cost                              |
| Product-led trial and in-app monetization UX             |                                     ~20% | Infrastructure already in Part 6 §6.4.1 ($300/mo hosting) |
| Cash marketing (tools, design, events, freelance)        |                                     ~10% | Bounded line item below                                   |

This reflects Part 8 §8.6.1 channel ranking and Part 10 §10.1's disclosure that no paid
acquisition channel is active today.

### 9.4.2 Annual cash budget (Year 1)

Total Year 1 marketing cash budget: **$4,800** (~$400/month average). This is **separate from**
Part 6's $200/month SaaS tooling line (support desk, monitoring, email) but **overlaps partially**
with analytics and email tools counted there — the table below shows incremental marketing-specific
spend only.

| Category                                                   | Year 1 budget (USD) | Monthly avg. | Notes                                                                                                                                       |
| ---------------------------------------------------------- | ------------------: | -----------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Web hosting / domain (marketing site)                      |                $360 |          $30 | Assumption: static or lightweight marketing pages on existing Railway deployment or separate static host                                    |
| Analytics & attribution (GA4, Search Console, UTM tooling) |                  $0 |           $0 | Free-tier tools assumed sufficient at pre-launch scale                                                                                      |
| Design / collateral production                             |              $1,200 |         $100 | Freelance pass on pitch one-pager, supplier "Bring your customers" PDF, social templates — content exists in `docs/sales/*` (Part 10 §10.5) |
| Demo video production                                      |                $600 |          $50 | One 60–90 second screen-capture demo (Arabic + English voiceover or subtitles) — Part 8 §8.4.1                                              |
| LinkedIn (optional Sales Navigator trial / page tools)     |             $0–$360 |       $0–$30 | **Assumption:** founder personal brand is primary; paid LinkedIn deferred unless Month 6 review justifies                                   |
| Local F&B event / trade association                        |                $600 |          $50 | One modest booth or sponsorship — Part 8 §8.6.1 Rank 5; fee variable                                                                        |
| Arabic keyword research (freelance, one-time)              |                $300 |            — | Part 8 §8.5.3 open item; Lebanon geo-target pass before bilingual SEO commit                                                                |
| Contingency                                                |                $780 |          $65 | Buffer for second event, print runs, or unexpected design work                                                                              |
| **Referral discount cost (variable, not marketing OPEX)**  | _Not budgeted here_ |            — | 20% first-paid discount + supplier reward (1 mo free/credit — Part 7 §7.9) hits **COGS/CAC**, not marketing budget — tracked in Part 12     |
| **Total incremental marketing cash**                       |          **$4,800** |     **$400** | ≈7% of Part 6 §6.4.1 monthly fixed OPEX ($5,800)                                                                                            |

**Explicit exclusions (deferred):** Google Ads, Meta Ads, agency retainers, PR wire services,
influencer fees, G2/Capterra paid listings, conference travel outside Lebanon, GCC campaigns.

### 9.4.3 Founder time budget _(not monetized)_

Part 6 and Part 7 treat founder time as the real CAC. For planning purposes only — **not a
sourced benchmark** — this plan assumes the founder allocates roughly **8–12 hours per week** to
marketing and awareness activities in Months 1–6, rising to **10–15 hours per week** in Months
7–12 as demo volume and content publishing increase. Part 10 §10.9 recommends logging hours per
acquired paying tenant from the first conversation; that log supersedes this assumption once data
exists.

---

## 9.5 Channel Plan and Budget Allocation

Channel priority follows Part 8 §8.6.1 without reordering. Cash allocation maps to channels that
require spend; founder time maps to all active channels.

| Channel                                     | Part 8 rank |                                               Year 1 role |                             Cash (USD) | Primary owner            |
| ------------------------------------------- | ----------- | --------------------------------------------------------: | -------------------------------------: | ------------------------ |
| Supplier referral / customer import         | 1           |               Anchor acquisition; restaurant batch import |                   $0 (+ referral COGS) | Founder + supplier owner |
| Founder direct network                      | 2           |                           First restaurants and suppliers |                                     $0 | Founder                  |
| Product-led trial (self-serve registration) | 3           |               Conversion hub; all channels terminate here |                                     $0 | Product (instrumented)   |
| LinkedIn (founder + company page)           | 4           |                         R2 (Layla), S1 (Nadine) awareness |                                 $0–360 | Founder                  |
| Local trade events / associations           | 5           |   Category education; fresh-opening cohort (Part 2 §2.12) |                                   $600 | Founder                  |
| SEO / content (organic)                     | 6           |        Long-cycle discovery; four pillars (Part 8 §8.5.4) | $300 (keyword research) + founder time | Founder                  |
| WhatsApp / community groups                 | 7           |                                   Warm intros; high touch |                                     $0 | Founder                  |
| Paid search / paid social                   | 8–9         |                                              **Deferred** |                                     $0 | —                        |
| Review platforms                            | 10          | **Deferred** until 5–10 satisfied tenants (Part 8 §8.6.1) |                                     $0 | —                        |

**Sales handoff rule (Part 10 alignment):** Any prospect who requests a walkthrough, exceeds trial
limits repeatedly (PQL signal — Part 10 §10.3 stage 4), or represents a multi-branch Gold/Platinum
opportunity transitions from marketing awareness to founder-led sales with no separate SDR function.

---

## 9.6 Message, Creative, and Collateral Roadmap

Part 8 §8.7 defines the message hierarchy. Year 1 creative work packages that hierarchy into
**five deliverables**, sequenced by supplier-first GTM:

| Deliverable                                          | Source material                                             | Target completion | Budget                               |
| ---------------------------------------------------- | ----------------------------------------------------------- | ----------------- | ------------------------------------ |
| **D1 — Marketing website (English core)**            | Part 8 §8.5.4 pillars; `tier-matrix.md` pricing             | Month 2           | Hosting in §9.4.2                    |
| **D2 — Supplier one-pager ("Bring your customers")** | `docs/features/supplier-customer-growth.md`; Part 8 §8.3.3  | Month 1           | ~$300 design                         |
| **D3 — Restaurant one-pager + 60s demo video**       | `docs/sales/01_problem.md`, `02_solution.md`; Part 8 §8.4.1 | Month 3           | ~$600 video + $300 design            |
| **D4 — Bilingual geo landing page (Lebanon)**        | Part 8 §8.8.1; Arabic audit pending (Part 8 open item #3)   | Month 4–5         | Founder time + keyword research $300 |
| **D5 — LinkedIn content kit (12 post templates)**    | Four content pillars (Part 8 §8.5.4)                        | Month 2           | Founder time                         |

**Copy constraints (non-negotiable):**

- Lead with **"restaurant–supplier operations platform"** or equivalent plain language — not
  "ERP" in primary consumer copy (Part 8 §8.2.2).
- Trial messaging: **limits, not features** — Free Trial is Gold-equivalent with Free-tier ceilings
  (Part 7 §7.3, Part 8 §8.6.2).
- Billing disclosure: pricing pages must **not imply self-serve card checkout** until a live
  processor ships (Part 10 §10.1, Part 8 open item #6).
- No AI marketing until Platinum quick lists are backend-enforced (Part 4 §4.9.4, Part 8 open
  item #10).
- No fabricated hours-saved, customer-count, or Lebanon search-volume statistics (Part 3 §3.4,
  Part 8 §8.5.2).

---

## 9.7 KPI Framework

All KPIs below are **targets to instrument and baseline**, not achievements. Part 8 §8.9.1 lists
product-instrumented metrics available at launch; this section adds marketing-layer targets and
reporting cadence.

### 9.7.1 North-star and supporting metrics

| Tier                  | Metric                                          | Definition                                                                        | Month 6 target _(assumption)_ | Month 12 target _(assumption)_                             | Source                             |
| --------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| **North star**        | Activated trial tenants (both sides)            | Completed registration + ≥1 meaningful action (order placed or catalog published) | Baseline established          | Directionally consistent with Part 1 §1.15 "tens" combined | Product logs                       |
| **Acquisition**       | Trial signups / month (restaurant vs. supplier) | New tenant registrations                                                          | Baseline                      | Improving vs. M6 baseline                                  | Tenant registration                |
| **Channel**           | Supplier CSV imports / month                    | Rows imported via growth program                                                  | ≥1 anchor supplier importing  | ≥3 suppliers with active imports                           | `GET /api/supplier/growth/metrics` |
| **Channel**           | Referral conversion (first paid)                | Referred restaurant → paid                                                        | First conversion logged       | Track rate, no fixed target                                | Part 7 §7.9                        |
| **Conversion**        | Trial → paid conversion rate                    | First paid subscription / trial starts                                            | Baseline (expect low N)       | Benchmark vs. Part 7 model                                 | Part 10 §10.9                      |
| **Product-qualified** | Blocked-event → upgrade modal open rate         | PQL proxy                                                                         | Track weekly                  | Optimize messaging on top blocked limit                    | `docs/product/monetization-ux.md`  |
| **Efficiency**        | Founder hours / paying tenant                   | Real CAC proxy                                                                    | Start logging Month 1         | Review quarterly                                           | Part 7 §7.11                       |
| **Web**               | Marketing site sessions / month                 | GA4                                                                               | Baseline                      | +50% vs. M3 baseline _(relative target only)_              | GA4                                |
| **Web**               | Trial signup source (UTM)                       | % signups with attributable UTM                                                   | 100% tagged outbound          | Top 3 channels identified                                  | UTM discipline                     |

**Metrics explicitly not targeted in Year 1:** NPS, LTV/CAC ratio as external claim, SEO ranking
positions (no baseline), paid ROAS, social follower counts as primary KPI.

### 9.7.2 Reporting cadence

| Cadence   | Review                                                                          | Participants                               |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| Weekly    | Trial signups, blocks → upgrade funnel, supplier import activity                | Founder                                    |
| Monthly   | Channel attribution summary, cash spend vs. budget, collateral status           | Founder                                    |
| Quarterly | KPI target revision, paid-channel deferral/reactivation decision, message audit | Founder + engineering (for product claims) |

---

## 9.8 Year 1 Month-by-Month Plan

The calendar assumes **Month 1 = commercial launch month** (Part 1 §1.6 0–6 month objective).
If launch slips, shift the calendar intact — do not compress supplier-first sequencing.

### Phase A — Foundation (Months 1–2)

**Strategic intent:** Install attribution, confirm brand copy, publish minimum viable market presence,
and arm founder-led sales with external-ready supplier collateral before broad restaurant outreach.

| Month  | Priority activities                                                                                                                                                                                                                                           | Deliverables                                             | Cash spend _(target)_ | KPI focus                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------: | ------------------------------------------------------- |
| **M1** | Confirm positioning statement and tagline with founder (Part 8 §8.3.1, §8.7.1); set up GA4, Search Console, UTM convention; commission supplier one-pager design; begin anchor-supplier outreach (Part 10 §10.2); disclose manual billing on any pricing copy | D2 supplier one-pager (EN); UTM playbook; analytics live |         $400 (design) | 100% outbound UTMs; first supplier conversations logged |
| **M2** | Launch English marketing site: home, pricing (from `tier-matrix.md`), `/register` CTA, FAQ (USD pricing, manual payment path); founder LinkedIn profile optimization; 2 LinkedIn posts (pillar 2: two-sided)                                                  | D1 website live; D5 first 2 templates used               |           $30 hosting | Site indexed; trial signup baseline begins              |

### Phase B — Supplier-Led Activation (Months 3–6)

**Strategic intent:** Land first anchor suppliers, activate import/referral loop, produce restaurant-
facing proof assets using real product UI, and lock mid-year baselines before scaling consideration
activities.

| Month  | Priority activities                                                                                                                                                                                                        | Deliverables                                            | Cash spend _(target)_ | KPI focus                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------: | ----------------------------------------------------- |
| **M3** | Record demo video (order → receive → invoice chain — Part 8 pillar 1); restaurant one-pager; onboard first anchor supplier(s); run first founder-led demos using `docs/onboarding/12-demo-script.md`                       | D3 video + restaurant one-pager                         |                  $900 | First CSV import; trial signups from supplier invites |
| **M4** | Commission Arabic keyword research (Part 8 §8.5.3); audit Arabic UI coverage before "Arabic-ready" claims; WhatsApp/share-link invite flow training for supplier owners; 2 LinkedIn posts (pillar 3: pricing transparency) | Keyword research report; Arabic copy draft for geo page |                  $300 | Supplier connection-request acceptance rate           |
| **M5** | Publish bilingual Lebanon landing page (English + Arabic — pending audit); attend or visit one local F&B community / association event (Part 8 §8.8.1); begin 3-part blog series "From cart to payment" (pillar 1)         | D4 geo page; event attendance                           |                  $300 | Web sessions; event-sourced trial signups (UTM)       |
| **M6** | **Mid-year review:** assess channel attribution, founder hours/tenant log, supplier import depth; decide LinkedIn paid test ($360 reserve); run 15–20 prospect conversations if not done (Part 8 §8.10 #10)                | Mid-year KPI report; message refinements                |                $0–360 | M6 baselines for all §9.7.1 metrics                   |

### Phase C — Consideration Scale (Months 7–9)

**Strategic intent:** Double down on channels showing attribution signal; expand content library;
prepare review-platform listing without soliciting premature reviews.

| Month  | Priority activities                                                                                                                                                                      | Deliverables           | Cash spend _(target)_ | KPI focus                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------: | --------------------------------- |
| **M7** | Blog parts 2–3 (pillar 1); dual-audience feature pages (restaurant + supplier); second anchor supplier push; monetization UX alignment check (80% banner, 3-block nudge — Part 8 §8.6.2) | 2 feature pages        |           $200 design | Block → upgrade rate              |
| **M8** | Technical SEO baseline (Part 8 §8.5.5): structured data, sitemap, hreflang; internal comparison doc for sales only (not public negative ads — Part 8 §8.3.4)                             | SEO checklist complete |                    $0 | Index coverage                    |
| **M9** | Second local event or hosted roundtable (5–8 operators); refresh demo video if UI changed; sponsor-flow explainer for suppliers (Part 10 §10.4)                                          | Event / roundtable     |                  $300 | Referral conversions (first paid) |

### Phase D — Optimization and Proof-Building (Months 10–12)

**Strategic intent:** Shift from pure awareness to proof-adjacent content (without fabricating case
studies); set Year 2 channel decisions; align with Part 1 §1.15 twelve-month tenant targets.

| Month   | Priority activities                                                                                                                                                                                                          | Deliverables                  |  Cash spend _(target)_ | KPI focus                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------: | ------------------------------- |
| **M10** | Draft first customer story **only if** paying tenant consent exists — otherwise publish "operator workflow" anonymized content; G2/Capterra listing prep (no review solicitation until ≥5 satisfied tenants — Part 8 §8.6.1) | Workflow content or 1st story |                   $200 | Trial → paid rate               |
| **M11** | Plan mix review (Gold modal target — Part 1 §1.15); pricing page A/B copy test (manual, low traffic — not statistically powered); WhatsApp group presence in 1–2 founder-accessible F&B groups                               | Copy variants                 |                     $0 | Plan distribution at conversion |
| **M12** | Year 1 retrospective; Year 2 channel recommendation (paid search pilot yes/no); handoff package to Part 12 financial model (actual CAC inputs)                                                                               | Annual report                 | $270 contingency spend | All §9.7.1 M12 targets assessed |

### 9.8.1 Consolidated monthly cash schedule

|   Month |  M1 |  M2 |  M3 |  M4 |  M5 |  M6 |  M7 |  M8 |  M9 | M10 | M11 | M12 | **Total** |
| ------: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --------: |
| **USD** | 400 |  30 | 900 | 300 | 300 | 180 | 200 |   0 | 300 | 200 |   0 | 490 | **4,800** |

M6 and M12 include optional/contingency draws. Underspend in any month rolls to contingency.

---

## 9.9 Integration with Sales (Part 10)

Marketing and sales are not separate functions at this stage — they are **sequenced activities
performed by the same founder**. This section defines handoff points to avoid duplication with
Part 10.

| Funnel stage (Part 10 §10.3) | Marketing responsibility                                                     | Sales responsibility                                                       |
| ---------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1 — Awareness                | Collateral, site, LinkedIn, events, supplier one-pager                       | Founder network intros                                                     |
| 2 — Discovery / demo         | Content that pre-empts objections (Part 8 §8.7.2); demo video drives booking | Live demo via `12-demo-script.md`; enterprise checklist for Platinum track |
| 3 — Free Trial signup        | CTAs, UTM links, referral invites                                            | None unless hand-holding requested                                         |
| 4 — In-trial PQL             | Email/WhatsApp nudge templates (optional, manual)                            | Founder outreach when blocks ≥3 in 7 days                                  |
| 5 — Conversion               | Pricing page accuracy; no false card-checkout claim                          | Manual invoicing close (Part 10 §10.1)                                     |
| 6 — Expansion                | Upgrade messaging aligned to limits                                          | Add-on provisioning (admin today)                                          |

**CRM:** No marketing automation or CRM is budgeted in Year 1 (Part 10 §10.1). Pipeline tracking
remains spreadsheet until monthly trial signups exceed ~10, at which point a lightweight CRM
becomes an open decision (Part 10 open item #2).

---

## 9.10 Risk Mitigation and Decision Gates

| Risk                                         | Mitigation in this plan                        | Decision gate                                                                                 |
| -------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Two-sided cold start (Part 6 §6.6)           | Supplier-first Months 1–6; anchor supplier KPI | If zero suppliers importing by M6, pause restaurant outreach and reassess ICP (Part 10 §10.2) |
| Founder bandwidth                            | 8–15 hrs/week cap; defer paid channels         | If hours/tenant >40, cut event and blog cadence before adding spend                           |
| Arabic "ready" overclaim (Part 8 open #3)    | Geo page delayed until UI audit                | Gate D4 on audit pass                                                                         |
| Billing expectation mismatch (Part 10 §10.1) | FAQ discloses manual payment                   | Gate any "Subscribe now" auto-billing copy on live processor                                  |
| Cash overrun                                 | $780 contingency; no paid ads                  | Monthly spend review; freeze at $400/mo avg                                                   |
| Message drift vs. product                    | Quarterly claim audit with Part 11             | Remove any copy for catalog-only Platinum features                                            |

**Paid search reactivation criteria (Year 2 candidate — all must be true):**

1. ≥10 paying tenants with ≥3 months tenure _(target threshold, not current state)_.
2. Landing page trial signup conversion baseline established (≥30 days of data).
3. Arabic and English keyword research complete (Part 8 §8.5.3).
4. Live payment processor shipped (Part 11 §11.1).
5. Monthly marketing budget increased above $4,800/year with Part 12 approval.

---

## 9.11 Year 2 Preview _(not a commitment)_

If Year 1 produces a measurable supplier referral loop and ≥20 combined paying tenants
(directionally consistent with Part 1 §1.15 twelve-month range and Part 6 break-even path),
Year 2 marketing would logically add: modest Google Ads pilot ($200–500/month **assumption**),
G2/Capterra review solicitation, first freelance content hire or agency project, and GCC
research-only content per Part 14 — none of which is budgeted or scheduled here.

---

## 9.12 Strategic Recommendations Summary

1. **Treat supplier onboarding as marketing's top priority through Month 6** — it is the only
   shipped acquisition loop that scales without cash (Part 8 §8.10 #2).
2. **Cap incremental marketing cash at $4,800 in Year 1** — roughly 7% of modeled fixed OPEX
   (Part 6 §6.4.1); protect runway for support hire before break-even (Part 6 §6.5).
3. **Ship five collateral deliverables (§9.6) before any paid media** — content debt is format
   debt, not substance debt (Part 10 §10.5).
4. **Instrument UTMs and founder hours from Month 1** — replace all KPI assumptions in §9.7 with
   real data by Month 6 review.
5. **Keep paid search, GCC, and review platforms deferred** until proof and processor gaps close
   (Part 8 §8.6.3, Part 10 §10.1).
6. **Run the 15–20 prospect conversation batch by Month 6** — secondary research is exhausted
   (Part 8 §8.10 #10); messaging must be validated or revised before Year 2 spend.
7. **Align every public pricing touchpoint with manual billing reality** until stub gateway is
   replaced (Part 10 §10.1, Part 8 open #6).

---

## Sources & Assumptions Used in This Part

- **Channel prioritization and message architecture:** Part 8, §8.5–§8.7.
- **Pricing, trial design, referral economics:** Part 7, §7.2–§7.3, §7.9–§7.11;
  `docs/product/tier-matrix.md`; `docs/sales/08_pricing_strategy.md`.
- **Operating cost envelope and break-even model:** Part 6, §6.4–§6.6, §6.12.
- **Sales funnel, two-sided sequencing, collateral inventory:** Part 10, §10.1–§10.5, §10.9.
- **Success metric horizons:** Part 1, §1.15.
- **Lebanon market size and fresh-opening cohort:** Part 2, §2.12 (via Part 8 §8.8.1).
- **Monetization UX and PQL instrumentation:** `docs/product/monetization-ux.md`.
- **Supplier growth program:** `docs/features/supplier-customer-growth.md`.
- **Brand personality:** `PRODUCT.md` (via Part 8 §8.2.1).

### Assumptions explicitly labeled in this part

- Month 1 = commercial launch month; calendar shifts if launch slips.
- Year 1 marketing cash budget of **$4,800** (~$400/month) is a planning assumption sized to
  bootstrapped constraints — not a committed purchase order.
- Founder marketing time of **8–15 hours/week** is a planning assumption, not measured.
- Month 6 and Month 12 KPI targets are **baselines and directional goals**, not forecasts
  derived from historical performance.
- Anchor supplier targets (≥3 importing by Month 6) are **founder-judgment targets**, not
  market-derived quotas.
- Paid search reactivation thresholds in §9.10 are **decision criteria for Year 2**, not
  current achievements.
- Event fees ($600/year total) assume one-to-two modest local events — actual fees unverified.
- Relative web traffic target (+50% vs. Month 3 baseline by Month 12) is a **relative
  assumption** only; no absolute session numbers are stated because no baseline exists.

**No customer interviews, brand-tracking surveys, SEO performance data, paid campaign results,
conversion metrics, or marketing spend actuals exist and none are represented as existing
anywhere in this part.**

---

### Open items for founder review

1. **Confirm Month 1 launch date** — the entire calendar anchors to it (§9.8).
2. **Confirm or revise positioning statement and tagline** (Part 8 §8.3.1, §8.7.1) before M1
   external copy ships.
3. **Approve $4,800 Year 1 cash envelope** or revise before any freelance/event commitments.
4. **Decide cloud-kitchen GTM (Part 3 open item #3)** — if yes, add Persona R3 content in M7–M8;
   if no, keep deferred as written.
5. **Complete Arabic UI audit** before D4 bilingual geo page publishes (Part 8 open item #3).
6. **Commission Arabic + English keyword research** by M4 at latest (Part 8 open item #4).
7. **Run 15–20 structured prospect conversations by M6** (Part 8 open item #5).
8. **Confirm billing disclosure language** on pricing/marketing pages (Part 8 open item #6,
   Part 10 §10.1).
9. **Set up UTM convention and GA4** before first outbound link (Part 8 open item #8).
10. **Decide G2/Capterra listing timing** — prep in M10, solicit only after ≥5 satisfied tenants
    (Part 8 open item #7).
11. **Confirm whether LinkedIn paid test ($360 reserve) runs in M6** based on mid-year attribution.
12. **Log founder hours per paying tenant from first prospect conversation** (Part 10 §10.9) —
    replaces §9.4.3 time assumption with real CAC data for Part 12.
