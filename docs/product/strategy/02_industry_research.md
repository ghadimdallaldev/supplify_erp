# Part 2 — Industry & Market Research

**Document status:** Draft, part 2 of 16. Builds directly on the figures introduced in
[Part 1](./01_executive_summary_and_foundations.md) (§1.7, §1.14) — this part cross-checks
those figures against additional sources, goes deeper on regional data, and expands into the
adjacent categories (restaurant SaaS, procurement software, AI adoption) that frame
Supplify's competitive and market position. As in Part 1, every statistic below carries an
inline citation, and every source is a market-research vendor report, government body, or
trade-press piece — never a number invented for narrative convenience. Where sources
disagree by a wide margin (common in this industry — see §2.1–2.2), the disagreement is
stated explicitly rather than resolved by picking the most convenient number.

---

## 2.1 Global Restaurant Industry — Size and Structure

Estimates of the global restaurant/foodservice market vary by a factor of roughly 1.4x
depending on scope and provider, which is itself a data point worth stating plainly before
citing any single figure:

- **Grand View Research** sizes the global foodservice market at **US$3.10 trillion in
  2023**, growing to **US$3.79 trillion by 2030** at a **2.9% CAGR (2024–2030)**
  (Source: [Grand View Research, Foodservice Market Report](https://www.grandviewresearch.com/industry-analysis/foodservice-market-report)).
- **Mordor Intelligence** sizes the same nominal market far larger and faster-growing:
  **US$4.34 trillion in 2025**, reaching **US$7.61 trillion by 2030** at an **11.89% CAGR**
  (Source: [Mordor Intelligence, Food Service Market](https://www.mordorintelligence.com/industry-reports/food-service-market)).
  The gap reflects scope, not a factual dispute — Mordor's methodology folds in
  delivery-platform and cloud-kitchen growth more aggressively. **Do not average these two
  figures**; cite whichever scope is relevant and disclose the other as context.
- A narrower, precisely defined slice: **IBISWorld** sizes the _global fast-food
  restaurants_ industry specifically at **US$1.1 trillion in 2025** (+1.6% that year),
  a **4.1% CAGR (2020–2025)**, across **588,000 businesses** globally
  (Source: [IBISWorld, Global Fast Food Restaurants](https://www.ibisworld.com/global/industry/global-fast-food-restaurants/1480/)).
- **Structure**: full-service restaurants held **48.98% of global foodservice revenue** in
  2023 per Grand View Research (same source as above). The clearest available chain-vs-independent
  split is dated — Statista reports independents generated **79.9% of Western European
  foodservice sales vs. 20.1% for chains in 2014**
  (Source: [Statista, Sales share of independent and chain restaurants worldwide (2014)](https://www.statista.com/statistics/491986/foodservice-sales-of-chain-and-independent-restaurants-worldwide/)).
  No current, high-tier, global-level chain/independent split was found in this research
  pass; trade press (Nation's Restaurant News, QSR Magazine) describes a decade-long erosion
  of independent share, accelerated by the pandemic, but without a citable current global
  percentage — this is flagged as a genuine data gap, not filled with a guess.
- **Number of restaurants globally**: estimates cluster in the **10–20 million range**,
  inherently soft because countries register and count food-service establishments
  inconsistently (informal/unregistered vendors are the main source of variance)
  (Source: [Statista, Number of food service units worldwide by country](https://www.statista.com/statistics/1240159/number-of-food-service-establishments-worldwide-by-country/)).
  Directional only.

**Why this matters for Supplify**: the industry Supplify sells into is enormous in absolute
terms under any scope definition, but industry-wide figures are a weak proxy for Supplify's
actual addressable market — the company sells to independent operators and mid-market
chains, not to the trillion-dollar aggregate. Part 6 (TAM/SAM/SOM) will build a bottom-up
figure from establishment counts rather than top-down from these headline numbers.

## 2.2 Global Food Service Industry — Segments

Segment-level sizing is even less standardized than the industry total, because "casual
dining," "catering," and "hotel F&B" are defined inconsistently across providers — several
pairs of sources for the same nominal segment differ by 4–6x. Figures below are presented as
ranges with the scope ambiguity stated, per this document's sourcing standard.

| Segment                         | Reported range (2025 basis)                                           | Growth                                                                                    | Tier / caveat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QSR (quick-service)             | **~US$1.0–1.07 trillion** — convergent across three independent firms | ~8.4% CAGR to 2031 (Mordor)                                                               | Medium-high — three vendors agree within a narrow band, unusual for this space (Sources: [Precedence Research](https://www.precedenceresearch.com/quick-service-restaurant-market), [Fortune Business Insights](https://www.fortunebusinessinsights.com/quick-service-restaurants-market-103236), [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/quick-service-restaurants-market))                                                                                                           |
| Casual dining                   | ~US$315–333 billion                                                   | ~5.5% CAGR                                                                                | Low — single-family of aggregator sources, not cross-checked against a top-tier firm (Source: [Business Research Insights](https://www.businessresearchinsights.com/market-reports/casual-dining-market-117489))                                                                                                                                                                                                                                                                                                         |
| Hotel/hospitality F&B           | **US$73.4B–US$479.6B** — 6.5x spread depending on scope               | 6.5%–9.5% CAGR depending on source                                                        | Low — do not cite a single number without stating the scope problem (Sources: [dataintelo](https://dataintelo.com/report/hotel-food-and-beverage-market), [Business Research Insights](https://www.businessresearchinsights.com/market-reports/hotel-food-and-beverage-service-market-117635))                                                                                                                                                                                                                           |
| Catering                        | US$118.3B–US$304.5B                                                   | 3.7%–6.6% CAGR                                                                            | Low — same scope-ambiguity problem (Sources: [IMARC](https://www.imarcgroup.com/catering-services-market), [Technavio](https://www.technavio.com/report/catering-services-market-industry-analysis))                                                                                                                                                                                                                                                                                                                     |
| Cloud kitchens / ghost kitchens | **~US$70–90 billion** — reasonably convergent                         | **12–18% CAGR** — the fastest-growing segment in this table across every source consulted | Medium-high — Grand View Research (~US$80.3B, 12.6% CAGR 2026–2033) and Mordor Intelligence (18.17% CAGR through 2030) both flag this as a standout growth segment, with several lower-tier vendors (Virtue Market Research, Precedence, Research and Markets) independently landing in the same $70–90B band (Sources: [Grand View Research](https://www.grandviewresearch.com/industry-analysis/cloud-kitchen-market), [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/food-service-market)) |

The cloud-kitchen/ghost-kitchen finding is the most decision-relevant one in this table:
it is both the fastest-growing segment and the one whose operating model — no dine-in,
delivery-dependent, thin margins, high sensitivity to input-cost and waste discipline —
maps most directly onto Supplify's value proposition (ordering, inventory, and receiving
discipline). Supplify's product does not currently market specifically to cloud kitchens,
but the segment's growth rate is a relevant signal for the persona/segment prioritization
work in Part 3.

## 2.3 Digital Transformation in Food Service — Adoption, Drivers, Laggards

The single most credible, methodology-disclosed source on restaurant technology adoption is
the U.S. National Restaurant Association's annual _State of the Restaurant Industry_ survey.
Its 2026 edition reports:

- **26% of restaurant operators say they currently use AI-related tools**
  (Source: [Restaurant Dive, "NRA: Over 25% of restaurant operators use AI"](https://www.restaurantdive.com/news/national-restaurant-assocation-operator-artificial-intelligence-adoption/812418/), summarizing NRA data).
- **60% of operators describe their technology use as roughly in line with competitors; 12%
  call themselves leading-edge; 28% say they are lagging** (same source).
- **83% of operators say technology provides a clear competitive advantage**, and four in
  ten say tech investment directly improved customer satisfaction (same source).
- **61% of limited-service and 52% of full-service operators are now investing in loyalty
  technology**; roughly six in ten operators plan to increase technology spend overall
  (same source).

A vendor-sponsored survey (Toast, a restaurant POS company — disclosed here as a vendor
source, not an independent one) reports directionally consistent but higher figures: **26%
of operators plan to implement new technology systems in 2025** (+7 points vs. 2023), and
roughly **39% already investing in AI/ML tools**, with 48% planning to soon
(Source: [Toast, State of the Restaurant Industry 2026](https://pos.toasttab.com/blog/on-the-line/state-of-the-restaurant-industry-2025)).
Vendor-sponsored figures should be read as directionally useful but self-interested — this
pattern (vendor surveys reporting 2–3x higher adoption than independent surveys) recurs
throughout this document, most starkly in the AI section below (§2.9).

**Drivers**, per NRA-sourced reporting: labor costs reached **36.5% of average restaurant
operating costs in 2024** and are expected to keep climbing through 2026
(Source: [Modern Restaurant Management](https://modernrestaurantmanagement.com/restaurants-challenged-to-manage-the-cost-inflation-margin-squeeze-in-2026/));
**52% of operators rank food/ingredient inflation as their top challenge**; and consumer
behavior has shifted decisively off-premise — **70% of U.S. consumers order delivery, 70%
order takeout**, and off-premise formats account for **more than 70% of revenue at leading
QSR brands** (Source: [Mordor Intelligence, QSR Market](https://www.mordorintelligence.com/industry-reports/quick-service-restaurants-market)).

**Laggards and barriers**, drawn from a consistent qualitative pattern across multiple
mid- and low-tier sources (directional, not from a single quantified study): high upfront
implementation cost relative to thin (3–5%) restaurant margins; fragmentation forcing
independents into costly multi-tool stacks (POS, inventory, scheduling, and accounting each
from a different vendor); staff resistance and retraining burden; and — a structural point
recurring across restaurant-tech trade commentary — most restaurant technology was built
first for enterprise chains and pushed downmarket to independents at price points and
complexity levels not suited to them. No single authoritative, current statistic states
"X% of restaurants globally have adopted digital procurement" — that specific claim, where
it appears in vendor materials, traces to low-tier aggregators without disclosed
methodology and should not be treated as fact.

## 2.4 Restaurant SaaS Landscape — Category Definition and Sub-Segments

The restaurant management software category is sized meaningfully higher, and growing
meaningfully faster, than the foodservice industry it serves — a pattern worth stating
explicitly since it is the clearest quantified evidence that software penetration in this
industry is still rising, not saturated:

- **Grand View Research**: global restaurant management software market at **US$5.79
  billion in 2024**, projected to reach **US$14.70 billion by 2030** — a **17.4% CAGR
  (2025–2030)**. Full-service restaurants held 36.5% share in 2024; front-end/POS software
  held over 34% share; table-and-delivery-management is the fastest-growing sub-segment at
  19.6% CAGR (Source: [Grand View Research, Restaurant Management Software Market](https://www.grandviewresearch.com/industry-analysis/restaurant-management-software-market)).
- **Straits Research** corroborates the order of magnitude: **US$6.29 billion (2025)**
  growing to **US$21.17 billion by 2034** at a **14.43% CAGR**, with front-end software the
  largest segment and cloud deployment the fastest-growing delivery model
  (Source: [Straits Research, Restaurant Management Software Market](https://straitsresearch.com/report/restaurant-management-software-market)).

The category is consistently segmented, across both sources above, into: **front-end/POS
software; purchasing and inventory/back-office management; accounting and cash flow; table,
delivery, and reservation management; and employee payroll/scheduling** — the same
segmentation this document uses to frame Supplify's own feature set in Part 1, §1.2.

**POS specifically** (the largest, most mature sub-segment): Grand View Research sizes the
global restaurant POS terminal market (hardware plus software) at **US$22.26 billion in
2023**, projected to **US$38.16 billion by 2030** at an **8% CAGR** — the slowest-growing
sub-segment in the category, consistent with POS being the most mature, commoditized layer
of restaurant software (Source: [Grand View Research, Restaurant POS Terminal Market](https://www.grandviewresearch.com/industry-analysis/restaurant-point-of-sale-pos-terminal-market)).
This is a hardware-inclusive figure and should not be read as pure software revenue.

**Inventory management software specifically**: no high-tier (Statista/Grand View
Research/Mordor/Gartner-class) dedicated report exists for this sub-segment. Low-tier
aggregators report figures ranging from **US$1.2 billion to US$4.55 billion for 2024–2025**,
with CAGRs of 10–15% — a threefold spread that itself signals these vendors are producing
unverified, possibly recycled, bottom-up estimates rather than independently researched
figures (Sources: [DataInsightsMarket](https://www.datainsightsmarket.com/reports/restaurant-inventory-management-software-1387595), [VerifiedMarketReports](https://www.verifiedmarketreports.com/product/restaurant-inventory-management-and-purchasing-software-market/)).
**Directional only, re-verify before citing to investors.**

## 2.5 Procurement Software Market — Cross-Check of the Part 1 Figure

Part 1 (§1.14) cited a claim used widely in this space: global restaurant procurement
software at **~US$1.2–1.4 billion in 2024**, growing to **~US$3.4–3.5 billion by 2033** at a
**10–13% CAGR**, sourced from two low-tier aggregators (DataIntelo and MarketIntelo). This
section reports the outcome of an explicit cross-check against additional sources, as
promised in that section.

**Finding: no corroboration exists from any higher-tier source, because top-tier research
firms do not size "restaurant procurement software" as a distinct category at all.** A
search across Grand View Research, Mordor Intelligence, Gartner-class coverage, Fortune
Business Insights, MarketsandMarkets, and Allied Market Research found no report that treats
this as a standalone market. The DataIntelo and MarketIntelo figures ($1.2B/12.7% CAGR and
$1.42B/10.2% CAGR respectively) remain the only sources for this specific, narrowly-scoped
claim, and their underlying pages could not be independently verified — both blocked direct
fetch, and their published boilerplate (deployment mix, regional share language) matches
template patterns these vendors reuse across unrelated report categories, which is itself a
mild reliability flag (Sources: [DataIntelo](https://dataintelo.com/report/restaurant-procurement-software-market), [MarketIntelo](https://marketintelo.com/report/restaurant-procurement-software-market)).

What does exist, from credible sources, is the **broader, cross-industry procurement
software market**, which is a different (larger) scope and should not be conflated with the
restaurant-specific claim:

- **Grand View Research**: global procurement software market at **US$10.06 billion in
  2025**, projected to **US$21.29 billion by 2033** at a **10.0% CAGR**; e-procurement holds
  the largest revenue share (23.8% in 2025)
  (Source: [Grand View Research, Procurement Software Market](https://www.grandviewresearch.com/industry-analysis/procurement-software-market-report)).
- **Mordor Intelligence**: US$9.81 billion (2025) → US$17.11 billion by 2031, a 9.76% CAGR.
  Notably, **Mordor's own end-user segmentation for this market does not include
  restaurants, food service, or hospitality as a category at all** — its buyer segments are
  retail, manufacturing, transportation/logistics, healthcare, BFSI, IT/telecom, and
  government (Source: [Mordor Intelligence, Procurement Software Market](https://www.mordorintelligence.com/industry-reports/procurement-software-market)).

**Conclusion**: the broader procurement software market is roughly **7–8x larger** than the
narrow restaurant-specific claim, at a similar CAGR (~9–10% vs. the claimed 10–13%) — a
finding that is _consistent with_, but does not independently _confirm_, the restaurant-niche
figure. The restaurant-specific claim is not contradicted by better data; it is simply not
covered by better data. **Recommendation carried forward into this document and Part 1**:
continue to label the $1.2–1.4B/10–13% CAGR figure explicitly as "directional only, low-tier
source, no independent corroboration found," and use the broader $9–10 billion procurement
software market only as context, never as support for the narrower number.

## 2.6 Cloud ERP for SMB and Mid-Market Food Businesses

Cloud-deployment preference among ERP buyers generally is well documented by an independent
research and consulting firm (not a software vendor), which is the most credible source
located for this topic: **Panorama Consulting Group's annual ERP survey found 78.6% of
organizations implementing a new ERP system chose a cloud solution in 2024, up from 64.5% in
2023; its most recent report puts the figure at 75% for 2025**
(Source: [Panorama Consulting Group, ERP Report Archives](https://www.panorama-consulting.com/resource-center/erp-report-archives/)).
This is a meaningful, consistent majority-and-rising trend, from a source with disclosed
survey methodology rather than vendor marketing.

Food & beverage-specific ERP sizing exists only at low/mid tier: one vendor estimates the
global food & beverage ERP solution market at **~US$3.6 billion in 2023, growing to US$6.4
billion by 2030** (8.5% CAGR), with cloud deployment already representing **more than half
of category revenue** and growing faster than on-premise
(Source: [Virtue Market Research, Food and Beverage ERP Solution Market](https://virtuemarketresearch.com/report/food-and-beverage-erp-solution-market)).
Directional only.

**Drivers cited consistently across vendor and consultancy content** (qualitative, not from
a single rigorously sourced study, but repeated with enough independent consistency to be
useful directionally): total cost of ownership — cloud ERP is reported to deliver
substantially lower TCO than on-premise once server, IT-staffing, and multi-year upgrade
costs are counted; faster deployment without dedicated IT staff, relevant to SMB food
businesses that rarely employ in-house IT; and scalability without new capital
infrastructure spend as a business adds locations or warehouses — directly analogous to the
multi-branch/multi-warehouse upgrade path Supplify's own tiering already supports (Part 1,
§1.5). Named competitors in this space (NetSuite, Sage X3, Dynamics 365 Business Central,
Infor CloudSuite) are enterprise-oriented and priced well above Supplify's Silver/Gold
tiers, reinforcing the underserved-independent-operator positioning stated in Part 1's
Mission (§1.4).

## 2.7 Inventory Management Trends Specific to Food and Perishables

Food waste is the clearest, best-sourced problem statement in this entire research pass —
several primary bodies (not market-research vendors) publish hard figures:

- **UNEP**: approximately **1.05 billion tonnes of food were wasted globally in 2022**; of
  this, **28% (290 million tonnes) originated in food service**, versus 60% from households
  and 12% from retail (Source: [UNEP, Food Waste Index Report 2024](https://www.unep.org/resources/publication/food-waste-index-report-2024)).
- **WRAP** (UK): the hospitality and food-service sector generates **920,000 tonnes of food
  waste per year**, 75% of it avoidable, worth an estimated **£682 million to £3 billion**
  depending on the cost basis used; of this waste, 45% originates in food preparation, 34%
  from consumer plates, and 21% from spoilage
  (Source: [WRAP, Overview of waste in the hospitality and food service sector](https://www.wrap.ngo/resources/report/overview-waste-hospitality-and-food-service-sector)).
- **ReFED** (US): estimates **US$382 billion in surplus/wasted food generated in 2023**
  across the food system, with restaurants and food service among the largest contributing
  segments; food costs typically run **28–35% of restaurant sales**, which is the direct
  economic stake in reducing that waste
  (Source: [ReFED](https://refed.org/food-waste/consumer-food-waste)).

On the _efficacy_ of inventory software in reducing this waste, the evidence is thinner and
should be treated with real skepticism: **McKinsey states that AI-based demand forecasting
can reduce inventory errors by up to 20–50%**
(Source: [McKinsey, "A taste of what's next: Perspectives on the future of restaurants"](https://www.mckinsey.com/industries/retail/our-insights/a-taste-of-whats-next-perspectives-on-the-future-of-restaurants)) —
the strongest non-vendor figure found. Beyond this, waste-reduction claims (30–50% waste
reduction, 15–25% food-cost reduction) trace exclusively to vendor blogs and vendor-published
case studies (e.g., Leanpath, Winnow, Kitro, Apicbase), not independently audited studies.
**No independently audited, sector-wide statistic exists quantifying how much perishable
inventory software actually reduces waste in practice** — the waste problem itself is
rigorously documented; the software solution's measured impact is not, and this document
does not claim otherwise. This is directly relevant to how Supplify should (and should not)
market its own expiry/waste-tracking feature (Part 1, §1.2): as a genuinely useful
operational tool, not with an unverifiable ROI percentage attached.

## 2.8 Restaurant Technology — POS Evolution, Kitchen Display Systems, Delivery Integration

The most credible source on POS adoption specifically is **Hospitality Technology's 2025
Restaurant Technology Study**, an annual benchmark survey with disclosed methodology: POS is
now effectively universal (99% of operators have one), **52% of enterprise restaurant
businesses had moved to cloud-based POS as of 2025**, and **97% of multi-unit operators now
deploy the same POS system across all locations**, up from 86% a year earlier — indicating
consolidation toward standardized, cloud-first stacks even among large operators
(Source: [Hospitality Technology, 2025 Restaurant Technology Study](https://hospitalitytech.com/pos-software-2025-key-trends-and-features-horizon)).
POS system-switching activity slowed to 53% of operators in the past year, down from 71% in
2024 — a sign of stabilizing (not accelerating) churn in the category's most mature
sub-segment.

**Kitchen display systems (KDS)**: no National-Restaurant-Association- or
Deloitte-equivalent primary source was found for KDS adoption specifically. Available
figures (e.g., "~60% of new North American restaurants use KDS," fulfillment-time
reductions of 20–40%) come exclusively from vendor and content-mill blogs with no disclosed
sample or methodology. **Directional only — treat as plausible, not established.**

**Delivery and online ordering**: NRA-sourced research finds **37% of U.S. adults order
restaurant delivery at least weekly**, with consumers ordering via third-party apps an
average of 4.6 times per month (5.1 for Gen Z) (Source: [DoorDash Merchants blog, summarizing NRA data](https://merchants.doordash.com/en-us/blog/food-delivery-statistics)).
Third-party delivery remains concentrated: **DoorDash controls roughly two-thirds of the
U.S. market, Uber Eats about one-quarter** (Source: [Statista](https://www.statista.com/statistics/1235724/market-share-us-food-delivery-companies/)).
A genuinely important counter-trend for Supplify's positioning: **53% of restaurant
operators say they are actively trying to reduce reliance on third-party delivery**, largely
because of 10–30% commission fees per order, and 70% of consumers say they would rather order
directly from a restaurant so their money does not go to a marketplace intermediary
(Source: [Restaurant Business Online, "Third-party delivery booms, some restaurants pump the brakes"](https://www.restaurantbusinessonline.com/technology/third-party-delivery-booms-some-restaurants-pump-brakes)).
This validates a broader shift toward operator-owned digital infrastructure — the same shift
Supplify's own model represents on the procurement side, where it replaces
platform-intermediated fragmentation with a direct, operator-controlled relationship between
restaurant and supplier.

## 2.9 AI Adoption in Restaurant/Food-Service Operations — Data, Use Cases, and Honest Skepticism

This section requires more scrutiny than any other in this document, because it is the
category where vendor marketing and independent survey data diverge most sharply.

**What operators actually report doing, from the most credible independent source
available**: the NRA's 2026 _State of the Restaurant Industry_ survey finds **26% of
operators currently use AI-related tools**, broken down by use case as **marketing (19% of
full-service, 15% of limited-service operators — the largest single use case), administrative
tasks (10%), and customer order-taking/chatbots (just 6%)**
(Source: [Restaurant Dive, NRA AI adoption coverage](https://www.restaurantdive.com/news/national-restaurant-assocation-operator-artificial-intelligence-adoption/812418/)).
The same research shows a clear interest-versus-adoption gap on the consumer side: roughly
six in ten Gen Z/millennial consumers say they would order from an AI bot, yet only 6% of
restaurants actually deploy AI for ordering.

**Deloitte's global executive survey** (375 restaurant executives across 11 countries,
fielded Q4 2024) reinforces the same pattern at the enterprise level: **82% of executives
plan to increase AI investment**, yet **generative AI is used daily by only 9%** of
respondents. Deloitte's own press-release headline states this plainly: _"Restaurant AI
Investments Heat Up, But Adoption Still Appears to be on the Back Burner."_ Top-cited
barriers are identifying the right use cases (48%) and managing risk (48%); fewer than half
of surveyed organizations describe themselves as "ready" for AI on strategy, infrastructure,
operations, governance, or talent
(Source: [Deloitte, "How AI is Revolutionizing Restaurants"](https://www.deloitte.com/us/en/about/press-room/deloitte-how-ai-is-revolutionizing-restaurants.html)).

**Concrete evidence the hype has outrun reliable ROI in specific, named deployments**
(Source: [Restaurant Dive, "Restaurant tech execs warn against AI overdependence"](https://www.restaurantdive.com/news/restaurant-technology-executives-warn-against-ai-overdependence/821024/)):
Starbucks discontinued its own AI-driven inventory-control tool; McDonald's shut down its
2024 drive-thru voice-AI pilot built with IBM; and a Pizza Hut franchisee filed a lawsuit
alleging **US$100 million in losses attributed to an AI deployment**. Named executives in
the same piece caution explicitly against over-reliance: Popmenu's CEO notes that AI
inference costs "can exceed the salaries of the workers the AI was meant to replace"; Toast's
CMO argues reliability, not novelty, is what running a restaurant actually requires; and
Square's Head of Food & Beverage points out that AI outputs are only as good as the
(typically incomplete) business data feeding them.

**The vendor-survey inflation problem, stated directly**: vendor-sponsored surveys report
adoption figures **three times higher or more** than the NRA's independent numbers — a
Popmenu-sponsored survey claims 69% of restaurants are "adopting AI," and Toast's own
published survey claims 81–86% of operators are expanding or comfortable with AI. These are
disclosed here as vendor marketing research, not independent data, and should never be
quoted as if equivalent to the NRA or Deloitte figures. Trade commentary has begun naming
this pattern directly as "AI-washing" — vendors relabeling existing, non-AI features as
AI-powered, with one widely echoed observation that "most AI pilots aren't failing because
AI doesn't work... most of what's being sold as AI isn't AI, and most of what is AI isn't
solving the actual problem."

**Honest summary for this document's purposes**: real, verified AI adoption in restaurants
clusters around marketing and back-office administration (roughly 10–19% of operators),
customer-facing/ordering AI remains a small minority (6%), and no credible adoption
statistic exists at all for dynamic pricing or kitchen robotics at the sector level — those
claims, where they appear, are anecdotal chain pilots, not measured trends, and this document
states that gap explicitly rather than inventing a number. **This has a direct implication
for how Supplify should message any AI-adjacent feature** (e.g., the "AI-driven quick lists"
claim flagged as catalog-only in Part 1, §1.2): the market is currently skeptical of AI
claims that are not backed by demonstrated, narrow, operationally-grounded use cases, and a
vendor-inflation credibility gap is a real risk to avoid, not a marketing opportunity to
exploit.

## 2.10 Automation Trends in Back-Office Food-Service Operations

The same interest-versus-adoption pattern documented in AI recurs, at lower intensity, in
back-office automation generally. On accounts-payable automation specifically — the closest
analog to Supplify's invoicing/payment-reconciliation feature set — one AP-automation vendor
(methodology only partially disclosed, treated as medium-tier) reports that **74% of AP
teams operate with only partial automation, and 27% have no automation at all**; AI use
within AP processes is reported to have grown from 7% to 29% year-over-year — a large
percentage increase off a small base, consistent with early-stage adoption rather than
maturity (Source: [Factura.ai, Accounts Payable Automation Statistics](https://factura.ai/accounts-payable-automation-statistics/)).

On labor scheduling automation, the same inflation gap seen in AI recurs directly: generic
aggregator sources claim 70–75% adoption of automated scheduling, while a named trade-press
survey puts the more credible figure at **37% of restaurant operators who plan to adopt**
automated labor management systems — a materially lower, "intend to" rather than "have
done," figure (Source: [Restaurant Technology News](https://restauranttechnologynews.com/2025/03/market-research-37-of-restaurants-plan-to-adopt-automated-labor-management-systems/)).
No independently verified adoption statistic exists for automated purchasing/replenishment
specifically (par-level-triggered auto-ordering); available claims are vendor marketing
language without a named study behind them. **The consistent pattern across this entire
section**: the more specific and attributable a source is (a named survey, a consultancy, a
government body), the lower and more conservative its adoption figure tends to be — a
pattern this document treats as a reliability signal in itself, and one investors should be
told about rather than have hidden from them.

## 2.11 Global Trends Synthesis — What Matters Most for Supplify

Distilling §2.1–2.10 into the forces most relevant to Supplify's specific strategy:

1. **Software penetration is outpacing the industry it serves.** Restaurant management
   software is growing at roughly 14–17% CAGR (§2.4) against a foodservice industry growing
   at 3–12% depending on scope (§2.1) — clear evidence of rising digitization intensity per
   restaurant, not merely market growth. This validates category timing without requiring
   Supplify-specific traction to prove the category exists (repeating the logic already used
   in Part 1, §1.14).
2. **Off-premise and cloud-kitchen growth is restructuring supply-chain needs.** The
   fastest-growing food-service segment (cloud kitchens, 12–18% CAGR, §2.2) has the highest
   dependency on tight inventory, ordering, and receiving discipline of any segment — the
   exact operational core of Supplify's product, even though the company does not yet
   market to this segment specifically.
3. **AI hype has outrun deployment, and the market is starting to notice.** Concrete,
   named AI-deployment failures (Starbucks, McDonald's, a $100M franchisee lawsuit, §2.9)
   mean credibility, not AI-feature breadth, is now a differentiator. This is a direct
   argument for closing Part 1's disclosed gap between Platinum's marketed "AI-driven quick
   lists" and actual backend enforcement (§1.2) before it becomes a trust liability with a
   real paying customer.
4. **Operators are actively resisting fee-extractive intermediaries.** The 53% of operators
   trying to reduce third-party-delivery dependence over 10–30% commissions (§2.8) is
   direct market validation of Supplify's own no-take-rate business model choice (Part 1,
   §1.10) — restaurants are demonstrably fatigued with platforms that monetize by taking a
   cut of their transactions.
5. **Fragmentation, not lack of software, is the independent operator's actual problem.**
   The category is not undersupplied with point solutions (POS, scheduling, inventory,
   accounting each has its own vendor) — it is oversupplied with disconnected ones, forcing
   independents into multi-tool stacks (§2.3, §2.10). Supplify's single connected platform
   is a direct answer to a documented structural problem, not a hypothetical one.

## 2.12 Regional Trends — Lebanon

**Macroeconomic context.** Lebanon's economy is in an early, contested recovery from what
the World Bank has previously characterized as one of the most severe depressions globally
since the mid-1800s. Real GDP grew an estimated **3.5% in 2025** (revised down from an
earlier 4.7% projection), with the World Bank forecasting **4% growth in 2026**, contingent
on continued reform progress, tourism, and remittances
(Source: [World Bank, "Lebanon: Economic Rebound Marks Cautious Recovery," January 2026](https://www.worldbank.org/en/news/press-release/2026/01/22/lebanon-economic-rebound-marks-cautious-recovery-amidst-progress-on-reforms)).
A fiscal cash-basis surplus was expected in 2025, though Lebanon **remains outside
international capital markets** — it has no active financing access independent of the
country's own reserves.

**Inflation** peaked at an annual average of **222.42% in 2023**, following 171.2% (2022)
and 154.8% (2021) — three consecutive years of triple-digit inflation, with food-price
inflation reaching 350% year-on-year at its worst point
(Source: [Credit Libanais Economic Research](https://economics.creditlibanais.com/Article/212011)).
It decelerated sharply as the exchange rate stabilized (below): the World Bank's January
2026 report projects **15.2% inflation for 2025** and single-digit inflation for 2026 — but
**this forecast is directly contradicted by real-time monthly data**: bank-research sources
report year-on-year inflation re-accelerating through 2026, from 12.27% (February) to 20.0%
(April) and 19.04% (May), attributed to geopolitical and supply-chain/energy-cost pressure
(Source: [BLOMINVEST Bank](https://blog.blominvestbank.com/lebanons-inflation-rate-increased-by-19-04-yoy-by-may-2026/)).
**This document treats 2026 inflation as an open, contested data point, not a resolved
trend** — a material planning uncertainty for any business pricing in Lebanon.

**Currency stabilization**: the Lebanese pound has been genuinely stable since **August
2023**, per the World Bank (source above). BDL unified the official exchange rate at **LL
89,500/USD on 15 February 2024** — this was one of the IMF's prior-action conditions — and
the rate has held within a narrow band since; a June 2026 market data point shows **LL
89,573/USD**, essentially unchanged for roughly two and a half years
(Sources: [BDL, current exchange rates](https://bdl.gov.lb/currentrate.php); [TradingEconomics](https://tradingeconomics.com/lebanon/currency)).
This is a materially different situation from the chaotic multi-tier FX regime
(official/Sayrafa/black-market) that prevailed from 2020–2023, and is directly relevant to
Supplify's own pricing decision to denominate in USD.

**Capital controls remain informal but real.** No capital-controls law has been passed by
Parliament despite multiple attempts since 2020; banks continue to restrict foreign-currency
withdrawals via internal circulars rather than legislation. In July 2025, BDL's Basic
Decision No. 13729 _tightened_ — rather than loosened — restrictions on pre-2019 ("lollar")
foreign-currency accounts (Source: [Herbert Smith Freehills Kramer](https://www.hsfkramer.com/notes/arbitration/2025-06/foreign-currency-foreign-litigation-lebanon)).
Lebanon's Cabinet approved a draft "Gap Law" addressing bank losses and deposit resolution in
late December 2025, but it remains before Parliament, unenacted
(Source: [Bloomberg, 26 December 2025](https://www.bloomberg.com/news/articles/2025-12-26/lebanon-advances-law-aimed-at-freeing-up-trapped-bank-deposits)).
**No IMF program is currently in place**: Lebanon requested a new IMF-supported program in
March 2025, and IMF missions visited in May–June and September 2025, but as of the IMF's own
4 December 2025 press briefing, **no staff-level agreement had been reached**
(Source: [IMF press briefing transcript, 4 December 2025](https://www.imf.org/en/news/articles/2025/12/05/tr-12042025-press-briefing-transcript-julie-kozack-director-communications-dept-dec-4-2025)).
Lebanon's recovery to date is proceeding without external Fund backing.

**Digital payment adoption remains structurally low.** Only **23% of Lebanese adults had an
account with a bank, financial institution, or mobile-money provider in 2024**, up just 2
points from 21% in 2021 — one of the lowest financial-inclusion rates in the region, driven
by continued distrust of the banking system post-crisis
(Source: [World Bank Global Findex, cited via The Fintech Times](https://thefintechtimes.com/lebanon-and-its-fintech-ecosystem-developments-in-2026/)).
Cash and USD-denominated transactions remain dominant for this reason. E-wallet activity is
real but nascent — BDL has issued licenses since 2021 to providers including MyMonty,
PinPay, and Areeba, and issued a new regulatory circular for electronic payment providers in
January 2026 — but individual digital transactions remain capped at **US$300/day or
US$3,000/month** as of March 2025, a meaningful constraint on using digital rails for
larger B2B-style payments of the kind Supplify's platform is built to support (same
source; transaction-cap figure flagged as sourced through a trade blog rather than a
primary BDL circular and should be independently reconfirmed before external use). On the
positive side, the World Bank approved a **US$150 million "Lebanon Digital Acceleration
Project"** in January 2026, part of a broader $350 million financing package — an
institutional signal that Lebanon's digital and payments infrastructure is recognized as
underinvested and is now attracting development financing (same source).

**Restaurant sector specifics.** Establishment-count estimates conflict across sources and
should not be merged: Part 1 (§1.7) cited a derived estimate of **4,000–4,500
establishments** from headcount data; a separate trade outlet instead reports a contraction
from **~8,500 pre-2019 restaurants/cafés/nightlife venues to ~5,500 today**
(Source: [The Beiruter](https://www.thebeiruter.com/article/surviving-the-storm-inside-lebanon%E2%80%99s-resilient-restaurant-scene/566)).
Both figures are presented rather than reconciled, since neither traces to an official
business register. Despite the contraction, the sector shows a fresh-openings boom: **402
new restaurant brands were registered with Lebanon's Ministry of Economy between early and
late summer 2025**, per the Syndicate of Owners of Restaurants, Cafés, Nightclubs, and
Pastry Shops — a legitimate trade body, giving this figure reasonable provenance despite
being relayed through smaller outlets. The same industry source cautions that most new
entrants are inexperienced operators without feasibility studies, citing a sub-20% survival
rate for new entrants versus roughly 90% for established operators — a signal of possible
oversupply relative to demand in the current cycle (same source).

Restaurants began legally dollarizing menu prices in early 2023 as tourism recovered, hedging
against LBP volatility given that most restaurant inputs (imported meat, alcohol, generator
fuel) are USD-denominated (Source: [L'Orient Today](https://today.lorientlejour.com/article/1325107/with-the-crisis-here-to-stay-lebanons-restaurants-dollarize-menus.html));
with the LBP now stable since 2023, this practice has become the sector's permanent operating
norm rather than a temporary hedge. Tourism — the primary revenue driver for many Lebanese
restaurants — rebounded strongly in 2025 (**arrivals up 44.6% to ~1.635 million**) after a
war-driven trough in 2024 (**arrivals down 32.1% to 1.131 million**, per Lebanon's Tourism
Ministry) (Source: [L'Orient Today](https://today.lorientlejour.com/article/1448628/lebanons-tourist-arrivals-drop-32-percent-in-2024.html)).
Travel and tourism contributed an estimated **19.8% of Lebanon's GDP in 2024**, supporting
roughly 315,000 jobs — the highest tourism-dependence ratio in the Arab world by this measure
(Source: [WTTC, relayed via The Beiruter](https://www.thebeiruter.com/article/lebanon-tops-arab-countries-in-tourism-dependence/1758)).
National unemployment sits in the **25–30% range**, alongside a well-documented
post-crisis emigration of skilled workers, though no reliable, dated statistic quantifies
restaurant-sector-specific labor shortages or wage trends — this document does not invent
one. **No reliable public data exists quantifying restaurant POS or digital-ordering
penetration in Lebanon specifically** — searches surfaced only qualitative trade-press
commentary, no adoption percentages. This is a genuine data white space, which — read
positively — is also a proof point for Supplify's own market thesis: if no one has generated
this data yet, no incumbent platform has achieved meaningful penetration either.

## 2.13 Regional Trends — GCC (UAE, Saudi Arabia, Qatar, Kuwait)

Foodservice market-size estimates for each GCC country vary widely by provider (often
2–4x for the same country and year) — a pattern consistent with the rest of this document.
Figures below use Mordor Intelligence consistently across countries for comparability, with
lower-tier alternatives flagged separately.

| Country      | Foodservice market (2025/26 basis, Mordor Intelligence) | Forecast CAGR                                                                                                                                       | Notable local/regional restaurant-tech players                                                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UAE          | ~US$23–27 billion                                       | Fast-growing (17.55% CAGR to 2031 per Mordor); alternative estimates range US$13.6B–US$56B by 2034 depending on provider — wide spread, directional | **Supy** (Dubai, back-of-house inventory/procurement platform for multi-branch restaurants — closest direct structural comparable to Supplify), **Kaso/Elkaso** (Dubai/Saudi, YC-backed B2B restaurant-supplier procurement platform), **Kitopi** (Dubai, cloud-kitchen unicorn) |
| Saudi Arabia | ~US$30–32 billion                                       | 8.11% CAGR (2026–2031)                                                                                                                              | **Foodics** (Riyadh — dominant MENA restaurant POS/SaaS platform), **Sary** (Riyadh, B2B FMCG marketplace), **Retailo** (Saudi/UAE, B2B distribution for micro-retailers/restaurants)                                                                                            |
| Qatar        | ~US$2.0 billion                                         | 8.97% CAGR (2026–2031)                                                                                                                              | None identified — no Qatar-native restaurant-tech/procurement SaaS company was found in this research pass; Kitopi (UAE) operates cloud kitchens there as part of its regional footprint                                                                                         |
| Kuwait       | ~US$3.5–3.8 billion                                     | 8.34% CAGR                                                                                                                                          | None identified — same gap as Qatar; Kuwait's Kamco Invest (an investment firm, not an operator) acquired a stake in Foodics in July 2025, signaling Kuwaiti capital backing regional players rather than local operating champions                                              |

(Sources: [Mordor Intelligence — UAE](https://www.mordorintelligence.com/industry-reports/uae-foodservice-market), [Saudi Arabia](https://www.mordorintelligence.com/industry-reports/saudi-arabia-foodservice-market), [Qatar](https://www.mordorintelligence.com/industry-reports/qatar-foodservice-market), [Kuwait](https://www.mordorintelligence.com/industry-reports/kuwait-foodservice-market) foodservice market reports.)

**Two named competitors merit direct attention for Part 4 (competitive analysis)**: **Supy**
(Dubai, founded 2021) — an all-in-one back-of-house platform (inventory, procurement,
supplier management, BI) for multi-branch restaurant groups — raised a $1.5 million
pre-seed in 2021 and an $8 million seed in 2022, tripled revenue in 2025, and now operates
in 42 countries, up from 25 in 2024
(Sources: [Zawya](https://www.zawya.com/en/press-release/uae-based-supy-raises-15mln-in-funding-hlztock0), [The National](https://www.thenationalnews.com/business/start-ups/2022/07/06/uae-tech-start-up-supy-raises-8m-amid-expansion-push/)).
**Kaso** (formerly Elkaso, Dubai/Saudi, YC-backed, founded 2021) digitizes procurement
between restaurants and food suppliers directly — the single closest business-model
comparable to Supplify found anywhere in this research — raised $2.1 million pre-seed
(2021) and $10.5 million seed (2023), and claims 2,000+ suppliers and 5,000+ restaurants
across MENA (Source: [Y Combinator company profile](https://www.ycombinator.com/companies/kaso)).
**Foodics** (Riyadh) is the dominant restaurant POS/SaaS platform across MENA, with 33,500+
active branches and reported H1 2025 GMV of US$6 billion, having raised a $170 million
Series C in 2022 — the largest SaaS Series C in MENA history at the time — and it has
already extended into inventory-management partnerships (with Kaso) and acquisitions
(Jordan's POSRocket) that put it in adjacent territory to Supplify's own category
(Source: [Foodics press release](https://www.foodics.com/press/saas-series-c-funding/)).

**Digitization investment context**: the UAE's national Digital Economy Strategy (launched 2022) targets doubling the digital economy's GDP contribution from 9.7% (2022) to 19.4% by
2031, with SMEs as an explicit pillar
(Source: [U.AE, Digital Economy Strategy](https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/strategies-plans-and-visions/finance-and-economy/digital-economy-strategy)).
Saudi Arabia's Vision 2030 targets SMEs contributing 35% of GDP by 2030, backed by a
dedicated SME authority (Monshaat) publishing digital-transformation guidance
(Source: [Vision2030.gov.sa](https://www.vision2030.gov.sa/en/explore/programs/national-transformation-program)).
GCC-wide B2B e-commerce specifically is projected to reach US$182 billion by 2035 with the
highest CAGR (15.97%, 2026–2031) of any e-commerce category tracked — directly consistent
with, though not a substitute for evidence of, Supplify's own B2B thesis (directional,
mid-tier source). No comparably specific, named digital-economy strategy document was found
for Qatar or Kuwait in this research pass — a genuine gap, not filled with a guess.

## 2.14 Regional Trends — Wider MENA

There is no single authoritative MENA-wide foodservice market figure; estimates for
2024/2025 cluster loosely in the **US$90–115 billion range**, with high-single-digit to
mid-teens CAGRs depending on country mix and provider (Sources: [Fortune Business Insights](https://www.fortunebusinessinsights.com/mena-food-service-market-110044), [Cognitive Market Research](https://www.cognitivemarketresearch.com/regional-analysis/middle-east-and-africa-food-service-market-report)).
Egypt — the largest "wider MENA, non-GCC" market on Supplify's eventual expansion path —
shows a particularly wide range (US$9–30 billion depending on provider), which this
document flags as a known data-quality limitation rather than resolving arbitrarily
(Source: [Mordor Intelligence — Egypt Foodservice Market](https://www.mordorintelligence.com/industry-reports/egypt-foodservice-market)).

**Digital and payments infrastructure across MENA is improving but still fragmented.**
MENA e-commerce reached **US$34.5 billion in 2024** (+13% year-on-year), projected to reach
**US$57.8 billion by 2029**
(Source: [Digital Commerce 360, citing EZDubai's MENA E-Commerce Report 2024](https://www.digitalcommerce360.com/2025/05/27/mena-ecommerce-market-57-billion-by-2029/)).
Roughly two-thirds of the population across Northern Africa and Western Asia use the
internet as of early 2025, and smartphone subscriptions are projected to rise from 540
million (2024) to 710 million by 2030
(Source: [Statista, Internet usage in MENA](https://www.statista.com/topics/5550/internet-usage-in-mena/)).
On the venture side, **MAGNiTT** — the standard authoritative source for MENA startup
funding — reports a sharp rebound: MENA startups raised **US$1.9 billion in FY2024** (a 44%
year-on-year decline) but **US$3.8 billion across 688 deals in FY2025**, a 74% increase,
with Saudi Arabia leading (Source: [MAGNiTT FY2024/Q1 2025 reports](https://magnitt.com/research/2024-MENA-Venture-Investment-Premium-Report-50966)).
Food-and-beverage-specific MENA venture data was not available at current granularity — the
most recent public F&B-specific MAGNiTT figure located dates to 2019 and is too stale to
cite as current context.

**Named non-GCC MENA comparables** relevant to Supplify's eventual wider-MENA expansion:
**MaxAB** (Cairo) — a B2B food and grocery distribution platform that raised over $100
million and served 150,000+ traditional retailers before merging with **Capiter** in 2023
(a competitor that had itself raised $33 million); both have since faced reported financial
distress, a cautionary data point on the capital intensity and execution risk of B2B food
distribution platforms at scale
(Source: [TechCrunch](https://techcrunch.com/2022/10/19/maxab-an-egyptian-b2b-e-commerce-platform-for-food-and-grocery-supplies-nabs-40m/)).
**OneOrder** (Cairo) — a smaller, more directly Supplify-comparable B2B food-supply platform
for hotels, restaurants, and cafés — secured a $6.5 million working-capital facility
(Source: [Enterprise Bureau](https://enterprisebureau.org/oneorder-an-egyptian-restaurant-tech-startup-has-secured-a-6-5-million-funding/)).

**Regulatory fragmentation is structural, not incidental**, and directly shapes how Supplify
should sequence expansion. VAT rates alone vary sharply across the company's target
markets: UAE and Oman at 5%, Lebanon at 11%, Egypt at 14%, Saudi Arabia at 15%, and Jordan
around 16% (Source: [vatabout.com](https://vatabout.com/vat-regulatory-harmonization-in-the-mena-region)).
GCC states share a Common VAT Framework, giving that bloc a meaningfully more harmonized
starting point than "wider MENA," which reinforces the GCC-before-wider-MENA sequencing
already stated in Part 1 (§1.6). Currency regimes diverge just as sharply: most GCC
currencies are pegged to the US dollar, offering settlement stability that Lebanon's
post-2019 LBP volatility has not had (Source: [Brookings, on GCC currency pegs](https://www.brookings.edu/articles/sustaining-the-gcc-currency-pegs-the-need-for-collaboration/)).
One piece of improving shared infrastructure is worth noting for future payments
architecture: **Buna**, the Arab Regional Payment System operated by the Arab Monetary Fund,
clears and settles in six currencies (USD, EUR, SAR, EGP, JOD, AED) — covering Saudi Arabia,
Egypt, Jordan, and the UAE, much of Supplify's GCC-to-wider-MENA path, though not yet
Lebanon — with over 110 financial institutions onboarded and roughly 15,000 monthly
transactions growing ~15% month-on-month (Source: [Mastercard press release on joining Buna, November 2024](https://newsroom.mastercard.com/news/press/2024/november/mastercard-joins-buna-the-arab-regional-payment-system/)).

## 2.15 Future Trends — 3–5 Year Outlook Relevant to Supplify's Roadmap

- **Continued off-premise and cloud-kitchen growth** (§2.2) will keep pushing operational
  intensity — tighter inventory, more frequent ordering, more receiving events — up, not
  down, reinforcing demand for the operational depth Supplify already has built rather than
  a lighter-weight ordering tool.
- **AI is likely to mature from broad hype toward a small number of narrow, ROI-proven use
  cases** — marketing and administrative automation, where real adoption already
  concentrates (§2.9) — rather than the customer-facing, order-taking AI most heavily
  marketed today. Vendors that can demonstrate measured outcomes, not AI-feature breadth,
  are likely to hold a credibility advantage as buyer skepticism rises.
- **Consolidation in restaurant-tech is already underway in MENA specifically** (Foodics
  acquiring POSRocket; MaxAB and Capiter merging under distress) and is likely to continue —
  both a competitive risk (well-capitalized regional platforms like Foodics expanding
  feature scope into procurement/inventory) and a potential exit pathway for a
  well-positioned, profitable niche player.
- **Embedded fintech is emerging as a second revenue layer in vertical restaurant/procurement
  SaaS** — Kaso's addition of an F&B fintech vertical (payments, credit) alongside its core
  procurement product is a directly relevant precedent. Part 1 (§1.10) states Supplify
  deliberately does not take a transaction cut today; this trend is a future optionality
  worth revisiting once the company has real payment-volume data, not a reason to change
  course pre-launch.
- **Regional payments and regulatory infrastructure is slowly converging** (Buna's
  multi-currency rail, GCC's Common VAT Framework, UAE/Saudi digital-economy strategies),
  which modestly lowers the operational cost of Supplify's stated Lebanon → GCC → wider
  MENA sequencing over the next 3–5 years, even though full harmonization remains distant.

## 2.16 Forecasts — Consolidated Figures Used in This Part

| Metric                                                                  | Figure                                                                | Source                                                                                                                                                                                                                                         | Confidence                                                                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Global foodservice market (narrower scope)                              | US$3.10T (2023) → US$3.79T (2030), 2.9% CAGR                          | [Grand View Research](https://www.grandviewresearch.com/industry-analysis/foodservice-market-report)                                                                                                                                           | High                                                                               |
| Global foodservice market (broader scope)                               | US$4.34T (2025) → US$7.61T (2030), 11.89% CAGR                        | [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/food-service-market)                                                                                                                                                 | High (but not reconcilable with the GVR figure — different scope)                  |
| Global cloud/ghost kitchen market                                       | ~US$70–90B (2025), 12–18% CAGR                                        | [Grand View Research](https://www.grandviewresearch.com/industry-analysis/cloud-kitchen-market); [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/food-service-market)                                                | Medium-High (convergent range across 4+ sources)                                   |
| Global restaurant management software market                            | US$5.79B (2024) → US$14.70B (2030), 17.4% CAGR                        | [Grand View Research](https://www.grandviewresearch.com/industry-analysis/restaurant-management-software-market)                                                                                                                               | High (corroborated by Straits Research within same order of magnitude)             |
| Global procurement software market (all industries)                     | US$10.06B (2025) → US$21.29B (2033), 10.0% CAGR                       | [Grand View Research](https://www.grandviewresearch.com/industry-analysis/procurement-software-market-report)                                                                                                                                  | High                                                                               |
| "Restaurant procurement software" market (narrow claim, used in Part 1) | US$1.2–1.4B (2024) → US$3.4–3.5B (2033), 10–13% CAGR                  | [DataIntelo](https://dataintelo.com/report/restaurant-procurement-software-market); [MarketIntelo](https://marketintelo.com/report/restaurant-procurement-software-market)                                                                     | **Low** — no independent corroboration found; retained only as directional         |
| Cloud ERP adoption share of new implementations                         | 78.6% (2024) → 75% (2025) chose cloud                                 | [Panorama Consulting Group](https://www.panorama-consulting.com/resource-center/erp-report-archives/)                                                                                                                                          | High (independent consultancy survey)                                              |
| Food service share of global food waste                                 | 28% of 1.05B tonnes wasted (2022)                                     | [UNEP Food Waste Index 2024](https://www.unep.org/resources/publication/food-waste-index-report-2024)                                                                                                                                          | High                                                                               |
| Restaurants reporting current AI tool use                               | 26% (2026)                                                            | [NRA, via Restaurant Dive](https://www.restaurantdive.com/news/national-restaurant-assocation-operator-artificial-intelligence-adoption/812418/)                                                                                               | High                                                                               |
| Restaurants using AI for order-taking specifically                      | 6% (2026)                                                             | Same as above                                                                                                                                                                                                                                  | High                                                                               |
| Lebanon real GDP growth                                                 | 3.5% (2025 actual), 4% (2026 forecast)                                | [World Bank, January 2026](https://www.worldbank.org/en/news/press-release/2026/01/22/lebanon-economic-rebound-marks-cautious-recovery-amidst-progress-on-reforms)                                                                             | High                                                                               |
| Lebanon LBP/USD exchange rate                                           | Stable at ~89,500 since Feb 2024 (unified), stable since Aug 2023     | [BDL](https://bdl.gov.lb/currentrate.php); [World Bank](https://www.worldbank.org/en/news/press-release/2026/01/22/lebanon-economic-rebound-marks-cautious-recovery-amidst-progress-on-reforms)                                                | High                                                                               |
| Lebanon adults with a bank/mobile-money account                         | 23% (2024)                                                            | [World Bank Global Findex](https://thefintechtimes.com/lebanon-and-its-fintech-ecosystem-developments-in-2026/)                                                                                                                                | High                                                                               |
| UAE foodservice market                                                  | US$23–27B (2025/26, Mordor basis); range US$13.6–56B across providers | [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/uae-foodservice-market)                                                                                                                                              | Medium (wide cross-provider variance)                                              |
| Saudi Arabia foodservice market                                         | US$30–32B (2025/26), 8.11% CAGR                                       | [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/saudi-arabia-foodservice-market)                                                                                                                                     | Medium-High                                                                        |
| MENA-wide foodservice market                                            | ~US$90–115B (2024/25)                                                 | [Fortune Business Insights](https://www.fortunebusinessinsights.com/mena-food-service-market-110044); [Cognitive Market Research](https://www.cognitivemarketresearch.com/regional-analysis/middle-east-and-africa-food-service-market-report) | Low-Medium (wide variance, internally inconsistent figures in at least one source) |
| MENA startup venture funding                                            | US$1.9B (FY2024) → US$3.8B (FY2025), +74% YoY                         | [MAGNiTT](https://magnitt.com/research/2024-MENA-Venture-Investment-Premium-Report-50966)                                                                                                                                                      | High (MAGNiTT is the recognized authoritative MENA venture-data source)            |

---

### Sources & assumptions used in this part

- Global restaurant/foodservice sizing: [Grand View Research, Foodservice Market Report](https://www.grandviewresearch.com/industry-analysis/foodservice-market-report); [Mordor Intelligence, Food Service Market](https://www.mordorintelligence.com/industry-reports/food-service-market); [IBISWorld, Global Fast Food Restaurants](https://www.ibisworld.com/global/industry/global-fast-food-restaurants/1480/); [Statista, food service units worldwide](https://www.statista.com/statistics/1240159/number-of-food-service-establishments-worldwide-by-country/); [Statista, chain vs. independent sales share (2014)](https://www.statista.com/statistics/491986/foodservice-sales-of-chain-and-independent-restaurants-worldwide/).
- Segment sizing (QSR, casual dining, hotel F&B, catering, cloud kitchens): [Precedence Research](https://www.precedenceresearch.com/quick-service-restaurant-market); [Fortune Business Insights](https://www.fortunebusinessinsights.com/quick-service-restaurants-market-103236); [Mordor Intelligence, QSR](https://www.mordorintelligence.com/industry-reports/quick-service-restaurants-market); [Business Research Insights, casual dining](https://www.businessresearchinsights.com/market-reports/casual-dining-market-117489); [dataintelo, hotel F&B](https://dataintelo.com/report/hotel-food-and-beverage-market); [Business Research Insights, hotel F&B service](https://www.businessresearchinsights.com/market-reports/hotel-food-and-beverage-service-market-117635); [IMARC, catering](https://www.imarcgroup.com/catering-services-market); [Technavio, catering](https://www.technavio.com/report/catering-services-market-industry-analysis); [Grand View Research, cloud kitchen](https://www.grandviewresearch.com/industry-analysis/cloud-kitchen-market).
- Digital transformation / adoption drivers: [Restaurant Dive, NRA AI/tech adoption coverage](https://www.restaurantdive.com/news/national-restaurant-assocation-operator-artificial-intelligence-adoption/812418/); [Toast, State of the Restaurant Industry 2026](https://pos.toasttab.com/blog/on-the-line/state-of-the-restaurant-industry-2025) (vendor source, disclosed); [Modern Restaurant Management, labor cost data](https://modernrestaurantmanagement.com/restaurants-challenged-to-manage-the-cost-inflation-margin-squeeze-in-2026/).
- Restaurant SaaS/POS/inventory software sizing: [Grand View Research, Restaurant Management Software](https://www.grandviewresearch.com/industry-analysis/restaurant-management-software-market); [Straits Research](https://straitsresearch.com/report/restaurant-management-software-market); [Grand View Research, Restaurant POS Terminal Market](https://www.grandviewresearch.com/industry-analysis/restaurant-point-of-sale-pos-terminal-market); [DataInsightsMarket](https://www.datainsightsmarket.com/reports/restaurant-inventory-management-software-1387595); [VerifiedMarketReports](https://www.verifiedmarketreports.com/product/restaurant-inventory-management-and-purchasing-software-market/).
- Procurement software cross-check: [DataIntelo](https://dataintelo.com/report/restaurant-procurement-software-market); [MarketIntelo](https://marketintelo.com/report/restaurant-procurement-software-market); [Grand View Research, Procurement Software Market](https://www.grandviewresearch.com/industry-analysis/procurement-software-market-report); [Mordor Intelligence, Procurement Software Market](https://www.mordorintelligence.com/industry-reports/procurement-software-market).
- Cloud ERP: [Panorama Consulting Group](https://www.panorama-consulting.com/resource-center/erp-report-archives/); [Virtue Market Research, F&B ERP](https://virtuemarketresearch.com/report/food-and-beverage-erp-solution-market).
- Food waste / perishables: [UNEP, Food Waste Index Report 2024](https://www.unep.org/resources/publication/food-waste-index-report-2024); [WRAP](https://www.wrap.ngo/resources/report/overview-waste-hospitality-and-food-service-sector); [ReFED](https://refed.org/food-waste/consumer-food-waste); [McKinsey, "A taste of what's next"](https://www.mckinsey.com/industries/retail/our-insights/a-taste-of-whats-next-perspectives-on-the-future-of-restaurants).
- POS/KDS/delivery trends: [Hospitality Technology, 2025 Restaurant Technology Study](https://hospitalitytech.com/pos-software-2025-key-trends-and-features-horizon); [DoorDash Merchants blog](https://merchants.doordash.com/en-us/blog/food-delivery-statistics); [Statista, delivery market share](https://www.statista.com/statistics/1235724/market-share-us-food-delivery-companies/); [Restaurant Business Online](https://www.restaurantbusinessonline.com/technology/third-party-delivery-booms-some-restaurants-pump-brakes).
- AI adoption: [Restaurant Dive, NRA coverage](https://www.restaurantdive.com/news/national-restaurant-assocation-operator-artificial-intelligence-adoption/812418/); [Deloitte, "How AI is Revolutionizing Restaurants"](https://www.deloitte.com/us/en/about/press-room/deloitte-how-ai-is-revolutionizing-restaurants.html); [Restaurant Dive, "Restaurant tech execs warn against AI overdependence"](https://www.restaurantdive.com/news/restaurant-technology-executives-warn-against-ai-overdependence/821024/).
- Back-office automation: [Factura.ai](https://factura.ai/accounts-payable-automation-statistics/); [Restaurant Technology News](https://restauranttechnologynews.com/2025/03/market-research-37-of-restaurants-plan-to-adopt-automated-labor-management-systems/).
- Lebanon: [World Bank, January 2026 press release](https://www.worldbank.org/en/news/press-release/2026/01/22/lebanon-economic-rebound-marks-cautious-recovery-amidst-progress-on-reforms); [Credit Libanais Economic Research](https://economics.creditlibanais.com/Article/212011); [BLOMINVEST Bank](https://blog.blominvestbank.com/lebanons-inflation-rate-increased-by-19-04-yoy-by-may-2026/); [BDL](https://bdl.gov.lb/currentrate.php); [TradingEconomics](https://tradingeconomics.com/lebanon/currency); [Herbert Smith Freehills Kramer](https://www.hsfkramer.com/notes/arbitration/2025-06/foreign-currency-foreign-litigation-lebanon); [Bloomberg](https://www.bloomberg.com/news/articles/2025-12-26/lebanon-advances-law-aimed-at-freeing-up-trapped-bank-deposits); [IMF press briefing](https://www.imf.org/en/news/articles/2025/12/05/tr-12042025-press-briefing-transcript-julie-kozack-director-communications-dept-dec-4-2025); [The Fintech Times](https://thefintechtimes.com/lebanon-and-its-fintech-ecosystem-developments-in-2026/); [The Beiruter](https://www.thebeiruter.com/article/surviving-the-storm-inside-lebanon%E2%80%99s-resilient-restaurant-scene/566); [L'Orient Today, dollarization](https://today.lorientlejour.com/article/1325107/with-the-crisis-here-to-stay-lebanons-restaurants-dollarize-menus.html); [L'Orient Today, tourist arrivals](https://today.lorientlejour.com/article/1448628/lebanons-tourist-arrivals-drop-32-percent-in-2024.html); [WTTC, via The Beiruter](https://www.thebeiruter.com/article/lebanon-tops-arab-countries-in-tourism-dependence/1758).
- GCC: [Mordor Intelligence country foodservice reports (UAE, Saudi Arabia, Qatar, Kuwait)](https://www.mordorintelligence.com/industry-reports/uae-foodservice-market); [Zawya](https://www.zawya.com/en/press-release/uae-based-supy-raises-15mln-in-funding-hlztock0); [The National](https://www.thenationalnews.com/business/start-ups/2022/07/06/uae-tech-start-up-supy-raises-8m-amid-expansion-push/); [Y Combinator, Kaso](https://www.ycombinator.com/companies/kaso); [Foodics press release](https://www.foodics.com/press/saas-series-c-funding/); [U.AE Digital Economy Strategy](https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/strategies-plans-and-visions/finance-and-economy/digital-economy-strategy); [Vision2030.gov.sa](https://www.vision2030.gov.sa/en/explore/programs/national-transformation-program).
- Wider MENA: [Fortune Business Insights](https://www.fortunebusinessinsights.com/mena-food-service-market-110044); [Cognitive Market Research](https://www.cognitivemarketresearch.com/regional-analysis/middle-east-and-africa-food-service-market-report); [Mordor Intelligence, Egypt](https://www.mordorintelligence.com/industry-reports/egypt-foodservice-market); [Digital Commerce 360](https://www.digitalcommerce360.com/2025/05/27/mena-ecommerce-market-57-billion-by-2029/); [Statista, MENA internet usage](https://www.statista.com/topics/5550/internet-usage-in-mena/); [MAGNiTT](https://magnitt.com/research/2024-MENA-Venture-Investment-Premium-Report-50966); [TechCrunch, MaxAB](https://techcrunch.com/2022/10/19/maxab-an-egyptian-b2b-e-commerce-platform-for-food-and-grocery-supplies-nabs-40m/); [Enterprise Bureau, OneOrder](https://enterprisebureau.org/oneorder-an-egyptian-restaurant-tech-startup-has-secured-a-6-5-million-funding/); [vatabout.com](https://vatabout.com/vat-regulatory-harmonization-in-the-mena-region); [Brookings, GCC currency pegs](https://www.brookings.edu/articles/sustaining-the-gcc-currency-pegs-the-need-for-collaboration/); [Mastercard, Buna](https://newsroom.mastercard.com/news/press/2024/november/mastercard-joins-buna-the-arab-regional-payment-system/).

**Data-quality caveats carried forward explicitly**: (1) foodservice and restaurant-software
market-size figures vary widely by provider throughout this document — ranges, not single
numbers, are used wherever the spread exceeds roughly 2x; (2) the "restaurant procurement
software" figure inherited from Part 1 remains uncorroborated by any higher-tier source and
should be re-verified or replaced before this document is shown to sophisticated investors;
(3) Lebanon's 2026 inflation trajectory is genuinely contested between an official
institutional forecast (World Bank) and more recent monthly bank-research data — this
document reports both rather than resolving the conflict; (4) no Qatar-native or
Kuwait-native restaurant-tech company was identified in this research pass — this is stated
as an absence of evidence, not evidence of absence.

### Implications for Supplify

- **Lebanon-first is defensible on data, not just founder access.** Lebanon's currency has
  been genuinely stable for over two years (§2.12), tourism-driven restaurant demand
  rebounded sharply in 2025, and — critically — no reliable public data exists on
  restaurant digital-ordering/POS penetration there, meaning Supplify would be establishing
  a market data baseline, not fighting an entrenched, well-measured incumbent.
- **The 2026 Lebanese inflation re-acceleration (§2.12) is a real planning risk**, not a
  resolved tailwind — Supplify's USD-denominated pricing ($49–$349) partially insulates the
  company, but restaurant customers' own LBP-denominated cost bases remain exposed, which
  should inform how aggressively Silver-tier pricing is held firm during the Lebanon launch.
- **The no-take-rate business model (Part 1, §1.10) is validated by real operator
  sentiment**: 53% of operators are actively trying to reduce dependence on
  commission-charging intermediaries (§2.8) — Supplify's flat-subscription model is a
  direct answer to a documented preference, and this should be a explicit selling point in
  Lebanon and GCC sales conversations, not just an internal pricing philosophy.
- **GCC-next sequencing should prioritize UAE and Saudi Arabia over Qatar and Kuwait**, not
  only for market size (§2.13) but because UAE and Saudi Arabia already have named,
  funded, structurally similar competitors (Supy, Kaso, Foodics) whose existence proves
  buyer demand — whereas Qatar and Kuwait show no local incumbent, which is upside
  (less competition) balanced against the absence of any evidence a market for this
  specific product category has been validated there yet.
- **Kaso and Supy are the two competitors requiring the deepest treatment in Part 4** — both
  are structurally closer to Supplify (B2B restaurant-supplier procurement/inventory SaaS)
  than Foodics (primarily POS), and both are already operating in Supplify's stated GCC
  target markets with real funding and traction.
- **The catalog-only "AI-driven quick lists" gap flagged in Part 1 (§1.2) was closed in July
  2026** (`resolveQuickListCapabilities()`, forecast-based quantities + suggest — see
  `docs/features/ai-quick-lists.md`). Sophisticated buyers may still test other Platinum
  strings (developer API, central purchasing, advanced reports) — those remain catalog-only
  per `docs/product/PLATINUM_CATALOG_ONLY_FEATURES.md`. Named enterprise AI-deployment
  failures (Starbucks, McDonald's, a $100M franchisee lawsuit, §2.9) still mean **honest,
  testable claims** matter in sales and diligence — but quick-list AI is no longer a
  credibility liability.
- **Packaging/cleaning/equipment category expansion (Part 1, §1.6) has no dedicated market
  sizing in this research pass** — none of the sources consulted size B2B software or
  marketplace demand for these adjacent supplier categories specifically. This is a genuine
  research gap for Part 5 (Ansoff Matrix) to address directly, likely through a bottom-up
  estimate rather than a top-down industry figure, since none appears to exist.
- **The cloud-kitchen segment (12–18% CAGR, the fastest-growing in foodservice, §2.2) is a
  candidate underserved segment for Supplify** given its structural dependence on tight
  inventory/ordering discipline — worth explicit consideration in Part 3's
  segmentation work, even though it is not part of the current GTM plan.
