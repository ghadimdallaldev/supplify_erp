# Part 13 — Risk Management

**Status:** Draft, part 13 of 16. Written ahead of Parts 3–5 and 14 in the assembly sequence
because economic, political, and technical risk assessment does not depend on completed
market/competitor research to be substantively correct; the competition risk subsection
(§13.2) has been cross-checked and enriched against Part 4's consolidated competitor research.
See [README.md](./README.md) for full document scope and [01_executive_summary_and_foundations.md](./01_executive_summary_and_foundations.md)
for company stage (pre-launch, bootstrapped, Lebanon-first).

This part is written in the same spirit as a due-diligence risk register: it exists to
surface real, uncomfortable risks clearly, not to reassure. Several risks below — most
notably §13.3 — are severe and outside the company's control. Presenting them plainly is
more credible to a sophisticated investor or partner than omitting them.

---

## 13.1 Technical Risk

**Assessment: Low-to-Moderate, and mostly self-inflicted rather than structural** — the
platform is genuinely built (180 migrations, 225+ API tests, 100+ web tests; see Part 1
§1.2), which retires most of the "can this team ship a working product" risk that a
pre-launch SaaS company usually carries. The real technical risks are narrower and already
disclosed in the product documentation itself:

| Risk                           | Detail                                                                                                                                                                                            | Mitigation                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog-only Platinum features | Full API/webhooks, white-label domain, AI quick lists, advanced custom reports, and central purchasing are priced and displayed but not fully backend-enforced (`docs/product/tier-matrix.md` §7) | Close before the first Platinum sale closes, or disclose the gap contractually — selling a listed feature that doesn't work is a trust and potential legal (misrepresentation) risk, not just a product debt item |
| Dependency vulnerabilities     | An internal security audit (`docs/architecture/security-baseline.md`) identified 14 `pnpm audit` issues (5 high) in axios, react-router-dom, glob, and qs at time of that audit                   | Re-run `pnpm audit` and apply upgrades before any external security review or enterprise sales conversation; treat as pre-launch hygiene, not a major program                                                     |
| Single-region infrastructure   | All environments run on a single Railway deployment per environment; no multi-region failover or data residency options exist today (Part 11 §5)                                                  | Acceptable at current (zero-tenant) scale; becomes a real constraint specifically when EU expansion requires data residency (GDPR) or when uptime SLAs are contractually promised to Enterprise customers         |
| Manual add-on billing          | Branch/warehouse add-ons are admin-provisioned, not billed automatically (Part 7 §7.2)                                                                                                            | Low risk at low tenant counts; becomes an operational and revenue-leakage risk as tenant count grows — track and automate before it does                                                                          |

## 13.2 Competitive Risk

**Assessment: Medium-High in Lebanon specifically; Medium globally** — the competitive
landscape is not a single "well-funded global SaaS" threat. Part 4's twenty-competitor
research (see [04_competitor_research.md](./04_competitor_research.md)) establishes a
sharper picture than generic category framing:

| Threat tier                                     | Competitor(s)                                               | Why it matters                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tier 1 — direct, Lebanon-relevant**           | **Supy**                                                    | Only competitor with **confirmed active Lebanon presence**; multi-branch-native, $250+/mo sales-led, LLM-based invoice AI, 3,000+ claimed restaurants, $9.5M raised (Part 4 §4.3.1). This is the incumbent Supplify will encounter in live sales conversations in Beirut — not a hypothetical future entrant.                                                                                                             |
| **Tier 2 — regional scale, different category** | Foodics, Rewaa                                              | Foodics (~$200M raised, 33,500+ branches claimed) and Rewaa ($72M, Saudi-only) dominate GCC POS/operations but **do not operate native two-sided procurement marketplaces** — Foodics outsources procurement to KASO; Rewaa is single-tenant inventory. Foodics has marginal Lebanon presence via a reseller only. Threat is **adjacent** (buyers may default to POS-first stack) not **direct** (same product category). |
| **Tier 3 — global back-office benchmarks**      | MarketMan, MarginEdge, Restaurant365, Craftable, Crunchtime | Deep recipe costing, invoice automation, or enterprise GL depth Supplify honestly lacks today. **No verified MENA/Lebanon presence** for any of them; pricing and sales motion ($199–469+/location/mo, demo-led) poorly fit Lebanon's independent-operator segment near-term.                                                                                                                                             |
| **Tier 4 — marketplace / AI narrative**         | Choco, Orderlion                                            | Choco's OpenAI voice agent and free-restaurant model set buyer expectations; Choco has no corroborated MENA presence and has pivoted toward supplier-side monetization with layoffs documented since 2022. Orderlion's AI Inbox (email/WhatsApp order parsing) is a specific feature gap for Supplify on the supply side.                                                                                                 |
| **Deprioritize**                                | ChefHero→Notch, Sourcery→Lavu, Yellow Dog                   | Marketplace abandoned, brand absorbed, or US venue niche — carry low near-term weight (Part 4 §4.9.5).                                                                                                                                                                                                                                                                                                                    |

**What Supplify's wedge actually is (Part 4 §4.9.2, tested not proven):** the only platform
in the research set combining two-sided restaurant–supplier tenancy, contract-priced
catalog, GPS-tracked fulfillment, photo-scored receiving, invoicing/disputes, and chat at
**$49–349/month with self-serve Silver/Gold signup** — plus bilingual schema and
Lebanon-first GTM. No global incumbent contests that exact bundle in Lebanon today.

**What is not a moat yet:** zero live paying tenants; Supy already has years of production
usage and named regional logos; Platinum "AI quick lists" are catalog-listed but not
backend-enforced (Part 1 §1.2) — a credibility risk if marketed against Supy's LLM claims
before launch.

**Mitigations already in strategy:** (1) compete below Supy on price/segment — $49 Silver
for independents vs. Supy's $250+ multi-branch positioning; (2) supplier-driven referral loop
(Part 7 §7.9) to offset Supy's incumbency; (3) GCC diversification (Part 14) to reduce
single-market dependence on a Supy-contested Lebanon; (4) close invoice AI / quick-lists
enforcement before enterprise or investor conversations that invite feature testing.

## 13.3 Economic & Political Risk (Lebanon) — Severe, Disclosed in Full

This is the most material risk in this document and is presented without euphemism,
because a founder or investor evaluating this company needs the real picture, not a
softened one.

- **Currency and banking crisis:** the Lebanese lira has lost approximately 98% of its
  value since the 2019 financial collapse; the currency has stabilized at roughly
  89,000 LBP/USD as of 2025 figures, down from a 1,507.5 peg pre-crisis. The banking sector
  is effectively insolvent — most deposits are frozen, dollar-denominated deposits trade at
  a discount informally known as "lollars," and sector assets fell from an estimated
  $217 billion (2019) to $104 billion (2024) (Source:
  [The Middle East Insider, "Lebanon Currency Collapse 2026"](https://themiddleeastinsider.com/2026/04/05/lebanon-currency-collapse-2026-lira-crisis-war/?lang=en);
  [Lebanese liquidity crisis, Wikipedia](https://en.wikipedia.org/wiki/Lebanese_liquidity_crisis),
  accessed 2026-07-01).
- **Active conflict:** an Israeli ground invasion beginning March 2, 2026 has added an
  estimated $11 billion in additional destruction on top of the pre-existing crisis
  (Source: same reporting above). This is a live, ongoing situation at the time of writing,
  not a historical event — its trajectory is unknown and materially affects every
  assumption in this document (customer solvency, ability to travel/sell in-market,
  physical safety of team members, payment infrastructure reliability).
- **Reform stagnation:** the IMF's proposed recovery roadmap (banking-sector restructuring,
  capital-controls legislation, central bank audit, electricity-sector reform) has not been
  implemented by Lebanon's political leadership (Source: search results synthesizing IMF
  and Middle East Institute reporting, accessed 2026-07-01) — meaning the underlying
  macroeconomic instability has no clear resolution timeline to plan around.
- **Some stabilization signal:** food insecurity has declined from a peak of 24% (late 2024) to approximately 13% (early 2026), though this remains historically high (same
  source). This is not offered as reassurance — it is included because a risk register
  that only shows deterioration is as dishonest as one that hides risk entirely.

**Direct implications for Supplify, stated plainly:**

1. **Payment collection risk.** A restaurant or supplier tenant that cannot reliably access
   USD, or whose business is disrupted by conflict, cannot reliably pay a USD-denominated
   SaaS subscription — the pricing model in Part 7 assumes payment capability that is not
   guaranteed at the macro level in this market.
2. **This is precisely why GCC diversification (Part 1 §1.6, Part 14) is not just a growth
   ambition but a concentration-risk mitigation** — a company whose only market is Lebanon
   carries undiversified exposure to a single, currently unstable economy and active
   conflict zone.
3. **No mitigation offered here removes this risk** — it is structural and outside the
   company's control. The honest mitigation is diversification speed (Part 14) and
   maintaining a lean cost structure that can survive extended local market disruption
   (Part 6, Part 12).

## 13.4 Currency Risk (Product-Level)

Independent of the macro crisis above, the product itself prices in USD (`tier-matrix.md`)
while operating in a market where the local currency is unstable. This is very likely the
correct choice (USD pricing protects Supplify's revenue value; the alternative — LBP
pricing — would expose the company directly to hyperinflation), but it pushes currency risk
onto the customer, who must source USD to pay. This is a real tension with no clean
resolution and should be monitored via early payment-failure/churn-reason data once the
company has paying customers, not solved speculatively here.

## 13.5 Cybersecurity Risk

**Assessment: Reasonable baseline, standard pre-launch hygiene gaps.** Per the internal
security assessment (`docs/architecture/security-baseline.md`): OIDC via Keycloak,
httpOnly/secure cookies, Helmet security headers, rate limiting, parameterized SQL
queries (no string-concatenation injection risk), and React's default XSS escaping are
already in place. The identified gaps at the time of that audit were dependency
vulnerabilities (axios, react-router-dom, glob, qs — see §13.1) rather than architectural
weaknesses. **Recommendation:** re-run the audit and resolve high-severity dependency
issues before any enterprise sales conversation that will include a security
questionnaire, and before pursuing GCC/EU expansion where data-protection obligations
(§13.6) raise the bar further.

## 13.6 Regulatory & Data Protection Risk

Not fully assessed in this document — flagged honestly as an open item rather than
guessed at. Lebanon, GCC states, and the EU (the three regions in the Part 1 §1.6
expansion sequence) have materially different data-protection and e-invoicing regimes
(e.g., Saudi Arabia's ZATCA e-invoicing mandates, UAE VAT invoicing rules, EU GDPR).
**This requires dedicated legal research before GCC/EU commercial launch** — it is
scoped as part of Part 14 (Expansion Strategy) rather than fabricated here without a
verified source.

## 13.7 Operational Risk

- **Founder-dependency risk:** with no sales, support, or engineering team beyond the
  founder(s) modeled in this document (Part 6/10 explicitly do not invent headcount), the
  company currently has significant key-person concentration. This is normal and expected
  at this stage, but should be tracked as a risk to resolve via the hiring sequence in
  Part 15, not ignored.
- **Support scaling risk:** once the Free Trial funnel produces real signups, support
  ticket volume is likely to be the first operational bottleneck (Part 6 §4), before sales
  capacity is.
- **Manual processes that don't scale:** admin-provisioned add-on billing (§13.1) and
  admin-approved promotions (Part 7 §7.6) are appropriate at zero-to-low tenant counts but
  will need automation or a dedicated ops hire as volume grows.

## 13.8 Hiring Risk

Not modeled with fabricated headcount or timeline figures — Part 6 (§7, Organizational
Feasibility) and Part 15 (Implementation Roadmap) own the specifics of what roles are
needed next. The risk stated here is structural: **a bootstrapped, pre-revenue company in
a market with an active conflict and currency crisis (§13.3) faces a harder hiring market
than the same company would in a stable economy** — both because of talent emigration
pressure (well-documented in the Lebanese labor market since 2019, though a specific
current emigration-rate statistic is not verified here and should not be cited without a
source) and because compensation in a hyperinflationary local currency is not viable,
pushing likely compensation structures toward USD — a real cost consideration for Part 12.

## 13.9 Risk Register Summary

| Risk                                                       | Likelihood           | Impact             | Owner section   |
| ---------------------------------------------------------- | -------------------- | ------------------ | --------------- |
| Catalog-only feature gap discovered by a paying customer   | Medium               | High (trust/legal) | §13.1, Part 11  |
| Competitive displacement by funded regional/global players | Medium-High          | High               | §13.2, Part 4/5 |
| Lebanon macroeconomic/conflict disruption                  | High (ongoing)       | Severe             | §13.3           |
| Customer payment failure due to USD access                 | Medium-High          | High               | §13.3, §13.4    |
| Dependency-based security vulnerability exploited          | Low-Medium           | Medium-High        | §13.5           |
| Regulatory non-compliance on GCC/EU expansion              | Medium (unassessed)  | High               | §13.6, Part 14  |
| Founder key-person dependency                              | High (current state) | High               | §13.7           |
| Talent acquisition difficulty in current Lebanon market    | Medium-High          | Medium             | §13.8           |

---

### Sources & assumptions used in this part

- Lebanon currency/banking/conflict data: [The Middle East Insider (2026-04-05)](https://themiddleeastinsider.com/2026/04/05/lebanon-currency-collapse-2026-lira-crisis-war/?lang=en);
  [Lebanese liquidity crisis, Wikipedia](https://en.wikipedia.org/wiki/Lebanese_liquidity_crisis);
  IMF and Middle East Institute reporting as synthesized in search results, accessed
  2026-07-01. These are current-events sources for a fast-moving, ongoing situation —
  re-verify immediately before sharing this document externally, as facts may have changed
  since 2026-07-01.
- Technical/security posture: `docs/architecture/security-baseline.md`,
  `docs/product/tier-matrix.md` §7.
- Competitive risk framing: [04_competitor_research.md](./04_competitor_research.md) (Part 4,
  consolidated 2026-07-01); §13.2 updated against Part 4 findings.
- Regulatory risk: explicitly unassessed pending Part 14 legal research — no regulation is
  cited without a verified source, per this document's standing rule.

**Open items for founder review:**

1. §13.3 is unusually severe for a strategy document — confirm you want this level of
   directness preserved for external (investor) readers, versus a version reserved for
   internal planning only. Recommendation: keep it in the master version and let a reader's
   own diligence context determine how it lands — softening a real, verifiable risk is
   worse than stating it.
2. §13.2 has been updated against Part 4 (Supy as Tier 1 Lebanon threat). Revisit if Supy
   pricing or Lebanon GTM changes materially.
