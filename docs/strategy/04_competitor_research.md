# Part 4 — Competitor Research

**Status:** Draft, part 4 of 16. **Company stage:** Supplify is **pre-launch** (product built
and tested internally; **zero live paying tenants**) and **bootstrapped** (no institutional
capital raised, not currently running a raise). Every competitor figure below is either a
cited public fact, a vendor self-report (flagged as such), or an explicitly labeled
third-party estimate — never presented as verified fact when it is not. See
[README.md](./README.md) for document scope.

**Scope:** Twenty competitors profiled across global restaurant back-office, two-sided
ordering/marketplace, POS-anchored procurement, MENA-native platforms, and adjacent
horizontal inventory tools. Research compiled 2026-07-01 from company sites, SEC filings
(where applicable), press coverage, and G2/Capterra review pages. G2 pages that returned HTTP
403 during research are noted; facts from those pages come from search-surfaced snippets,
not full page reads.

**How to read this part:** Profiles are organized by **competitive archetype**, not
alphabetically, because Supplify's near-term battle is determined more by category fit and
geography than by feature checklists. A unified comparison table (§4.8) and cross-cutting
findings (§4.9) follow all profiles. Supplify's own verified baseline is Part 1 §1.2–§1.11;
pricing tiers referenced throughout are Part 7 §7.2.

---

## 4.1 Research Methodology

| Step                    | Approach                                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source hierarchy        | (1) Company-owned pages and filings; (2) press releases and tier-1 tech press; (3) review platforms (G2, Capterra); (4) aggregators (Crunchbase, Tracxn, Latka) — aggregators used only when labeled as estimates |
| Revenue/customer counts | Stated as "not disclosed" when absent; vendor self-reports flagged; third-party ARR estimates never used as headline facts                                                                                        |
| MENA/Lebanon presence   | Confirmed only with primary-source evidence; "no evidence found" is an absence-of-evidence statement, not proof of non-entry                                                                                      |
| AI depth                | Rated Basic / Moderate / High based on shipped, named product capabilities — not marketing copy alone                                                                                                             |
| Supplify comparison     | "Opportunity against them" states where Supplify is ahead **and** where it is honestly behind                                                                                                                     |

---

## 4.2 Competitor Taxonomy

| Archetype                                         | Competitors                                                                       | Primary threat to Supplify                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **A — Direct MENA / Lebanon-relevant**            | Supy, Foodics, Rewaa, Oracle F&B (partial)                                        | **Supy** — only competitor with **confirmed active Lebanon presence**                  |
| **B — Global restaurant back-office / inventory** | MarketMan, MarginEdge, Restaurant365, Crunchtime, Craftable, Yellow Dog, Apicbase | Feature-depth benchmarks; low near-term MENA collision                                 |
| **C — Two-sided ordering / marketplace**          | Choco, BlueCart, Orderlion, ChefHero→Notch (historical)                           | Workflow models; Choco's channel-agnostic routing is relevant to undigitized suppliers |
| **D — POS-anchored with procurement bolt-ons**    | Toast (xtraCHEF), Lightspeed, Oracle Simphony, Sourcery→Lavu                      | Distribution via POS install base; forced ecosystem lock-in                            |
| **E — Horizontal / enterprise adjacent**          | Cin7, Marketboomer                                                                | Not restaurant-native; pricing floors above Supplify Silver                            |

---

## 4.3 Archetype A — Direct MENA / Lebanon-Relevant Competitors

### 4.3.1 Supy — **Primary head-to-head threat**

**Overview.** Dubai-founded (2021) multi-branch restaurant back-office platform; HQ Dubai with
offices in Riyadh, London, Melbourne, Hong Kong
([The National](https://www.thenationalnews.com/business/start-ups/2023/08/14/generation-start-up-how-uaes-supy-is-addressing-the-hospitality-industrys-cost-woes/)).
**Total disclosed funding: $9.5M** (pre-seed $1.5M + seed $8M, 2022)
([Wamda](https://www.wamda.com/2022/07/supy-raises-8-million-seed-round)).

**Customers.** Self-reported "3,000+" to "3,500+" restaurants across "30+" to "42" countries
— inconsistent across Supy's own pages ([supy.io](https://supy.io/)).

**Features.** AI predictive ordering (14-day forecast), AI invoice receiving (OCR), multi-branch
inventory, recipe/menu costing, central kitchen module, 50–75+ integrations. Vendor claims
Gemini/Claude-based invoice pipeline with ~96%+ accuracy — **not independently verified**
([supy.io/supy-vs-marketman](https://supy.io/supy-vs-marketman/)).

**Pricing.** From **$250/month**, sales-gated; AI features are paid add-ons
([Supy pricing](https://supy.io/supy-pricing)).

**MENA/Lebanon.** **Confirmed: UAE, Saudi Arabia, Lebanon, Egypt**
([The National](https://www.thenationalnews.com/business/start-ups/2023/08/14/generation-start-up-how-uaes-supy-is-addressing-the-hospitality-industrys-cost-woes/)).
**Supy is the only competitor in this research set with a confirmed, direct Lebanon
presence** — the single most important competitive fact for Supplify's Lebanon-first GTM.

**Sentiment.** G2 4.9/5 (~75 reviews); sparse Capterra/TrustRadius coverage
([G2](https://www.g2.com/products/supy/reviews)).

**Opportunity against Supy.** Supy targets multi-branch groups from $250/month with no
self-serve path; Supplify's **$49 Silver** tier and self-serve trial address independents
Supy does not prioritize. **Where Supplify is behind:** years of live production usage,
named regional logos, and a shipped LLM invoice pipeline — none of which Supplify has proven
with a paying tenant yet.

---

### 4.3.2 Foodics — GCC POS incumbent, not a two-sided marketplace

**Overview.** Riyadh-headquartered (2014) cloud POS, payments, and restaurant-operations
platform; **~$200M raised** (Series C $170M, 2022)
([Foodics press](https://www.foodics.com/press/saas-series-c-funding/)).

**Customers.** Claims **33,500+ restaurant branches** (H1 2025), $6B GMV — self-reported
([Menabytes](https://www.menabytes.com/foodics-h1-numbers/)).

**Procurement reality.** Manual PO/supplier record-keeping; real e-procurement delegated to
third-party **KASO** integration (KSA/UAE only)
([Foodics press — KASO](https://www.foodics.com/press/foodics-integrates-with-kaso/)).
No native two-sided marketplace, GPS fulfillment, or order-scoped chat.

**Pricing.** Public tiers ~**SAR 392–1,224/month** (~$105–330)
([foodics.com/pricing](https://www.foodics.com/pricing/)).

**MENA/Lebanon.** Strong GCC core (KSA, UAE, Egypt, Jordan, Kuwait, Bahrain, Qatar, Iraq).
Lebanon presence is **partner-mediated only** (reseller Ordable) — not direct operations
([itsordable.com](https://www.itsordable.com/en/lebanon/portfolio/partner/foodics)).

**Sentiment.** Capterra 4.0/5 (n=7); G2 complaints on slow support and hidden add-on costs
([G2](https://www.g2.com/products/foodics/reviews)).

**Opportunity against Foodics.** Compete on **procurement depth** (two-sided ordering,
logistics, receiving), not POS. Foodics wins on brand, capital, and distribution in GCC —
advantages Supplify does not have today.

---

### 4.3.3 Rewaa — Saudi retail/POS, single-sided

**Overview.** Riyadh (2018) omnichannel POS, inventory, ZATCA e-invoicing for Saudi SMEs;
**$72M disclosed** ($27M Series A 2023 + $45M Series B 2025)
([Wamda](https://www.wamda.com/2025/12/saudi-arabias-rewaa-closes-45-million-series-b)).

**Customers.** Claimed 7,000+ retailers (2023), 10,000+ stores (2025 press) — self-reported.

**Procurement.** Internal PO/vendor tracking per merchant — **not** a cross-merchant B2B
marketplace ([rewaa.com](https://rewaa.com/)).

**Pricing.** Third-party guide: ~**SAR 3,449–5,939/yr** (~$77–132/mo), branch-capped with
paid add-ons ([lkwjd.com](https://lkwjd.com/vat-compliance-software-saudi-smes)).

**MENA/Lebanon.** **Saudi Arabia only** — no verified UAE, Egypt, or Lebanon operations.

**Opportunity against Rewaa.** Supplify's two-sided F&B marketplace is a different category.
Rewaa's ZATCA compliance moat and $72M capital are real GCC advantages Supplify lacks.

---

### 4.3.4 Oracle Simphony / NetSuite Restaurant Operations — enterprise POS + fragmented back-office

**Overview.** Simphony is Oracle's cloud POS (180+ countries claimed)
([Oracle F&B](https://www.oracle.com/food-beverage/micros/)). Procurement depth requires
separate Inventory Management module or **NetSuite Restaurant Operations** (launched March 2026) ([Oracle news](https://www.oracle.com/news/announcement/oracle-and-netsuite-deliver-new-ai-powered-solution-for-restaurant-operations-2026-03-31/)).

**Pricing.** Simphony Essentials from **$55/month**; enterprise/NetSuite custom
([Capterra](https://www.capterra.com/p/202814/Oracle-MICROS-Simphony/)).

**MENA.** Dedicated Middle East regional site; **no Lebanon-specific presence found**
([Oracle Middle East](https://www.oracle.com/middleeast/food-beverage/restaurant-pos-systems/simphony-pos/)).

**Opportunity against Oracle.** Supplify's unified platform at $49–349/mo vs. stitching POS +
inventory + ERP modules. Oracle's edge is enterprise scale and POS heritage — not Supplify's
near-term segment.

---

## 4.4 Archetype B — Global Restaurant Back-Office / Inventory

### 4.4.1 MarketMan

Tel Aviv-founded (2013); merged with Meal Ticket under **PSG $100M+ investment** (2022)
([PSG Equity](https://psgequity.com/news/meal-ticket-and-marketman-announce-merger-and-over-100-million-growth-investment-from-psg)).
Claims 12,000–15,000+ restaurants. **Published pricing:** Starter $199/mo, Growth $249/mo
([MarketMan Pricing](https://www.marketman.com/pricing-for-restaurant-inventory-management-system)).
**MENA:** no evidence found. **Weaknesses:** OCR reliability complaints, rigid contracts,
6–12 week onboarding ([Capterra](https://www.capterra.com/p/136439/Marketman-Restaurant-Inventory/reviews/)).

### 4.4.2 MarginEdge

Arlington, VA (2015); **$83.2M raised** (Series C $45M, Dec 2022)
([PR Newswire](https://www.prnewswire.com/news-releases/marginedge-secures-45-million-in-series-c-funding-to-empower-restaurateurs-with-actionable-data-and-insights-301697201.html)).
Hybrid AI+human invoice processing (24–48 hr turnaround). ~$300–330/mo per third-party
estimates ([dishcost.com](https://dishcost.com/blog/dishcost-vs-marginedge)). **MENA:** none.
**Strength:** invoice accuracy via human review; **gap vs. Supplify:** no ordering/fulfillment
workflow.

### 4.4.3 Restaurant365

Irvine, CA (2011); unicorn since 2023; **$135M (2023) + $175M (2024)** rounds
([TechCrunch](https://techcrunch.com/2024/05/15/restaurant365-orders-in-175m-at-a-1b-valuation-to-supersize-its-food-service-software-stack/)).
52,000+ restaurants claimed. Full GL accounting + inventory + labor — **~$469/location/mo**
historical data point ([TechCrunch](https://techcrunch.com/2024/05/15/restaurant365-orders-in-175m-at-a-1b-valuation-to-supersize-its-food-service-software-stack/)).
**MENA:** none found. R365 AI launched May 2026
([PR Newswire](https://www.prnewswire.com/news-releases/restaurant365-introduces-r365-ai-the-only-intelligence-engine-built-on-the-full-restaurant-pl-302768635.html)).

### 4.4.4 Crunchtime

Boston (mid-1990s); **$100M+ revenue** self-reported (Feb 2024)
([Crunchtime blog](https://www.crunchtime.com/blog/reflections-on-reaching-100m-and-what-comes-next)).
500+ brands, 125,000–150,000+ locations. Merged with QSR Automations (2025). Enterprise
back-office only — no supplier marketplace. **MENA:** no dedicated presence confirmed.

### 4.4.5 Craftable

Dallas (2014); PE investment from Gauge Capital (2023, undisclosed amount)
([Dallas Innovates](https://dallasinnovates.com/local-hospitality-platform-craftable-gets-strategic-investment-from-southlakes-gauge-capital/)).
Claims 10,000+ operators. **Craftable AI** (Invoice AI, Mapping AI) launched Nov 2025
([PR Newswire](https://www.prnewswire.com/news-releases/craftable-launches-invoice-ai--hospitalitys-first-true-end-to-end-human-free-invoice-automation-solution-302610756.html)).
Capterra 4.5/5 (123 reviews). **MENA:** none.

### 4.4.6 Yellow Dog Software

Norfolk, VA; venue/stadium inventory specialist. Claims 7,500+ outlets
([yellowdogsoftware.com](https://www.yellowdogsoftware.com/)). G2 3.8/5 — UX complaints
([G2](https://www.g2.com/products/yellow-dog-inventory/reviews)). **MENA:** none. No
ordering/marketplace layer.

### 4.4.7 Apicbase

Antwerp, Belgium (~2013); **~$11.5M raised**
([Crunchbase](https://www.crunchbase.com/organization/apic)). Deep recipe/menu engineering +
HACCP. G2 4.5/5 (60 reviews). **MENA:** none. Back-of-house only — no marketplace/logistics.

---

## 4.5 Archetype C — Two-Sided Ordering / Marketplace

### 4.5.1 Choco

Berlin (2018); **~$301M raised**, unicorn at $1.2B (Apr 2022); **no new round since Apr 2022**
([PR Newswire](https://www.prnewswire.com/news-releases/choco-achieves-unicorn-status-in-quest-to-drive-zero-food-waste-in-supply-chains-301523410.html)).
**Free for restaurants**; suppliers pay custom subscription
([Choco pricing](https://choco.com/us/pricing)). **Choco Voice Agent** with OpenAI Realtime API
(2026) ([OpenAI](https://openai.com/index/choco/)). Peak disclosed: ~15,000 restaurants,
~16,000 suppliers (2022) — current site copy inconsistent
([Choco About](https://choco.com/us/about)). Documented layoffs and pivot toward
supplier/fintech monetization ([Glassdoor](https://www.glassdoor.com/Reviews/Choco-layoff-Reviews-EI_IE3123979.0,5_KH6,12.htm)).
**MENA:** GCC claim **not corroborated** by primary sources.

**Opportunity against Choco.** Supplify's dual-sided paid subscription is structurally more
stable than free-restaurant/paid-supplier. **Behind:** shipped OpenAI voice-ordering agent.

### 4.5.2 BlueCart

Sunnyvale, CA (2014); **~$31–32M raised**
([BlueCart blog](https://www.bluecart.com/blog/bluecart-acquires-new-financing)).
Claims 100K+ businesses / 48,000–125,000+ restaurants (figures vary by page). Distributor-
facing eCommerce + predictive ordering. Sales-led, opaque pricing. **MENA:** US-only.

### 4.5.3 Orderlion

Vienna (2017); **€4M pre-Series A** (2022)
([EU-Startups](https://www.eu-startups.com/2022/11/vienna-based-orderlion-picks-up-e4-million-to-make-b2b-food-supply-chain-streamlined-and-scalable/)).
**Supply-side only** — AI Inbox parses email/WhatsApp/voicemail orders into ERP. 500+ suppliers
in DACH/UK/France. No G2/Capterra reviews found. **MENA:** none.

**Opportunity:** Supplify's two-sided scope is broader; **behind:** AI Inbox for messy order
channels.

### 4.5.4 ChefHero → Notch — **Historical, not active marketplace competitor**

Toronto marketplace (2015) collapsed 80% revenue in March 2020 COVID shock; rebranded to
**Notch** (AR/AP fintech for distributors)
([BetaKit](https://betakit.com/following-pandemic-hit-chefhero-rebrands-refocuses-to-early-success/)).
**~$39.1M cumulative funding** per PitchBook. **Lesson for Supplify:** marketplace models
without recurring SaaS base are vulnerable to demand shocks — supports Part 7's subscription-
first model.

---

## 4.6 Archetype D — POS-Anchored Platforms

### 4.6.1 Toast (xtraCHEF / Invoice Management)

NYSE: TOST; **~164,000 locations** (FY2025)
([StockTitan](https://www.stocktitan.net/sec-filings/TOST/8-k-toast-inc-reports-material-event-2569dedba178.html)).
xtraCHEF acquired 2021 (~$49M)
([Toast press](https://pos.toasttab.com/news/toast-acquires-xtrachef-to-empower-restaurants-with-insights-into-menu-profitability-and-accounts-payable-automation)).
**Toast IQ** AI assistant (2025). xtraCHEF G2 **2.4/5** — OCR accuracy and support complaints
([G2](https://www.g2.com/products/xtrachef/reviews)). Value contingent on Toast POS lock-in.
**MENA:** no evidence found. International: UK, Canada, Ireland, Australia.

_Note: xtraCHEF is profiled here only; it is not duplicated as a standalone competitor entry._

### 4.6.2 Lightspeed

Montreal; NYSE: LSPD; **145,000 customer locations** (Q1 FY2026)
([SEC 6-K](https://www.sec.gov/Archives/edgar/data/0001823306/000182330625000043/earningsreleasefy26q1.htm)).
Restaurant POS with inventory bolt-on; Starter $69/mo to Premium $399/mo
([ITQlick](https://www.itqlick.com/lightspeed-restaurant/pricing)). **Lightspeed AI** (Jan
2026). NuORDER acquisition serves apparel retail, not F&B procurement. **MENA:** reseller only
(e.g., Cloudscape UAE).

### 4.6.3 Sourcery → Lavu — **Dormant standalone brand**

YC-backed AP automation (2012); **acquired by Lavu Aug 2019**
([BusinessWire](https://www.businesswire.com/news/home/20190807005767/en/Lavu-Acquires-Sourcery-Combinator-Backed-Startup-Focusing-Accounts)).
Now "Sourcery AP Automation by Lavu" — POS-locked upsell. Absent from current AP category
comparisons. **MENA:** none. Carry **low competitive weight** in prioritization.

---

## 4.7 Archetype E — Horizontal / Enterprise Adjacent

### 4.7.1 Cin7

Auckland (2011); PE-acquired 2019 (~$133M)
([Crunchbase](https://www.crunchbase.com/organization/cin7)). 8,500+ customers, 75+ countries.
**ForesightAI** demand forecasting + document AI
([Cin7 newsroom](https://www.cin7.com/newsroom/cin7-launches-new-ai-capabilities/)).
Core from **$349/mo** ([Cin7 pricing](https://www.cin7.com/pricing/)). Not restaurant-native.
**MENA:** none found.

### 4.7.2 Marketboomer (PurchasePlus)

Sydney (1995 heritage); **A$4.9M** (July 2024)
([TheSaaSNews](https://www.thesaasnews.com/news/marketboomer-raises-4-9-million-in-funding/)).
Enterprise hotel procurement (IHG, Accor, Marriott logos cited). From **A$650/mo**
([Capterra](https://www.capterra.com/p/216075/Purchase-Plus/)). APAC-centric. No fulfillment/
logistics. **MENA:** none.

---

## 4.8 Master Comparison Table

| Competitor      | Disclosed funding     | Pricing vs. Supplify tiers                 | MENA / Lebanon                         | AI depth                                                                                                                                        | Target segment                     | Sales motion                      |
| --------------- | --------------------- | ------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------- |
| **Supplify**    | $0 — bootstrapped     | Silver $49 / Gold $149 / Platinum $349     | **Yes — Lebanon-first**                | **Enforced:** smart reorder, smart quick lists, notification webhooks, custom domains; **catalog-only:** developer API, advanced report strings | Two-sided restaurants + suppliers  | Self-serve + sales-led Enterprise |
| **Supy**        | $9.5M                 | Gold/Platinum ($250+/mo)                   | **Yes — confirmed Lebanon**            | High (LLM invoice AI, vendor-claimed)                                                                                                           | Multi-branch groups, Gulf-first    | Fully sales-led                   |
| Foodics         | ~$200M                | Silver–Platinum ($105–330/mo, POS)         | GCC core; Lebanon reseller only        | Moderate (analytics + acquired AI)                                                                                                              | Restaurants/chains, POS-first      | Hybrid                            |
| Rewaa           | $72M                  | Silver–Gold (~$77–132/mo + add-ons)        | KSA only                               | Basic (Musaed assistant)                                                                                                                        | Saudi SME retail/F&B               | Hybrid trial + sales              |
| Oracle Simphony | Public (ORCL)         | Gold+ ($55–75/mo entry; enterprise custom) | ME regional site; no Lebanon confirmed | Emerging (NetSuite AI, 2026)                                                                                                                    | Enterprise POS + ERP               | Hybrid                            |
| MarketMan       | $2M + PSG $100M+      | Silver/Gold ($199–249/mo)                  | No                                     | Moderate (OCR disputed)                                                                                                                         | Independent–enterprise, US-centric | Demo-led                          |
| MarginEdge      | ~$83M                 | Silver/Gold (~$300–330/mo est.)            | No                                     | Moderate–high (hybrid OCR)                                                                                                                      | Independent–multi-unit, US/Canada  | Sales-assisted                    |
| Restaurant365   | $310M+ rounds         | Enterprise (~$469/loc/mo hist.)            | No                                     | Emerging (R365 AI 2026)                                                                                                                         | Multi-unit chains, US              | Fully sales-led                   |
| Crunchtime      | PE-backed; $100M+ rev | Above Enterprise (custom)                  | Via global chains only                 | Basic (forecasting)                                                                                                                             | Enterprise chains                  | Enterprise sales                  |
| Craftable       | Undisclosed PE (2023) | Enterprise custom                          | No                                     | Moderate–high (Craftable AI)                                                                                                                    | US restaurants/bars/hotels         | Sales-led                         |
| Yellow Dog      | Not disclosed         | Quote-only (likely >Platinum)              | No                                     | None documented                                                                                                                                 | US large venues                    | Sales-led                         |
| Apicbase        | ~$11.5M               | Silver–Gold (~€60–160/mo est.)             | No                                     | Basic–moderate                                                                                                                                  | EU multi-unit chains               | Sales-led                         |
| Choco           | ~$301M                | Free (restaurants) / custom (suppliers)    | Unverified GCC claim                   | High (OpenAI voice agent)                                                                                                                       | US/EU marketplace                  | Hybrid                            |
| BlueCart        | ~$31–32M              | Opaque (est. Silver–Gold)                  | No                                     | Moderate                                                                                                                                        | US distributors + buyers           | Sales-led                         |
| Orderlion       | €4M                   | Undisclosed                                | No (DACH/UK/FR)                        | Moderate (AI Inbox)                                                                                                                             | F&B wholesalers (supply-side)      | Sales-led                         |
| ChefHero/Notch  | ~$39M                 | N/A (AR/AP fintech)                        | No                                     | Basic                                                                                                                                           | NA distributors                    | Sales-led                         |
| Toast/xtraCHEF  | Public (TOST)         | Platinum+ (~$199–299/mo + POS)             | No                                     | High platform (Toast IQ)                                                                                                                        | Toast POS customers                | Hybrid                            |
| Lightspeed      | Public (LSPD)         | Silver–Gold ($69–399/mo)                   | Reseller only (UAE)                    | Basic (Lightspeed AI)                                                                                                                           | SMB restaurants, POS-first         | Hybrid                            |
| Sourcery/Lavu   | $7.5M (pre-acq.)      | Custom per-invoice                         | No                                     | None documented                                                                                                                                 | Lavu POS upsell                    | Sales-led                         |
| Cin7            | PE ~$133M acq.        | Above Platinum ($349+/mo)                  | No                                     | Moderate–deep                                                                                                                                   | Retail/wholesale SMB               | Hybrid self-serve                 |
| Marketboomer    | A$4.9M                | Gold/Platinum (A$650+/mo)                  | No                                     | Basic (invoice AI)                                                                                                                              | APAC hotel chains                  | Sales-led                         |

---

## 4.9 Cross-Cutting Strategic Findings

### 4.9.1 The Lebanon competitive fact

**Supy is the only competitor with confirmed, direct Lebanon operations** among all twenty
profiled. Foodics has marginal partner/reseller presence; every US/EU incumbent shows no
verified Lebanon footprint. Global players (Toast, Restaurant365, Choco) are not credible
near-term entrants for Lebanon's independent-operator segment given pricing, sales motion,
and geographic focus. **Competitive risk in Lebanon is regional and specific (Supy first,
Foodics adjacent), not generic "well-funded global SaaS."**

### 4.9.2 Structural white space Supplify occupies

No competitor ships the **same combination** Supplify has built: two-sided restaurant–
supplier tenancy, contract-priced catalog, par-level multi-branch inventory, GPS-tracked
fulfillment, photo-scored receiving, invoicing/disputes, real-time chat, and bilingual
schema — at a **$49–349/month** band with **self-serve Silver/Gold signup**. The closest
partial overlaps:

| Capability                         | Nearest competitor                                 | Gap                                                                                 |
| ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Multi-branch procurement + costing | Supy, MarketMan, R365                              | Supplify lacks recipe-costing depth and years of production proof                   |
| Two-sided marketplace              | Choco (unstable model), BlueCart (US distributors) | Supplify's dual-paid subscription is more stable; Choco has voice AI Supplify lacks |
| MENA brand/capital                 | Foodics ($200M), Rewaa ($72M)                      | Neither is a native two-sided marketplace                                           |
| Invoice automation                 | MarginEdge, Craftable, Supy                        | Supplify has no shipped OCR invoice ingestion                                       |
| Self-serve + transparent pricing   | MarketMan (US only)                                | Rare in category; Supplify + MarketMan are exceptions                               |

### 4.9.3 Recurring weakness pattern — Supplify's credible wedge

Across G2/Capterra reviews, **slow support, long onboarding, and opaque/rigid contracts**
appear repeatedly (MarketMan, BlueCart, Restaurant365, Toast/xtraCHEF, Foodics). Supplify
can position against this **only after** it has live customers validating its own support
and onboarding experience — the wedge is evidenced in competitor reviews, not yet proven
for Supplify.

### 4.9.4 AI is table stakes in marketing, uneven in delivery

Invoice OCR, demand forecasting, and conversational assistants are claimed by most
incumbents. **Named LLM partnerships** (Supy: Gemini/Claude; Choco: OpenAI Realtime API;
Craftable: Invoice AI suite) set buyer expectations. Supplify's Platinum "AI quick lists" are **backend-enforced** as of July 2026
(`docs/features/ai-quick-lists.md`). Remaining gaps vs. competitor AI narratives: **no
shipped invoice OCR**, and several other Platinum strings (developer API, advanced reports,
central purchasing) are still catalog-only (`docs/product/PLATINUM_CATALOG_ONLY_FEATURES.md`)
— close or disclose before enterprise conversations that test those claims.

### 4.9.5 Competitors to deprioritize

**ChefHero/Notch** (marketplace abandoned), **Sourcery/Lavu** (absorbed 2019, dormant brand),
and **Yellow Dog** (US venue niche) should carry **materially less weight** than Supy,
Foodics, MarketMan-class back-office tools, or Choco's AI narrative.

### 4.9.6 Arabic / bilingual support

**No competitor in this set has verified Arabic-language product support** or a bilingual
data model comparable to Supplify's schema-level Arabic/English design (Part 1 §1.14). This
remains an **absence-of-evidence** finding per vendor, not independent verification of
Supplify's implementation quality.

---

### Sources & assumptions used in this part

Primary sources are cited inline throughout §4.3–§4.7. This consolidated document merges
research from three draft group files (compiled 2026-07-01) with deduplication of Toast/
xtraCHEF (single profile under §4.6.1). Source categories:

- **Company sites and pricing pages** for all twenty competitors
- **SEC/regulatory filings:** Toast (TOST), Lightspeed (LSPD), Oracle (ORCL)
- **Funding aggregators:** Crunchbase, Tracxn, PitchBook, Latka — used only where labeled
- **Press:** TechCrunch, PR Newswire, The National, Wamda, Menabytes, BetaKit, EU-Startups
- **Reviews:** G2, Capterra, TrustRadius, Glassdoor, Trustpilot
- **Supplify baseline:** Part 1 §1.2–§1.14; `docs/product/tier-matrix.md`

**Research limitations:** Private-company revenue is "not disclosed" unless a self-reported
press figure exists. Customer counts frequently conflict across a vendor's own pages;
discrepancies are preserved in individual profiles rather than silently resolved. Re-verify
before external investor distribution.

### Open items for founder review

1. Confirm whether **ChefHero/Notch**, **Sourcery/Lavu**, and **Yellow Dog** should remain
   in the "20+" set or move to an "adjacent/historical" appendix in Part 16.
2. **Supy Lebanon presence** — validate with field intelligence (named logos, pricing in
   market) beyond press citations; this is the #1 competitive fact in the document.
3. ~~Close or contractually disclose **Platinum AI quick lists** before using §4.9.4 in
   sales or investor materials.~~ **Done (July 2026)** — smart quick lists enforced; keep
   §4.9.4 accurate for **remaining** catalog-only Platinum items (developer API, advanced
   reports, central purchasing).
4. Revisit **Part 13 §13.2** (now updated against this part) after any Supy pricing or
   Lebanon GTM change.
