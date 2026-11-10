# Part 12 — Financials (3-Year Model)

**Status:** Draft, part 12 of 16. Builds directly on Part 6 (§6.4, §6.9, §6.12–§6.14 — break-even,
sensitivity, capital, and 18-month ROI scenarios), Part 7 (§7.2, §7.10–§7.11 — pricing, LTV/CAC),
and Part 10 (§10.1, §10.4, §10.7 — sales motion, two-sided acquisition sequencing, deal-size
assumptions). Part 9 (Marketing Plan) does **not yet exist**; Year 2–3 marketing spend lines below
are explicitly labeled **placeholder assumptions** pending Part 9, not commitments. Company stage,
restated because it governs every figure in this part: **pre-launch** (zero live paying tenants),
**bootstrapped** (no institutional capital raised, not currently running a raise). Every forward
figure is a **target or modeled output**, never an actual — per the [README](./README.md) disclosure
standard.

**What this part is, and is not:** Part 12 translates the unit-economics foundation already built
in Parts 6 and 7 into a three-year financial view — MRR/ARR trajectory, burn and runway, and
CAC/LTV evolution — so founders, advisors, and future investors can stress-test the plan before
live billing data exists. It does **not** re-derive the break-even model or LTV/CAC inputs; those
are **carried forward verbatim** from their source sections. It also does **not** constitute a
fundraising ask, a audited forecast, or a substitute for rebuilding the model with real cohort data
once 3–6 months of post-launch billing history exist (Part 6 §6.15, Part 7 §7.10).

---

## 12.1 Executive Summary

Supplify's financial posture at time of writing is defined by a paradox common to capable
pre-launch SaaS companies: **the product risk is largely retired; the commercial and macro risks
are not.** The codebase supports a dual-sided subscription business with enforced tiering; what
does not yet exist is a paying cohort, a live payment processor in production (Part 10 §10.1), or
measured churn, conversion, or CAC.

Against that backdrop, the planning model — anchored to Part 6 and Part 7 — yields four headline
conclusions for the **base-case path** (explicitly modeled, not promised):

1. **Break-even is reachable on bootstrapped economics.** Under Part 6's stated inputs — **~55
   paying tenants**, **~$6,050 MRR**, **~$110 blended ARPU**, **4% monthly gross churn**, **~$5,800
   monthly fixed operating cost** — the company covers its modeled cost base at a tenant count that
   sits within Part 1 §1.15's 12–18 month target range. Modeled time to break-even from a standing
   start: **~11.2 months** (Part 6 §6.12–§6.13), assuming **six gross new paying tenants per month**
   before churn.

2. **Pre-break-even cash need is modest in venture terms, material in bootstrap terms.** Part 6 §6.9
   models **~$31,000 (ramp-adjusted) to ~$65,000 (conservative upper bound)** cumulative cash
   required to reach break-even — a range that is fundable from founder savings, early revenue, and
   manual invoicing (Part 10 §10.1) without an institutional round, but not trivial.

3. **Unit economics are favorable in the founder-led phase — and that favorability is not
   scalable as stated.** Part 7 §7.10–§7.11 carry **~$2,640 gross LTV** against **near-$0 cash CAC**
   under founder-led direct sales. That ratio is an artifact of pre-launch distribution economics,
   not evidence of paid-channel viability; it should not be presented to counter-parties as proven
   until referral-discount costs and (eventually) Part 9 marketing spend are measured.

4. **Three-year revenue remains a small-business outcome unless acquisition rate or ARPU
   materially exceeds the base extension assumptions in §12.6.** The base-case **Year 3 ARR target
   is ~$418,000** (~290 paying tenants at ~$120 blended ARPU) — appropriate for a bootstrapped
   Lebanon-first SaaS company, not a venture-scale outcome. Upside and downside bookends are
   provided in §12.10.

The honest planning takeaway: **financial feasibility is modeled as achievable; financial
optimism is not.** Lebanon macro risk (Part 13 §13.3), two-sided cold start (Part 10 §10.4), and
the billing-gateway gap (Part 11 §11.1) can each shift the timeline by quarters, not weeks.

---

## 12.2 Modeling Framework & Carried Inputs

### 12.2.1 Scope and time horizon

This model covers **Months 1–36** from commercial launch in Lebanon (Part 1 §1.6, 0–6 month
objective). Month 0 is pre-launch today: **zero MRR, zero paying tenants, zero measured churn.**

All figures are **USD-denominated**, consistent with Part 7's pricing ladder and Part 6's cost
assumptions (Lebanon-based technical staff compensated in "fresh dollars" — Part 6 §6.4.1).

### 12.2.2 Inputs carried from Part 6 — not re-derived

The following are **fixed planning anchors**. Part 12 references them; it does not recompute or
revise them.

| Input                                                    |           Value | Source                                                            |
| -------------------------------------------------------- | --------------: | ----------------------------------------------------------------- |
| Modeled monthly fixed operating cost                     |     **~$5,800** | Part 6 §6.4.1 (Year 1 base; step-ups modeled separately in §12.8) |
| Blended ARPU (base case)                                 | **~$110/month** | Part 7 §7.10; used in Part 6 §6.4, §6.12                          |
| Net contribution margin per tenant                       | **~$107/month** | Part 6 §6.4.2 ($110 ARPU less ~$3 payment processing)             |
| Break-even paying tenants (blended)                      |         **~55** | Part 6 §6.4.3, §6.13                                              |
| Break-even MRR                                           |     **~$6,050** | Part 6 §6.13 ($55 × $110)                                         |
| Monthly gross churn (base case)                          |          **4%** | Part 7 §7.10; used in Part 6 §6.12                                |
| Modeled months to break-even (base case)                 |       **~11.2** | Part 6 §6.12–§6.13                                                |
| Gross new paying tenants per month (Year 1 illustration) |           **6** | Part 6 §6.12 (illustrative; not independently sourced)            |
| Pre-break-even capital range                             |  **~$31k–$65k** | Part 6 §6.9                                                       |

### 12.2.3 Inputs carried from Part 7 — not re-derived

| Input                              |                               Value | Source                                               |
| ---------------------------------- | ----------------------------------: | ---------------------------------------------------- |
| Modeled gross LTV                  |                         **~$2,640** | Part 7 §7.10 ($110 × ~24-month lifetime at 4% churn) |
| Near-term cash CAC (founder-led)   |                         **Near-$0** | Part 7 §7.11                                         |
| Modal plan (pricing design intent) |                  **Gold ($149/mo)** | Part 7 §7.2                                          |
| Referral subsidy (restaurant)      | **20% off first paid subscription** | Part 7 §7.9, §7.11                                   |
| Supplier referral reward           |  **1 free month or billing credit** | Part 7 §7.9, §7.11                                   |

### 12.2.4 What Part 9's absence means for this model

Part 9 (Marketing Plan) is **not started** (README). Year 1 acquisition in this model therefore
follows Part 10's disclosed motion: **founder-led direct sales and supplier-driven referral/import**
(§10.4), with no paid demand-generation budget. Year 2–3 marketing lines in §12.8 are **explicit
placeholder assumptions** ($500/month test budget from Month 19; $1,500/month from Month 25) to be
replaced entirely when Part 9 is written. They are included so burn math is not falsely optimistic
about a zero-marketing future, not because a marketing plan exists.

---

## 12.3 Unit Economics — Reference View

Part 12 does not rebuild the LTV or break-even arithmetic; it **uses** the results as the unit-
economics spine for all revenue and burn calculations below.

### 12.3.1 Contribution and break-even (Part 6)

At **~$107 net contribution per tenant per month** against **~$5,800 fixed cost**, each marginal
paying tenant after break-even contributes roughly **$107/month toward growth investment or
profit** — before support load, founder time, or any cost step-up from hiring (§12.8). The static
break-even point remains **~55 tenants / ~$6,050 MRR** (Part 6 §6.13).

Sensitivity to ARPU and churn — already computed in Part 6 §6.12 — is summarized here for
financial-planning convenience only:

| Scenario                          | Break-even tenants | Modeled months to break-even |
| --------------------------------- | -----------------: | ---------------------------: |
| ARPU −30%, churn +30% (stress)    |                 78 |                        ~21.1 |
| **Base (carried inputs)**         |             **55** |                    **~11.2** |
| ARPU +30%, churn −30% (favorable) |                 42 |                         ~7.7 |

Part 12's three-year scenarios (§12.10) bracket around this range rather than treating the base
case as a single-point forecast.

### 12.3.2 LTV and CAC (Part 7)

**Gross LTV ~$2,640** is a revenue metric, not profit: it excludes CAC, support cost, and payment
processing (Part 7 §7.10). **Near-$0 cash CAC** reflects founder-led acquisition (Part 7 §7.11;
Part 10 §10.1) — the real cost is founder time, which this model does **not** monetize into P&L
( flagged open item).

Once the supplier referral loop activates (Part 7 §7.9; Part 10 §10.4), **effective cash CAC**
for referred restaurants becomes calculable: approximately **$22–$44 per conversion** from the 20%
first-subscription discount on ~$110 ARPU, plus the amortized cost of a supplier reward (one month
free or billing credit — typically **$49–$149** depending on supplier plan, spread across multiple
referrals). These are **modeled ranges**, not measured costs; they remain favorable to gross LTV but
are not zero.

**LTV:CAC ratio (founder-led phase):** arithmetically strong because cash CAC ≈ $0; **not
investor-grade proof of scalable unit economics** until paid channels from Part 9 are tested (Part 7
§7.11).

---

## 12.4 Year 1 — Launch, Ramp, and Break-Even _(modeled)_

Year 1 corresponds to Part 1 §1.6's **0–12 month** horizon: commercial launch in Lebanon, first
paying cohort on both sides, and — in the base case — **crossing break-even near Month 11.**

### 12.4.1 Tenant accumulation mechanics (reference only)

Part 6 §6.12 defines the accumulation formula used for Month 1–12 illustration:

$$
N(t) = \frac{g}{c}\left(1-(1-c)^{t}\right)
$$

With **g = 6**, **c = 0.04**, and **t** = months since launch, the model produces:

|  Month | Modeled paying tenants (g=6, c=4%) | Modeled MRR (@ $110 ARPU) |
| -----: | ---------------------------------: | ------------------------: |
|      3 |                                ~17 |                   ~$1,870 |
|      6 |                                ~33 |                   ~$3,630 |
|      9 |                                ~46 |                   ~$5,060 |
| **11** |                            **~54** |               **~$5,940** |
|     12 |                                ~58 |                   ~$6,380 |

Month 11–12 is where the base case **crosses Part 6's ~55-tenant / ~$6,050 break-even threshold**
(Part 6 §6.13). Rounding and intra-month timing explain minor variance from the exact $6,050 figure.

### 12.4.2 Year 1 quarterly financial summary _(base case — modeled)_

| Quarter     | Modeled avg. paying tenants | Modeled MRR (end of quarter) | Modeled fixed cost/mo | Modeled net burn/mo (avg.) | Modeled cumulative cash consumed |
| ----------- | --------------------------: | ---------------------------: | --------------------: | -------------------------: | -------------------------------: |
| Q1 (M1–3)   |                         ~10 |                      ~$1,870 |                $5,800 |                    ~$4,730 |                         ~$14,200 |
| Q2 (M4–6)   |                         ~24 |                      ~$3,630 |                $5,800 |                    ~$3,230 |                         ~$23,900 |
| Q3 (M7–9)   |                         ~38 |                      ~$5,060 |                $5,800 |                    ~$1,730 |                         ~$29,100 |
| Q4 (M10–12) |                         ~52 |                      ~$6,380 |                $5,800 |                      ~$240 |                         ~$29,800 |

**Net burn** = fixed cost − (tenants × $107 contribution margin). Q4 average approaches **cash-flow
breakeven on an operating basis**; cumulative cash consumed **~$30,000** aligns with Part 6 §6.9's
ramp-adjusted **~$31,000** figure — a consistency check, not a new derivation.

### 12.4.3 Year 1 ARR and plan-mix note

End-of-Year-1 **MRR ~$6,380** implies **ARR ~$76,600** — below Part 6 §6.14's **18-month expected
case (~$13,200 MRR / ~$158,400 ARR run-rate)** because the g=6 accumulation model is conservative
through Month 12. Part 6 §6.14's expected case (~120 tenants at Month 18) assumes **stronger
commercial execution** than pure g=6 linearity; §12.5 bridges Month 12 → Month 18 using that
18-month anchor.

**Plan mix (target):** Gold as modal plan by Month 12 (Part 1 §1.15; Part 7 §7.2). ARPU held at
**~$110** in Year 1 base case — consistent with Part 7 §7.10, not a richer mix assumption.

---

## 12.5 Months 13–18 — Post Break-Even to Cohort Scale _(modeled)_

This window maps to Part 1 §1.6's **12–18 month** objective: a cohort large enough to begin
replacing modeled LTV/CAC with measured values (Part 1 §1.6; Part 7 §7.10).

### 12.5.1 Anchor to Part 6 §6.14 expected case

At **Month 18**, Part 6 §6.14 **expected case** (not re-derived):

| Metric         |                             Modeled value | Source           |
| -------------- | ----------------------------------------: | ---------------- |
| Paying tenants | **~120** (100 restaurants + 20 suppliers) | Part 6 §6.14     |
| Blended ARPU   |                                 **~$110** | Part 7 §7.10     |
| MRR            |                              **~$13,200** | Part 6 §6.14     |
| ARR run-rate   |                             **~$158,400** | Derived from MRR |

The path from **~58 tenants (M12)** to **~120 tenants (M18)** implies **~10 gross adds per month
net of churn** on average — higher than Part 6 §6.12's g=6 illustration, reflecting compounding from
the supplier import/referral loop (Part 10 §10.4) and operational focus post-break-even. This is a
**modeled bridge assumption**, flagged for founder validation (open items).

### 12.5.2 Months 13–18 burn _(base case — modeled)_

| Period |  Modeled MRR (end) | Modeled fixed cost/mo | Modeled operating result/mo |
| ------ | -----------------: | --------------------: | --------------------------- |
| M13–15 |  ~$8,500 → $10,500 |                $6,900 | ~$1,200 → $2,400 surplus    |
| M16–18 | ~$11,000 → $13,200 |                $6,900 | ~$3,000 → $4,900 surplus    |

**Fixed cost step-up to ~$6,900/month** from Month 13 (modeled): adds **~$600/month part-time
commercial support** and **~$500/month tooling** (lightweight CRM, accounting — Part 10 open items)
to the Part 6 §6.4.1 **$5,800 base**. First dedicated commercial hire is partial, not full FTE —
consistent with Part 6 §6.8 sequencing (support already in base; commercial hire triggered by founder
time saturation).

**Cumulative cash position at Month 18 (base case):** prior ~$30k pre-break-even consumption **recovered
by ~$25–30k cumulative operating surplus M13–18**, leaving the bootstrapped company **approximately
cash-neutral to slightly positive** — highly sensitive to Lebanon payment collection (Part 13 §13.3)
and billing-gateway timing (Part 10 §10.1).

---

## 12.6 Years 2–3 — Growth, Hiring, and Expansion Prep _(modeled extension)_

Months 19–36 are **explicit extensions** beyond Part 6's 18-month ROI scenarios. Every assumption
added here is labeled **modeled target**; none are measured or committed.

### 12.6.1 Extension assumptions (base case)

| Assumption                  | Year 2 (M19–24)  | Year 3 (M25–36)          | Rationale                                                                        |
| --------------------------- | ---------------- | ------------------------ | -------------------------------------------------------------------------------- |
| Gross new paying tenants/mo | 8 → 10           | 10 → 12                  | First commercial hire (Part 6 §6.8); referral loop maturity (Part 10 §10.4)      |
| Monthly gross churn         | 3.8% → 3.5%      | 3.5% → 3.2%              | Referral-sourced tenants modeled as slightly stickier (Part 7 §7.9 — hypothesis) |
| Blended ARPU                | $110 → $115      | $115 → $120              | Add-on billing automation (Part 7 §7.7); richer plan mix (Part 1 §1.15)          |
| Fixed cost/mo               | $8,500 → $10,500 | $11,000 → $13,000        | Commercial FTE, Part 9 placeholder marketing, GCC prep (Part 1 §1.6 M18–24)      |
| Geography                   | Lebanon only     | Lebanon + GCC pilot prep | Part 1 §1.6; Part 14 not yet written — no GCC revenue modeled in base case       |

### 12.6.2 Three-year MRR / ARR trajectory _(base case — modeled)_

| Milestone | Modeled paying tenants | Modeled blended ARPU |  Modeled MRR | Modeled ARR run-rate |
| --------- | ---------------------: | -------------------: | -----------: | -------------------: |
| M6        |                    ~33 |                 $110 |      ~$3,630 |             ~$43,600 |
| M12       |                    ~58 |                 $110 |      ~$6,380 |             ~$76,600 |
| M18       |                   ~120 |                 $110 |     ~$13,200 |            ~$158,400 |
| M24       |                   ~175 |                 $115 |     ~$20,125 |            ~$241,500 |
| M30       |                   ~230 |                 $118 |     ~$27,140 |            ~$325,700 |
| **M36**   |               **~290** |             **$120** | **~$34,800** |        **~$417,600** |

At **M36**, modeled tenant count (~290) remains **below equilibrium** for g=12 at c=3.2%
(steady-state ≈ 375 tenants) — implying the base case assumes continued acceleration headroom, not
saturation in Lebanon alone. That is intentional: Lebanon's ~4,000–4,500 F&B establishments (Part 1
§1.7) could theoretically support deeper penetration, but **macro, competitive, and commercial
constraints (Part 13 §13.2–§13.3) make saturation modeling premature.**

### 12.6.3 Year 2 and Year 3 P&L summary _(operating, modeled)_

| Year   | Modeled avg. MRR | Modeled annual revenue | Modeled avg. fixed cost/mo | Modeled operating margin (before founder comp) |
| ------ | ---------------: | ---------------------: | -------------------------: | ---------------------------------------------: |
| Year 1 |          ~$4,200 |               ~$50,400 |                     $5,800 |                                Negative (ramp) |
| Year 2 |         ~$16,700 |              ~$200,400 |                    ~$9,500 |                **~$30–40k positive (modeled)** |
| Year 3 |         ~$29,000 |              ~$348,000 |                   ~$12,000 |               **~$80–100k positive (modeled)** |

Revenue = average MRR × 12 (simplified; no annual prepay cash-timing adjustment). **Operating margin**
= revenue − (fixed cost × 12) − (tenants × $3 processing × 12); excludes founder salary, tax, one-
time legal, and GCC entry costs. Year 3 margin supports **optional reinvestment** (Part 7 §7.7 add-on
automation, Part 11 payment gateway, Part 14 GCC) without requiring an institutional round in the
base case — but does **not** fund a large team quickly.

---

## 12.7 Burn, Runway, and Cash-Flow Profile _(modeled)_

### 12.7.1 Pre-break-even burn (Part 6 §6.9 — carried forward)

| Metric                                              | Modeled value | Source / note |
| --------------------------------------------------- | ------------: | ------------- |
| Monthly fixed burn (pre-revenue)                    |       ~$5,800 | Part 6 §6.4.1 |
| Modeled months to break-even                        |         ~11.2 | Part 6 §6.13  |
| Cumulative cash required (ramp-adjusted)            |  **~$31,000** | Part 6 §6.9   |
| Cumulative cash required (zero-revenue upper bound) |  **~$65,000** | Part 6 §6.9   |

The **~$31k–$65k range** is the relevant bootstrap planning envelope: enough to cause genuine
founder runway anxiety, insufficient to justify a priced seed round on its own.

### 12.7.2 Post-break-even cash generation _(base case extension)_

| Phase  | Modeled monthly operating cash flow | Comment                                                        |
| ------ | ----------------------------------: | -------------------------------------------------------------- |
| M1–10  |                  −$1,700 to −$4,800 | Ramp; manual billing may delay cash collection (Part 10 §10.1) |
| M11–12 |                      −$200 to +$500 | Break-even zone (Part 6 §6.13)                                 |
| M13–18 |                  +$1,200 to +$4,900 | Surplus funds first hire step-up                               |
| M19–36 |                 +$3,500 to +$12,000 | Reinvestment capacity if Lebanon macro holds                   |

**Lebanon payment-collection risk** (Part 13 §13.3) can convert modeled surplus into effective burn
if tenants pay late, in lollars at a discount, or churn for macro reasons — not captured in the base
case churn rate alone.

### 12.7.3 Runway framing for a bootstrapped company

Without external capital, **runway = founder accessible cash ÷ net monthly burn** pre-break-even.
Examples (illustrative only):

| Founder cash reserve | Modeled runway pre-break-even (avg. ~$3,500 net burn) |
| -------------------: | ----------------------------------------------------: |
|              $25,000 |             ~7 months (tight; requires early revenue) |
|              $40,000 |       ~11 months (aligns with base break-even timing) |
|              $65,000 |   ~18 months (covers Part 6 upper-bound capital need) |

Post-break-even, the company transitions from **consumption** to **self-funding growth** in the base
case — the strategic intent of the bootstrapped plan (Part 1 §1.12).

---

## 12.8 Cost Structure Evolution _(modeled targets)_

Part 6 §6.4.1 establishes the **Year 1 floor: ~$5,800/month**. Part 12 extends with **step-ups tied
to Part 6 §6.8 hiring sequence** — all figures are targets, not contracts.

| Cost line                      |       M1–12 |      M13–18 |      M19–24 |       M25–36 |
| ------------------------------ | ----------: | ----------: | ----------: | -----------: |
| Core engineering (2 FTE-eq.)   |      $3,600 |      $3,600 |      $3,600 |       $4,500 |
| Support / CS                   |        $900 |        $900 |      $1,800 |       $2,400 |
| Commercial / sales             |           — |        $600 |      $2,400 |       $3,000 |
| Infrastructure                 |        $300 |        $400 |        $600 |         $900 |
| SaaS tooling                   |        $200 |        $400 |        $500 |         $600 |
| Legal / accounting             |        $300 |        $300 |        $400 |         $500 |
| Marketing (Part 9 placeholder) |           — |           — |        $500 |       $1,500 |
| Contingency (~10%)             |        $530 |        $690 |        $950 |       $1,260 |
| **Total fixed/mo**             | **~$5,800** | **~$6,900** | **~$9,750** | **~$12,660** |

**Year 3 engineering step-up (+$900/mo)** models fractional DevOps or senior contractor ahead of GCC
(Part 6 §6.10, §6.3). **Marketing placeholder** must be replaced when Part 9 exists.

Variable cost remains **~$3/tenant/month** processing (Part 6 §6.4.2) unless payment-facilitation
changes processor economics (Part 7 §7.5 — out of scope for this model).

---

## 12.9 CAC / LTV Evolution Over Three Years _(modeled)_

### 12.9.1 Phase 1 — Founder-led (Months 1–12)

| Metric          |                            Value | Status                                                    |
| --------------- | -------------------------------: | --------------------------------------------------------- |
| Cash CAC        |                      **Near-$0** | Part 7 §7.11 — carried forward                            |
| Gross LTV       |                      **~$2,640** | Part 7 §7.10 — carried forward                            |
| LTV:CAC (cash)  | N/A (undefined ratio at ~$0 CAC) | Not investor-presentable                                  |
| Real CAC driver |    Founder hours per paid tenant | Part 10 §10.9 — recommend logging from first conversation |

### 12.9.2 Phase 2 — Referral-heavy (Months 13–24)

| Channel                                    |                      Modeled effective CAC | Modeled gross LTV |                     Modeled LTV:CAC |
| ------------------------------------------ | -----------------------------------------: | ----------------: | ----------------------------------: |
| Founder direct                             |                               Near-$0 cash |           ~$2,640 |      Favorable (time cost excluded) |
| Supplier referral                          | **~$40–$80** (discount + reward amortized) |           ~$2,640 | **~33–66×** (gross, before support) |
| Blended (70% referral / 30% direct by M24) |                               **~$30–$55** |           ~$2,640 |                         **~48–88×** |

Referral CAC is **modeled from Part 7 §7.9 mechanics**, not measured conversion data.

### 12.9.3 Phase 3 — Paid experiments begin (Months 25–36)

When Part 9 channels activate, the model holds a **placeholder paid CAC of ~$150–$250** per paying
tenant for any share acquired through paid/outbound experiments (30% of new adds by M36 — **assumption
only**). Blended CAC rises but should remain **well below gross LTV** if the Part 7 retention model
holds:

| Metric                                    |              M36 base-case target |
| ----------------------------------------- | --------------------------------: |
| Blended cash CAC (modeled)                |                         ~$80–$120 |
| Gross LTV (carried, until cohort rebuild) |                           ~$2,640 |
| LTV:CAC (gross, modeled)                  |                           ~22–33× |
| Payback period (contribution basis)       | ~1–2 months at $107/tenant margin |

**Critical caveat:** a **~$150–$250 paid CAC** that sticks as scale increases would compress LTV:CAC
toward **~10–18×** — still healthy for SMB SaaS if churn stays near 4%, but no longer "exceptional."
Part 12 will require a full rebuild once Part 9 defines channels and spend.

---

## 12.10 Scenario Analysis — Three-Year Outcomes _(modeled)_

Three scenarios extend Part 6 §6.14's 18-month bookends through Month 36. **M18 anchors match Part 6
exactly**; M36 figures are extension outputs.

| Scenario            | M18 tenants / MRR (Part 6 §6.14) | M36 tenants / MRR (modeled extension) | M36 ARR run-rate |
| ------------------- | -------------------------------- | ------------------------------------: | ---------------: |
| **Downside**        | ~50 / ~$4,500                    |                         ~95 / ~$8,550 |        ~$103,000 |
| **Base (expected)** | ~120 / ~$13,200                  |                       ~290 / ~$34,800 |        ~$418,000 |
| **Upside (best)**   | ~190 / ~$24,700                  |                       ~420 / ~$54,600 |        ~$655,000 |

**Downside** assumes break-even slips past Month 18 (Part 6 §6.14 worst case), churn +30% (5.2%),
Silver-heavy mix (~$90 ARPU), and Lebanon macro deterioration (Part 13 §13.3). **Upside** assumes
Part 6 best case at M18 plus sustained g=14/month and ARPU ~$130 from Platinum/chain adoption.

Even **upside M36 ARR ~$655k** is a **profitable small SaaS business**, not a venture exit
narrative — consistent with bootstrapped positioning (Part 1 §1.12).

### 12.10.1 Key sensitivities for the three-year view

| Driver                       | Downside trigger                                          | Upside trigger                                                      |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Time to live billing gateway | Manual invoicing caps conversion velocity (Part 10 §10.1) | Gateway ships M1–3; self-serve conversion accelerates               |
| Gross new tenants/month      | Stays at 4–5 (below Part 6 g=6)                           | Reaches 12–14 with anchor suppliers importing books (Part 10 §10.4) |
| Churn                        | 5.2%+ (Part 6 stress)                                     | 2.8% (Part 6 favorable)                                             |
| ARPU                         | $90 (Silver-heavy)                                        | $130 (Gold/Platinum + add-ons)                                      |
| Fixed cost discipline        | Hiring ahead of MRR                                       | Hiring tied to surplus (Part 6 §6.8 sequence)                       |

---

## 12.11 Capital Strategy & Optional Raise Framing _(planning only)_

Part 1 §1.12 states Supplify is **not currently raising**. This section describes **when and why**
a future round might be considered — not an ask.

### 12.11.1 Bootstrap path (default plan)

The base-case model supports reaching **operating break-even (~$6,050 MRR, ~55 tenants)** without
institutional capital (Part 6 §6.13), with **~$31k–$65k** cumulative pre-break-even cash need (Part 6
§6.9). Year 2–3 surpluses (§12.6.3) can fund Part 7 §7.7 priorities (add-on billing automation,
payment facilitation scoping) and Part 14 GCC prep — **slowly**.

### 12.11.2 Optional raise triggers (hypothetical)

A seed round would be **logically timed** after Part 1 §1.6's **12–18 month objective**: when **real
CAC, LTV, churn, and NRR** replace modeled placeholders (Part 7 §7.10; Part 1 §1.15). Raise use-of-
proceeds would **not** be "reach break-even" (achievable bootstrap) but **accelerate**:

1. GCC market entry ahead of Month 24 (Part 1 §1.6; Part 14 dependency)
2. Catalog-only Platinum gap closure at scale (Part 11 §11.1)
3. First commercial team (2–3 FTE) to escape founder-bandwidth constraint (Part 6 §6.6)
4. Paid acquisition tests with measured CAC (Part 9 dependency)

**No raise amount is modeled here** — pre-revenue valuation and terms are counter-productive to guess
(Part 1 §1.12).

### 12.11.3 What investors should see vs. what exists today

| Metric     | Today                               | After 12–18 months (target)              |
| ---------- | ----------------------------------- | ---------------------------------------- |
| MRR        | $0 (pre-launch)                     | Part 6 §6.14 expected ~$13,200 (modeled) |
| Gross LTV  | Modeled ~$2,640 (Part 7 §7.10)      | Cohort-calculated                        |
| CAC        | Modeled near-$0 (Part 7 §7.11)      | Measured blended                         |
| Break-even | Modeled ~11.2 months (Part 6 §6.13) | Actual                                   |
| Churn      | Modeled 4% (Part 7 §7.10)           | Measured                                 |

Presenting today's modeled LTV:CAC as **proven** would misrepresent the stage. Presenting Part 6/7
inputs as **explicit, challengeable assumptions** is the correct disclosure standard for this document.

---

## 12.12 Key Performance Indicators — Financial _(targets to adopt at launch)_

Aligned with Part 10 §10.9 and Part 1 §1.15. All are **targets** until a live cohort exists.

| KPI                          | Year 1 target                     | Year 2 target       | Year 3 target        |
| ---------------------------- | --------------------------------- | ------------------- | -------------------- |
| MRR                          | ~$6,400 (M12 base)                | ~$20,100 (M24 base) | ~$34,800 (M36 base)  |
| ARR run-rate                 | ~$77k                             | ~$242k              | ~$418k               |
| Paying tenants (blended)     | ~58 (M12)                         | ~175 (M24)          | ~290 (M36)           |
| Blended ARPU                 | ~$110                             | ~$115               | ~$120                |
| Monthly gross churn          | ≤4% (modeled)                     | ≤3.5%               | ≤3.2%                |
| Net burn / operating surplus | Break-even ~M11                   | Operating surplus   | Reinvestment surplus |
| CAC (cash, blended)          | Log founder hours                 | ~$30–$55            | ~$80–$120            |
| LTV (gross)                  | Hold ~$2,640 until cohort rebuild | Rebuild from data   | Rebuild from data    |
| LTV:CAC                      | Track; do not market pre-launch   | >20× gross target   | >15× gross target    |
| Cash balance                 | Survive ~$31k–$65k trough         | Neutral to positive | Positive             |

---

## 12.13 Reconciliation with Strategic Objectives

| Part 1 §1.6 horizon | Financial milestone (base case)                            | Dependency                                       |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| 0–6 months          | Commercial launch; first paying tenants; MRR > $0          | Live billing (manual or gateway — Part 10 §10.1) |
| 6–12 months         | Approach break-even (~$6,050 MRR, ~55 tenants)             | Part 6 §6.13 inputs hold                         |
| 12–18 months        | ~120 tenants; ~$13,200 MRR; real LTV/CAC data              | Part 6 §6.14 expected case                       |
| 18–24 months        | Operating surplus; GCC prep costs in budget                | Part 14 (not written)                            |
| 24–36 months        | ~$418k ARR run-rate; optional raise decision with evidence | Part 9 marketing; Part 13 macro                  |

---

### Sources & assumptions used in this part

- **Break-even model, sensitivity, capital range, 18-month ROI scenarios:** Part 6 §6.4, §6.9,
  §6.12–§6.14 — **carried forward, not re-derived.**
- **Pricing, ARPU, churn, LTV, CAC, referral mechanics:** Part 7 §7.2, §7.9–§7.11 — **carried
  forward, not re-derived.**
- **Sales motion, billing-gateway status, funnel, segmentation, KPIs:** Part 10 §10.1, §10.4,
  §10.7, §10.9.
- **Strategic objectives and success-metric targets:** Part 1 §1.6, §1.12, §1.15.
- **Lebanon macro / payment-collection risk:** Part 13 §13.3–§13.4.
- **Product and billing dependencies:** Part 11 §11.1 (payment gateway stub; manual gateway).
- **Year 2–3 extension assumptions** (gross adds post-M12, hiring step-ups, marketing placeholders,
  M24/M36 tenant and MRR targets): **explicitly labeled modeled targets in §12.5–§12.6**, not
  sourced from measured data — no paying cohort exists at time of writing.
- **Part 9 (Marketing Plan):** does not exist; marketing lines are placeholders pending Part 9.

**This 3-year model should be rebuilt from actuals once the company has 3–6 months of post-launch
billing data; every financial figure before that point is a planning construct.**

**Open items for founder review:**

1. Confirm the M12→M18 bridge (~58 to ~120 tenants) is achievable given actual founder bandwidth and
   the supplier import motion (Part 10 §10.4) — or revise Year 1–2 targets downward.
2. Confirm or challenge the **$5,800/month Year 1 fixed-cost base** (Part 6 §6.4.1) and the **§12.8
   hiring step-ups** — particularly whether a commercial hire at M13 is affordable on projected surplus.
3. Replace Part 9 marketing **placeholders** ($500/mo M19+, $1,500/mo M25+) when the Marketing Plan
   is written; re-run burn and CAC sections entirely.
4. Decide whether **founder time** should be imputed as a salary equivalent in the P&L for honest
   "full economic cost" reporting to advisors.
5. Confirm whether the **manual-gateway-first** billing path (Part 10 §10.1) delays cash collection
   enough to require the **$65k upper-bound** capital envelope rather than the **~$31k ramp-adjusted**
   figure (Part 6 §6.9).
6. Stress-test the base case against **Lebanon macro scenarios** (Part 13 §13.3) — specifically whether
   USD collection failure should be modeled as a separate churn uplift, not captured in the 4% base.
7. Set an explicit **decision gate at M18**: bootstrap through Year 3 vs. pursue seed with measured
   unit economics — using Part 6 §6.14 expected case as the minimum evidence bar.
8. Reconcile this model with **Part 15 (Implementation Roadmap)** once written — Month 1–36 financial
   milestones should align with operational deliverables (payment gateway, Platinum gap, GCC prep).
