# Part 15 — Implementation Roadmap (Months 1–36)

**Document status:** Draft, part 15 of 16. This part integrates execution sequencing from
[Part 1](./01_executive_summary_and_foundations.md) (§1.6 objectives, §1.15 success metrics),
[Part 6](./06_feasibility_study.md) (§6.5–§6.8 operational and organizational feasibility,
§6.13 break-even, §6.14 ROI scenarios), [Part 7](./07_business_strategy.md) (pricing, retention,
LTV/CAC model), [Part 9](./09_marketing_plan.md) (Year 1 month-by-month plan),
[Part 10](./10_sales_strategy.md) (sales motion, funnel, two-sided sequencing),
[Part 11](./11_product_strategy.md) (product roadmap 0–36 months),
[Part 12](./12_financials.md) (three-year financial model and cost evolution), and
[Part 14](./14_expansion_strategy.md) (Lebanon → Jordan → GCC → Europe sequence). See
[README.md](./README.md) for document scope.

**Standing disclosure:** Supplify is **pre-launch** (product built and internally tested;
**zero live paying tenants**) and **bootstrapped** (no institutional capital raised, not
currently running a raise). Every milestone, tenant count, and financial figure in this
roadmap is an **explicitly labeled target or model output**, not an achieved result. This
document describes what the company should execute _if_ prior parts' assumptions hold — it
does not claim traction that does not exist.

---

## 15.1 Purpose and Governing Logic

A sixteen-part strategy is only as useful as its translation into sequenced action. Parts 1–14
establish _what_ Supplify is building toward and _why_; this part answers _when_, _in what
order_, and _under what gates_ the work should happen across product engineering, go-to-market,
organization, and geographic expansion over a thirty-six-month horizon.

Three principles govern every row in the roadmap below:

**1. Evidence before scale.** Part 1's central thesis — launch in Lebanon, prove subscription
unit economics with real paying tenants on both marketplace sides, then use that evidence for
institutional capital and GCC entry — is the spine of this timeline. No phase transition should
be treated as earned without the gates defined in Part 14 §14.2 and §14.3.5.

**2. Bottleneck-aware sequencing.** Part 6 identifies two binding constraints that precede
financial break-even: operational support load at roughly **20–30 concurrent active tenants**
(§6.5) and founder calendar saturation on sales throughput (§6.6, §6.8). The roadmap sequences
support capacity, billing automation, and the first commercial hire _ahead of or in parallel with_
revenue acceleration — not after it.

**3. No fabricated organization.** Part 6 §6.8 states the **order** in which the next roles are
needed; it deliberately does not model current team composition or invent a headcount. This part
follows that constraint: it names role _types_ and _triggers_, not an org chart with FTE
numbers. Cost envelopes from Part 12 §12.8 are referenced as **modeled dollar step-ups**, not
as commitments to hire specific quantities of people.

---

## 15.2 Pre-Launch Baseline (Month 0)

Before Month 1 (commercial launch), the following conditions are verified facts or disclosed
gaps — not roadmap items:

| Dimension    | Current state                                                                                                                                                                                                                                                    | Implication for Month 1                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Product      | 186 migrations, 554 API routes, 225+ backend / 100+ frontend tests; full RBAC, tier enforcement, GPS logistics, chat, reservations; **July 2026:** Platinum smart lists, notification webhooks, custom domains, WhatsApp integration code (Part 1 §1.2, Part 11) | GTM can lead with depth, not a prototype narrative                   |
| Revenue      | Zero paying tenants; stub billing gateway in production code (Part 11 §11.1)                                                                                                                                                                                     | First closes require manual/offline payment path (Part 10 §10.1)     |
| Sales        | Founder-led only; no CRM; enterprise checklist exists but untested (Part 10 §10.1, §10.7)                                                                                                                                                                        | Pipeline fits a spreadsheet; motion is run, not built                |
| Marketing    | Collateral in internal docs; no live marketing site or Year 1 spend committed (Part 9 §9.1)                                                                                                                                                                      | Month 1 begins foundation work per Part 9 §9.8 Phase A               |
| Organization | Support cost line already modeled in Part 6 §6.4.1 base; no commercial hire                                                                                                                                                                                      | Support capacity is a budgeted assumption, not yet a named person    |
| Expansion    | Single-region Railway deployment; no Jordan/GCC/EU sales motion (Part 14 §14.2)                                                                                                                                                                                  | Geography is Lebanon-only through at least Month 12 in the base case |

**Month 0 exit criterion:** founder confirms commercial launch date; engineering confirms
payment-gateway integration sprint is resourced; manual billing disclosure is approved for all
external pricing touchpoints (Part 9 §9.6, Part 10 §10.1).

---

## 15.3 Integrated Workstream Architecture

Execution over thirty-six months runs across four interdependent workstreams. None can be
optimized in isolation without creating debt in another.

| Workstream                   | Primary owner (base case)                                                                    | Governing parts     | Binding constraint                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| **Product & engineering**    | Founding engineering capacity (Part 12 models core engineering as dominant pre-revenue cost) | Part 11 §11.1       | Live payment gateway blocks all real revenue (Part 11 Now)              |
| **Sales & customer success** | Founder → first commercial hire (trigger: calendar saturation, Part 6 §6.8)                  | Part 10             | Two-sided cold start; manual billing on first cohort (Part 10 §10.4)    |
| **Marketing & demand**       | Founder (Year 1); modest cash budget Part 9 §9.4.2                                           | Part 9              | $4,800 Year 1 cash cap; supplier-first sequencing Months 1–6            |
| **Expansion & compliance**   | Founder + engineering (no dedicated expansion team pre-launch, Part 14)                      | Part 14 §14.7–§14.8 | Regulatory/data-residency gates before GCC (Part 6 §6.7, Part 11 §11.5) |

The sections below map these workstreams month-by-month, then consolidate hiring and decision
gates.

---

## 15.4 Year 1 — Launch, Proof, and Break-Even (Months 1–12)

Year 1 has one strategic job: convert a built product into **measurable commercial evidence**
in Lebanon — first paying tenants on both sides, instrumented funnel data, and a path to
break-even — without outspending bootstrapped runway (Part 6 §6.9 models **~$31k–$65k** cumulative
capital need to break-even).

### 15.4.1 Q1 (Months 1–3): Commercial ignition

**Strategic intent:** Ship revenue collection capability, publish minimum market presence,
and activate the supplier-as-channel loop before broad restaurant outreach (Part 9 §9.2,
Part 10 §10.4).

| Workstream       | Milestones                                                                                                                                                                                                                                                        | Gate / dependency                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Product**      | Live payment gateway (Stripe and/or Lebanon/MENA-capable processor — Part 11 §11.1 **M** effort); automate branch/warehouse add-on billing (**S–M**, Part 7 §7.7); begin **developer API** catalog-only closure (largest remaining Platinum item — Part 11 §11.6) | Gateway is Part 1 §1.6 0–6 month objective; smart lists/webhooks/domains/WhatsApp code already shipped July 2026 |
| **Sales**        | Founder-led anchor-supplier outreach (Part 10 §10.2 priority: mid-market distributors with importable customer books); first founder-led demos using existing scripts; manual invoicing closes for first paying restaurant **and** supplier (Part 10 §10.1)       | Two-sided minimum: one paid tenant per side validates marketplace thesis                                         |
| **Marketing**    | M1: GA4/UTM live, supplier one-pager (D2); M2: English marketing site + pricing (D1); M3: demo video + restaurant one-pager (D3) — Part 9 §9.8 Phases A–B                                                                                                         | Pricing copy must disclose manual billing until processor live (Part 9 §9.6)                                     |
| **Organization** | Support/CS capacity per Part 6 §6.4.1 cost base; founder logs hours per prospect from first conversation (Part 10 §10.9)                                                                                                                                          | Support hire trigger (~20–30 concurrent tenants) likely not yet reached                                          |
| **Expansion**    | None — Lebanon only                                                                                                                                                                                                                                               | —                                                                                                                |

**Q1 decision gate:** If zero suppliers are importing customers by end of Month 3, pause
restaurant outreach and reassess ICP per Part 9 §9.10.

### 15.4.2 Q2 (Months 4–6): Supplier loop and baseline establishment

**Strategic intent:** Land anchor suppliers, establish mid-year KPI baselines, and close the
highest-risk product-trust gaps before Platinum sales accelerate.

| Workstream       | Milestones                                                                                                                                                                                                                                                                                                                 | Gate / dependency                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Product**      | Continue **remaining** catalog-only Platinum closure (developer API, advanced reports, central purchasing — Part 1 §1.6); WhatsApp **production enablement** (Meta credentials + `WHATSAPP_ENABLED` per env — Part 11 §11.3); resolve Free Trial / Gold parity positioning (product + engineering decision, Part 11 §11.1) | Smart quick lists enforceable in marketing (Part 9 §9.6); verify `AI_ENABLED` before LLM reorder claims |
| **Sales**        | ≥3 anchor suppliers onboarded with active CSV import (Part 9 §9.3 target); 15–20 prospect conversations completed (Part 9 §9.12); first supplier-led referral conversion to paid logged (Part 7 §7.9)                                                                                                                      | Referral loop is hypothesis until first paid conversion                                                 |
| **Marketing**    | M4: Arabic keyword research; M5: bilingual Lebanon landing page (pending UI audit); M6: mid-year KPI review — Part 9 §9.8                                                                                                                                                                                                  | D4 gated on Arabic UI audit (Part 9 §9.10)                                                              |
| **Organization** | Monitor concurrent tenant count vs. ~20–30 support threshold (Part 6 §6.5); billing/RevOps gap closed via **engineering automation**, not new headcount (Part 6 §6.8 item 3)                                                                                                                                               | Add-on automation reduces manual admin load before tenant growth                                        |
| **Expansion**    | None                                                                                                                                                                                                                                                                                                                       | —                                                                                                       |

**Q2 decision gate (Month 6):** Baseline established for trial signups, block→upgrade funnel,
supplier import depth, founder hours/tenant. Revise H2 plan only from data, not assumptions
(Part 9 §9.7.2).

### 15.4.3 Q3 (Months 7–9): Consideration scale and PQL optimization

**Strategic intent:** Double down on channels showing attribution signal; prepare for first
customer-proof content without fabricating case studies.

| Workstream       | Milestones                                                                                                                                                                                            | Gate / dependency                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Product**      | Material progress on Platinum enforcement (Part 1 §1.15: zero Platinum features sold without backend enforcement by Month 12); Redis-backed rate limiting before any horizontal scale (Part 11 §11.4) | Enterprise/GCC conversations deferred until Gold reference exists (Part 7 §7.4) |
| **Sales**        | Founder outreach to multi-supplier independents and small groups (Part 10 §10.2); PQL follow-up when trial tenants hit ≥3 blocks in 7 days (Part 10 §10.3 stage 4)                                    | No SDR function — founder handles all high-touch                                |
| **Marketing**    | M7–M8: feature pages, SEO baseline; M9: second local event or roundtable — Part 9 §9.8 Phase C                                                                                                        | Year 1 cash spend remains within **$4,800** cumulative envelope                 |
| **Organization** | If concurrent tenants approach 20–30, activate support/CS hire per Part 6 §6.8 (already budgeted in Part 6 §6.4.1)                                                                                    | Operational bottleneck precedes financial break-even                            |
| **Expansion**    | Begin Jordan desk research only if Lebanon cohort shows early retention signal (Part 14 §14.4 — not before Month 12 in base case)                                                                     | Jordan market size is a research gap (Part 3 §3.1.3)                            |

### 15.4.4 Q4 (Months 10–12): Break-even zone and Year 1 close

**Strategic intent:** Cross modeled break-even (~55 blended paying tenants, Part 6 §6.13),
achieve Gold-as-modal plan mix (Part 1 §1.15), and produce inputs for Part 12's real CAC/LTV
rebuild.

| Workstream       | Milestones                                                                                                                                                                                                               | Modeled outcome _(Part 12 §12.4–§12.5)_                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Product**      | Payment gateway stable; **remaining** catalog-only gap substantially closed (developer API, advanced reports, central purchasing); `AI_ENABLED` operational toggle verified before LLM reorder marketing (Part 11 §11.2) | Feature-catalog integrity target (Part 1 §1.15)                        |
| **Sales**        | Cumulative paying tenants directionally consistent with Part 1 §1.15 "tens" on both sides; trial→paid baseline measured                                                                                                  | **~58 paying tenants**, **~$6,380 MRR** at M12 (Part 12 base case)     |
| **Marketing**    | M10–M12: proof-adjacent content (consent-only customer stories); Year 1 retrospective; Year 2 channel recommendation — Part 9 §9.8 Phase D                                                                               | Paid search remains deferred (Part 9 §9.10)                            |
| **Organization** | Assess founder calendar saturation for first **commercial/sales** hire trigger (Part 6 §6.8 item 1 — calendar, not tenant count)                                                                                         | Commercial hire may begin as partial capacity in M13 (Part 12 §12.5.2) |
| **Expansion**    | Lebanon Phase 1 exit criteria assessment toward Jordan gate (≥20 paying tenants, ≥3 months billing, referral proof, live gateway — Part 14 §14.3.5)                                                                      | Gate may not fully clear at M12 — delays Jordan, not cancel            |

**Year 1 financial envelope (modeled):** fixed cost **~$5,800/month** (Part 6 §6.4.1); break-even
at **~Month 11** under base-case accumulation (Part 6 §6.13); cumulative pre-break-even cash
need **~$31k–$65k** (Part 6 §6.9).

---

## 15.5 Year 2 — Cohort Scale, First Hire, and Bridge Markets (Months 13–24)

Year 2 shifts from _proving the model_ to _scaling within Lebanon while rehearsing cross-border
operations_. Part 12 models **~120 paying tenants and ~$13,200 MRR at Month 18** (Part 6
§6.14 expected case) and **~175 tenants / ~$20,125 MRR at Month 24**.

### 15.5.1 H1 Year 2 (Months 13–18): Post-break-even operating surplus

**Strategic intent:** Reinvest surplus into constrained capacity expansion; close the gap between
modeled and measured unit economics (Part 1 §1.6 12–18 month objective).

| Workstream       | Milestones                                                                                                                                                                                                                                                                 | Notes                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Product**      | Multi-currency conversion service (Part 11 §11.1 Next); data-residency planning + regional deployment pilot; enterprise security hardening (Part 11 §11.4); WhatsApp live sends in production workflows (credentials + ops enablement)                                     | GCC readiness work begins **before** GCC sales (Part 11 sequencing)                       |
| **Sales**        | First dedicated **commercial/sales** capacity when founder calendar is saturated — modeled as partial from M13, scaling toward full by M19–24 (Part 12 §12.5.2, §12.8); supplier referral channel matures (70% referral / 30% direct by M24 — Part 12 §12.9.2 **modeled**) | Lightweight CRM/tooling step-up ~$500/month (Part 12 §12.5.2)                             |
| **Marketing**    | Year 2 preview: modest Google Ads pilot **only if** Part 9 §9.10 criteria met (≥10 paying tenants, conversion baseline, live processor, keyword research); G2/Capterra prep                                                                                                | Marketing cash placeholder **~$500/month** from M19 (Part 12 §12.8)                       |
| **Organization** | Support/CS at full modeled step-up if tenant load requires (Part 12 §12.8: support line rises M19–24); **billing automation** maintained as engineering, not headcount (Part 6 §6.8)                                                                                       | Fixed cost rises to **~$6,900/month** (M13–18), then **~$9,750** (M19–24) — Part 12 §12.8 |
| **Expansion**    | M12–18: Jordan sizing research, soft supplier anchors, regulatory counsel memos (Part 14 §14.4, §14.8.1); Lebanon remains primary revenue geography                                                                                                                        | Jordan entry is bridge, not scale play                                                    |

**M18 decision gate:** Part 14 Lebanon→Jordan gate — ≥20 paying tenants with ≥3 months billing,
documented churn/payment-failure reasons, ≥1 supplier referral conversion, live payment gateway
(Part 14 §14.3.5). Failure delays **GCC**, not necessarily Jordan soft entry.

### 15.5.2 H2 Year 2 (Months 19–24): Jordan active, GCC preparation

**Strategic intent:** Execute Part 14's Jordan bridge (Months 15–24 active window); build GCC
compliance prerequisites without opening full UAE/KSA sales until product gates clear.

| Workstream       | Milestones                                                                                                                                                                                                                          | Notes                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Product**      | GCC-capable payment integration; e-invoicing discovery for UAE/KSA (Part 6 §6.7); first **infrastructure/DevOps-oriented hire or fractional contractor** ahead of GCC entry (Part 6 §6.8 item 4; Part 12 §12.8 engineering step-up) | Multi-region is market-entry prerequisite, not pre-emptive scale (Part 6 §6.10) |
| **Sales**        | Jordan: founder-led direct, target **5–10 tenants** (Part 14 §14.8.1 — **target**); Lebanon continued growth; defer Enterprise track until Gold/Platinum reference matures (Part 7 §7.4)                                            | Partner/reseller motion **not assumed** (Part 14 §14.2)                         |
| **Marketing**    | GCC research-only content; no GCC paid campaigns until compliance path defined (Part 9 §9.11); review-platform solicitation if ≥5 satisfied tenants (Part 9 §9.10)                                                                  |                                                                                 |
| **Organization** | Commercial capacity at full modeled step-up (Part 12 §12.8); infra/compliance owner before GCC sales conversations                                                                                                                  | No additional role types beyond Part 6 §6.8 sequence                            |
| **Expansion**    | M18–24: **UAE pilot preparation** — ZATCA/UAE e-invoicing path scoped (Part 14 §14.5); contingency path documented if Lebanon macro forces accelerated diversification (Part 14 §14.8.2, Part 13 §13.3)                             | GCC entry **18–24 months** per Part 1 §1.6                                      |

**Year 2 financial envelope (modeled):** average MRR **~$16,700**; operating margin **~$30–40k**
positive before founder comp (Part 12 §12.6.3); reinvestment capacity for GCC prep without
institutional round in base case — but **seed funding likely required if GCC timeline compresses**
(Part 14 §14.7).

---

## 15.6 Year 3 — GCC Entry, Category Expansion, Europe Optionality (Months 25–36)

Year 3 executes Part 1's **18–24 month GCC objective** (extended into Months 25–30 if gates
slip) and **24–36 month category-expansion objective**, while initiating European optionality
without parallel multi-market burn (Part 14 §14.6, §14.9).

Part 12 base case at **Month 36: ~290 paying tenants, ~$34,800 MRR, ~$417,600 ARR run-rate**
— explicitly **below** Lebanon-only theoretical saturation (~4,000–4,500 establishments, Part 1
§1.7), implying geographic diversification is structurally necessary for long-term growth, not
optional.

### 15.6.1 H1 Year 3 (Months 25–30): GCC pilot and compliance execution

| Workstream       | Milestones                                                                                                                                                                                                            | Notes                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Product**      | UAE/KSA e-invoicing compliance build; regional API/Postgres deployment; invoice OCR / AI ingestion competitive parity vs. Supy (Part 14 §14.7 table); category-expansion catalog tooling begins (Part 11 §11.1 Later) | API v1 read-only + webhooks should ship before chain IT evaluations (Part 11 §11.6)     |
| **Sales**        | UAE pilot: first GCC paying tenants under founder-led or early commercial-assisted motion; evaluate partner/reseller if CAC fails in Dubai (Part 14 §14.8.3)                                                          | Displacement sales vs. Supy/Kaso/Foodics — harder than Lebanon greenfield (Part 3 §3.8) |
| **Marketing**    | Paid experiment placeholder: **~$150–250 modeled CAC** for 30% of new adds (Part 12 §12.9.3 — **assumption only**); bilingual collateral extended to GCC contexts                                                     | Budget **~$500–1,500/month** marketing line (Part 12 §12.8)                             |
| **Organization** | Infra/DevOps capacity sustained; commercial team absorbs GCC pipeline without inventing a regional sales org                                                                                                          | Fixed cost **~$11,000–$12,660/month** by M36 (Part 12 §12.8)                            |
| **Expansion**    | GCC scale begins: KSA + smaller GCC states after UAE pilot gate (Part 14 §14.8.1); pricing test-and-adjust per Part 7 §7.8 (USD ladder vs. GCC repricing — **open**)                                                  |                                                                                         |

### 15.6.2 H2 Year 3 (Months 31–36): Scale GCC, expand categories, Europe desk research

| Workstream       | Milestones                                                                                                                                                                                         | Notes                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Product**      | Packaging, cleaning, equipment supplier catalog fields (Part 1 §1.6 24–36 month); central purchasing depth (Part 11 §11.8 bet #3); mobile parity for driver/dispatch GCC use cases (Part 11 §11.1) | Category expansion is GTM + catalog exercise, not re-architecture (Part 1 §1.6) |
| **Sales**        | Target **50+ cumulative tenants** across Lebanon + Jordan + GCC (Part 14 §14.8.1 — **target**); packaging/cleaning/equipment suppliers as secondary GTM (Part 1 §1.6)                              |                                                                                 |
| **Marketing**    | Europe: desk research + GDPR counsel; **zero paid marketing** until one EU pilot tenant via network (Part 14 §14.6.3)                                                                              | Diaspora beachhead thesis (Germany, France, UK cities)                          |
| **Organization** | SOC 2 Type I readiness **only if** enterprise/GCC procurement requires it (Part 11 §11.4 — not marketed until true)                                                                                |                                                                                 |
| **Expansion**    | M30–36: EU pilot preparation — GDPR DPA mapping, EU-region deployment (Part 14 §14.6); **36+ mo** formal Europe pilot (Part 14 §14.8.1)                                                            |                                                                                 |

**Year 3 financial envelope (modeled):** average MRR **~$29,000**; operating margin **~$80–100k**
before founder comp (Part 12 §12.6.3); sufficient for optional reinvestment in Part 7 §7.7 items
(add-on automation, payment facilitation evaluation) — **insufficient for rapid multi-market team
scaling without raise**.

---

## 15.7 Organizational Roadmap — Hiring Sequence (Part 6 §6.8)

Part 6 §6.8 defines four next-capacity items in strict priority order. This section maps them
to the thirty-six-month timeline without inventing team size.

| Priority | Capacity item                                           | Trigger                                                                           | Modeled timing _(Part 12 §12.8)_                                                 | Workstream impact                                                             |
| -------: | ------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
|    **1** | Dedicated **commercial/sales** hire                     | Founder calendar saturation — **not** a tenant-count trigger (Part 6 §6.8)        | Partial capacity **M13+** (~$600/month); full step-up **M19–24** (~$2,400/month) | Unlocks sales throughput post-break-even; referral loop still primary channel |
|    **2** | Dedicated **support/customer-success** hire             | At or before **~20–30 concurrent active tenants** (Part 6 §6.5)                   | Already in **M1–12** base (~$900/month); step-up **M19+** (~$1,800/month)        | Prevents support bottleneck before break-even                                 |
|    **3** | **Billing/RevOps automation**                           | Add-on volume growth; manual provisioning tax (Part 6 §6.5, Part 7 §7.7)          | Engineering deliverable **M1–6**, not headcount (Part 6 §6.8 item 3)             | Reduces admin load; improves revenue recognition                              |
|    **4** | **Infrastructure/DevOps** hire or fractional contractor | Ahead of GCC/EU market entry; multi-region transition (Part 6 §6.8 item 4, §6.10) | Modeled engineering step-up **M25+** (+$900/month, Part 12 §12.8)                | Enables data residency, e-invoicing ops, horizontal scale                     |

**Explicit non-actions (Part 14 §14.9, Part 10 §10.1):**

- No SDR/BDR function modeled in Years 1–2.
- No dedicated expansion team until GCC pilot produces evidence.
- No Enterprise sales org until Gold/Platinum self-serve reference exists (Part 7 §7.4).
- No headcount figures stated beyond Part 12's **modeled cost lines** — current founder
  composition remains commercially sensitive (Part 1 §1.2).

---

## 15.8 Cross-Functional Dependency Map

The following dependencies are the highest-leverage coordination points across the thirty-six
months. Slippage on any "blocking" item delays downstream milestones.

```
Month 0–3:  [Live payment gateway] ──blocks──▶ [First self-serve paid conversion]
                    │
                    └──enables──▶ [Lebanon Phase 1 exit criterion #4, Part 14 §14.3.5]

Month 1–6:  [Anchor suppliers + CSV import] ──feeds──▶ [Restaurant trial pipeline]
                    │
                    └──validates──▶ [Two-sided marketplace thesis, Part 10 §10.4]

Month 4–12: [Remaining Platinum closure: developer API, reports, central purchasing] ──blocks──▶ [Platinum IT/Enterprise sales]
                    │
                    └──note──▶ [Smart lists, notification webhooks, domains, WhatsApp code shipped July 2026]

Month 12–18: [≥20 paying tenants + retention data] ──gates──▶ [Jordan active sales]
                    │
                    └──feeds──▶ [LTV/CAC rebuild, Part 7 §7.10]

Month 18–24: [E-invoicing + multi-region infra] ──gates──▶ [UAE/KSA pilot sales]
                    │
                    └──requires──▶ [Infra/DevOps capacity, Part 6 §6.8 #4]

Month 24–36: [GCC pilot evidence] ──gates──▶ [KSA + multi-GCC scale]
                    │
                    └──parallel──▶ [Category expansion GTM, Part 1 §1.6]

Month 30–36: [EU-region deployment + GDPR DPA] ──gates──▶ [Europe pilot tenant]
```

---

## 15.9 Decision Gates, Contingencies, and Anti-Priorities

### 15.9.1 Hard gates (do not skip)

| Gate                     | Criteria                                             | Source                       | If failed                                             |
| ------------------------ | ---------------------------------------------------- | ---------------------------- | ----------------------------------------------------- |
| **Commercial launch**    | Manual billing disclosure + gateway sprint resourced | Part 10 §10.1, Part 11 §11.1 | Delay paid conversion promises                        |
| **Platinum sale**        | Backend enforcement for sold features                | Part 1 §1.15, Part 13 §13.1  | Contractual disclosure or defer sale                  |
| **Jordan entry**         | Lebanon Phase 1 exit criteria                        | Part 14 §14.3.5              | Extend Lebanon-only; delay GCC                        |
| **GCC pilot**            | E-invoicing path + regional deploy + payment parity  | Part 14 §14.7                | Do not sell into UAE/KSA regardless of macro pressure |
| **Paid marketing scale** | ≥10 tenants, conversion baseline, live processor     | Part 9 §9.10                 | Remain founder-led / referral-only                    |
| **Europe pilot**         | EU region live + GDPR counsel                        | Part 14 §14.6.3              | Research only                                         |

### 15.9.2 Contingency paths (Part 14 §14.8)

**Accelerated Jordan/GCC (Lebanon shock):** If Part 13 §13.3 conditions materially worsen,
pause Lebanon new-logo acquisition, retain existing tenants, accelerate Jordan desk research
and remote GCC outreach — but **do not skip product/compliance gates** (Part 14 §14.8.2).

**Delayed GCC (Lebanon succeeds, funding absent):** Extend Lebanon+Jordan combined pod; pursue
partner-led GCC entry; consider Qatar/Kuwait before UAE if Dubai CAC fails (Part 14 §14.8.3).

### 15.9.3 Anti-priorities (explicit deferrals)

Consistent with Part 14 §14.9 and Part 7 §7.5:

1. Simultaneous multi-market launch.
2. GMV/take-rate monetization before subscription proof.
3. Open ad marketplace / pay-to-rank search.
4. POS-competitive positioning globally.
5. Egypt or wider non-GCC MENA before GCC sequence completes.
6. Fabricated customer logos, ROI-hour statistics, or traction claims.

---

## 15.10 Consolidated Milestone Summary (Months 1–36)

The table below is the executive view. All tenant and revenue figures are **Part 12 base-case
model outputs**, not achievements.

| Period     | Product (top priorities)                         | Sales & CS                                                 | Marketing                                 | Organization                                         | Expansion               | Modeled tenants / MRR _(Part 12)_ |
| ---------- | ------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- | ----------------------- | --------------------------------- |
| **M1–3**   | Live gateway; add-on billing automation          | First paid restaurant + supplier; anchor supplier outreach | Site live; supplier one-pager; demo video | Support in base cost                                 | Lebanon only            | Ramp from 0                       |
| **M4–6**   | WhatsApp prod enablement; developer API gap work | ≥3 anchor suppliers; 15–20 conversations                   | Bilingual landing page; M6 review         | Billing automation (eng)                             | —                       | ~33 / ~$3,630 (M6)                |
| **M7–12**  | Remaining Platinum enforcement; rate limiting    | PQL follow-up; Gold modal mix                              | Events; SEO; Year 1 close                 | Monitor support threshold; assess commercial trigger | Lebanon gate assessment | ~58 / ~$6,380 (M12)               |
| **M13–18** | Multi-currency; data-residency plan              | Partial commercial hire; referral matures                  | Year 2 pilot criteria evaluation          | Fixed cost ~$6,900/mo                                | Jordan research         | ~120 / ~$13,200 (M18)             |
| **M19–24** | GCC payments; e-invoicing scope                  | Jordan 5–10 tenants; full commercial step-up               | Modest paid pilot if gated                | Infra contractor; ~$9,750/mo                         | Jordan active; UAE prep | ~175 / ~$20,125 (M24)             |
| **M25–30** | Regional deploy; category catalog                | UAE pilot tenants                                          | GCC content; paid experiments             | ~$11k+/mo fixed                                      | GCC pilot               | ~230 / ~$27,140 (M30)             |
| **M31–36** | Central purchasing; mobile parity                | 50+ cumulative multi-geo; category GTM                     | EU desk research only                     | ~$12,660/mo fixed                                    | GCC scale; EU prep      | ~290 / ~$34,800 (M36)             |

---

## 15.11 Strategic Recommendations

1. **Treat Month 1–3 as a revenue-engineering sprint**, not a marketing sprint — the live
   payment gateway (Part 11 §11.1) and add-on billing automation (Part 7 §7.7) unblock
   everything else in this roadmap.
2. **Run supplier-first through Month 6** across sales and marketing simultaneously (Part 9
   §9.12, Part 10 §10.4) — it is the only shipped zero-cash scale mechanism.
3. **Budget support before break-even**, not after (Part 6 §6.5) — the operational bottleneck
   precedes the financial one by roughly 25–35 tenants in the model.
4. **Trigger the commercial hire on calendar saturation**, not on hitting a tenant milestone
   (Part 6 §6.8) — tenant growth can lag while founder time is fully committed.
5. **Do not open GCC sales until compliance and infra gates clear** (Part 14 §14.7) — macro
   pressure from Lebanon (Part 13 §13.3) is not a substitute for e-invoicing and data residency.
6. **Re-run this roadmap at Month 6, Month 12, and Month 18** with actual billing data —
   Part 6 §6.15 and Part 11 §11.7 explicitly require re-scoping against real sprint velocity
   and cohort retention.
7. **Preserve bootstrap discipline through break-even** — the ~$31k–$65k capital envelope
   (Part 6 §6.9) is small enough that hiring or marketing ahead of surplus destroys runway;
   the Part 12 cost step-ups are sequenced to post-break-even surplus for this reason.

---

### Sources & Assumptions Used in This Part

**Verified facts (not re-derived):**

- Company stage, product inventory, disclosed gaps: Part 1 §1.2, §1.6, §1.15.
- Break-even formula, support bottleneck threshold, hiring sequence: Part 6 §6.4–§6.8,
  §6.13–§6.14.
- Pricing, retention mechanics, LTV/CAC model inputs: Part 7 §7.2, §7.9–§7.11.
- Year 1 marketing calendar, budget ($4,800), channel ranking: Part 9 §9.4–§9.8.
- Sales motion, funnel stages, two-sided sequencing, manual billing: Part 10 §10.1–§10.4,
  §10.9.
- Product roadmap horizons (Now / Next / Later): Part 11 §11.1.
- Three-year tenant/MRR trajectory, cost evolution table: Part 12 §12.5–§12.8.
- Expansion sequence, phase gates, contingency paths: Part 14 §14.2–§14.8.
- Lebanon macro and competitive risk context: Part 13 §13.2–§13.3 (referenced, not duplicated).

**Assumptions explicitly labeled in this part:**

- Month 1 = commercial launch month; entire calendar shifts intact if launch slips (Part 9
  §9.8).
- All tenant counts and MRR figures are **Part 12 base-case model outputs**, not forecasts.
- Part 12's cost lines (e.g., partial commercial hire from M13, infra step-up from M25) are
  **modeled dollar amounts**, not confirmed offers or FTE counts.
- Jordan tenant target (5–10), GCC cumulative target (50+), and EU pilot timing (M30–36) are
  **Part 14 targets**, not commitments.
- Year 3 paid CAC placeholder ($150–250) and referral mix (70/30 by M24) are **Part 12
  modeling assumptions** without measured basis.
- Engineering effort labels (S/M/L) from Part 11 are **relative sizing judgments**, not
  calendar commitments (Part 11 engineering sanity check).

**Open items for founder review:**

1. Confirm commercial launch month and whether live payment gateway is a hard precondition
   before _any_ paid close, or whether manual gateway suffices for the first cohort (Part 10
   open item #1).
2. Validate Part 6 §6.12 gross acquisition assumption (g ≈ 6/month) against founder's actual
   bandwidth once Month 6 data exists.
3. Confirm or challenge Part 12 §12.8 fixed-cost step-ups — particularly commercial partial
   vs. full timing and the M25 engineering/infra increment — against accessible cash and
   real hiring market.
4. Commission Jordan market-sizing research before treating Months 15–24 Jordan targets as
   operational plans (Part 3 §3.1.3 research gap; Part 14 §14.4).
5. Resolve Part 7 §7.8 GCC pricing question (USD ladder vs. GCC repricing) before UAE pilot
   sales collateral is produced — deferred decision, not defaulted here.
6. Confirm `AI_ENABLED` operational status before any roadmap milestone includes AI-led
   marketing or sales claims (Part 11 §11.2).
7. Reconcile this roadmap against actual team composition and sprint velocity once launch
   begins — Part 6 §6.8 and Part 11 §11.7 both state that neither is known to the strategy
   document set today.

**This implementation roadmap should be treated as a living integration layer.** When any
upstream part is revised (especially Part 12 financials or Part 14 expansion gates after
real cohort data), Part 15 should be updated in the same pass — it has no independent
authority over targets defined elsewhere.
