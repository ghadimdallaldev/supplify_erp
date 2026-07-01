# Part 8 — Marketing Research

**Document status:** Draft, part 8 of 16. Builds directly on [Part 3](./03_market_research.md)
(segmentation, personas, customer journey), [Part 4](./04_competitor_research.md) (competitive
landscape and messaging benchmarks), and [Part 7](./07_business_strategy.md) (pricing ladder,
trial design, retention mechanics). Cross-references product and sales collateral in
`docs/sales/*.md` and `docs/product/monetization-ux.md`. Part 9 (Marketing Plan) depends on
this part for channel prioritization and message architecture.

**A standing disclosure carried from every prior part:** Supplify is **pre-launch** and
**bootstrapped**, with **zero live paying tenants** today. Nothing in this part is derived
from customer interviews, brand-tracking surveys, A/B tests, SEO performance data, or paid
campaign results — because none exist. Where this part recommends positioning, messaging,
channels, or keyword targets, it either (a) cites external third-party research from Parts
2–4, (b) restates verified product and pricing facts from the codebase and internal docs, or
(c) is explicitly labeled an **illustrative hypothesis** for founder validation before spend
is committed.

---

## 8.1 Purpose and Scope

Marketing research, in the context of a pre-launch B2B SaaS company with no marketing budget
and no sales team, is not primarily about audience size estimation or channel ROI forecasting.
Those require cohort data Supplify does not yet have. The purpose of this part is narrower and
more actionable:

1. **Define what Supplify should say** — brand identity, positioning statement, and message
   hierarchy — grounded in verified product capabilities and competitive white space, not
   aspirational feature claims.
2. **Define to whom it should say it** — marketing-facing persona profiles derived from Part 3,
   with explicit channel and message implications for each.
3. **Define where discovery should happen first** — channel and SEO strategy sequenced for a
   founder-led, near-zero-cash GTM in Lebanon, with GCC deferred until Part 14.

This part does **not** produce a month-by-month marketing calendar, media budget, or creative
briefs — those belong to Part 9. It also does not duplicate Part 10's sales motion; instead,
it specifies the **awareness and consideration** layer that feeds the sales funnel Part 10
already mapped to product touchpoints.

---

## 8.2 Brand Architecture

### 8.2.1 Brand foundation (verified internal source)

Supplify's only codified brand guidance today lives in `PRODUCT.md`, not in a separate brand
guidelines document. The following attributes are **verified product-design facts**, not
marketing hypotheses:

| Attribute              | Stated value                                                                                  | Source                          |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------------------------- |
| Brand personality      | Confident, crisp, modern — **precise, calm, premium**                                         | `PRODUCT.md`, Brand Personality |
| Voice                  | Direct and plain; UI disappears into the task                                                 | `PRODUCT.md`                    |
| Visual anti-references | Generic enterprise ERP chrome (SAP/NetSuite/Odoo), bootstrap admin templates, over-decoration | `PRODUCT.md`, Anti-references   |
| Design principles      | One width everywhere; confident hierarchy; restrained violet accent; motion conveys state     | `PRODUCT.md`, Design Principles |

Part 1 (§1.3–§1.5) proposes vision, mission, and values that have **not yet been founder-
confirmed**. Marketing should treat those as draft inputs, not locked brand copy, until the
founder signs off. What _is_ locked is the product-design personality brief above — marketing
and product voice should be aligned to it.

### 8.2.2 Brand name and category label

**"Supplify"** functions as both company and product name today. No sub-brand architecture
(restaurant product vs. supplier product vs. admin) exists in the codebase or docs. For
marketing purposes, a single master brand with **role-contextual messaging** (restaurant-
facing vs. supplier-facing value props) is the correct structure — mirroring how the product
already presents itself (`docs/sales/02_solution.md` splits benefits by side without splitting
the brand).

**Category label** is an unresolved marketing decision with competitive implications. Part 4
documents that Supplify occupies a hybrid category no competitor fully replicates: two-sided
restaurant–supplier marketplace plus operational depth (inventory, fulfillment, invoicing).
Competitors cluster into distinct labels buyers already search for:

| Competitor archetype  | Category label buyers use                                            | Example               |
| --------------------- | -------------------------------------------------------------------- | --------------------- |
| Global back-office    | "Restaurant inventory management," "restaurant procurement software" | MarketMan, MarginEdge |
| MENA-native           | "Restaurant management system," "hospitality ERP"                    | Supy, Foodics         |
| Two-sided marketplace | "Restaurant ordering platform," "food supplier marketplace"          | Choco, BlueCart       |
| POS-anchored          | "Restaurant POS" (procurement is bolt-on)                            | Toast, Foodics        |

**Recommendation (hypothesis, not tested):** lead with **"restaurant supply platform"** or
**"restaurant–supplier operations platform"** in English collateral, and equivalent plain-
language Arabic phrasing in bilingual materials — avoiding "ERP" in primary consumer-facing
copy (consistent with `PRODUCT.md`'s anti-reference to enterprise ERP aesthetics) while
retaining "operations platform" to signal depth beyond a lightweight ordering portal. The
exact Arabic category term should be validated with 5–10 prospect conversations before
committing to paid search or print collateral; no search-volume data for Arabic procurement
terms in Lebanon was found in this research pass.

### 8.2.3 Trust signals the brand can and cannot claim today

Part 1 (§1.5) states "Trust is the product." Pre-launch, marketing can credibly lead with
**product depth** (specific shipped features), **pricing transparency** (public Silver/Gold/
Platinum tiers vs. sales-gated competitors like Supy from $250/mo — Part 4 §4.3.1), and
**regional identity** (Lebanon-first, bilingual schema — with Arabic UI completeness unverified,
Part 4 §4.9.6). It cannot lead with customer logos, G2/Capterra reviews, or AI claims
(Platinum smart quick lists are **backend-enforced** as of July 2026 — `docs/features/ai-quick-lists.md`).
Pre-launch brand marketing should
emphasize specificity and transparency over social proof — consistent with Part 1's "precision
over decoration" value.

---

## 8.3 Positioning Strategy

### 8.3.1 Positioning statement (recommended draft)

The following positioning statement synthesizes Part 1's value proposition (§1.9), Part 3's
segment focus (§3.1.2), and Part 4's white-space finding (§4.9.2). It is a **recommended
draft for founder confirmation**, not a tested message:

> **For independent restaurants and food distributors in Lebanon and the wider MENA region**
> who coordinate ordering, inventory, and payments across fragmented phone, WhatsApp, and
> spreadsheet workflows, **Supplify is the restaurant–supplier operations platform** that
> connects both sides in one system — with the multi-branch depth chains expect and the
> self-serve pricing independents can afford. **Unlike** sales-gated hospitality ERPs
> (Supy, MarketMan-class tools) or POS-first platforms with bolt-on procurement (Foodics),
> Supplify is built two-sided from day one: restaurants order, suppliers fulfill, and both
> reconcile in the same platform — starting at **$49/month**, not $250+.

Each clause maps to a verified fact or a labeled competitive inference:

- "Fragmented phone, WhatsApp, and spreadsheet workflows" — `docs/sales/01_problem.md`, Part 1
  §1.7; not a quantified hours-lost statistic (Part 3 §3.4 explicitly avoids fabricating one).
- "$49/month" vs. "$250+" — Part 7 §7.2 vs. Supy pricing (Part 4 §4.3.1).
- "Two-sided from day one" — Part 4 §4.9.2; no competitor ships the same combination at this
  price band with self-serve signup.
- "Multi-branch depth chains expect" — Gold/Platinum capabilities verified in `tier-matrix.md`;
  "depth" claim is honest; "years of production proof" is not — Supplify has none yet.

### 8.3.2 Positioning axes

Two axes define Supplify's competitive frame for marketing purposes:

**Axis 1 — Operational depth vs. ordering-only**

```
Ordering-only / marketplace          Full operations platform
(Choco free-restaurant model)   ←→   (Supplify, Supy, MarketMan)
                                      Supplify target: "full ops,
                                      two-sided, self-serve entry"
```

Choco's documented pivot toward supplier/fintech monetization and layoffs (Part 4 §4.5.1)
suggests pure marketplace positioning is unstable. Supplify's subscription-first model (Part 7
§7.5) is structurally more defensible — a message worth carrying into investor and partner
conversations, stated as a **structural observation**, not a prediction of Choco's outcome.

**Axis 2 — Enterprise-gated vs. self-serve accessible**

```
Sales-gated / opaque pricing         Transparent self-serve
(Supy $250+, R365, BlueCart)    ←→   (Supplify Silver $49, MarketMan US-only)
                                      Supplify wedge: MENA + two-sided + self-serve
```

Part 4 §4.9.3 documents a recurring weakness pattern across competitor reviews: slow support,
long onboarding, opaque contracts. Supplify can **position against this pattern** — but Part 4
also states this wedge is "evidenced in competitor reviews, not yet proven for Supplify" (§4.9.3).
Marketing copy should promise fast self-serve trial activation (verified: no card required,
`docs/features/tenant-registration.md`) rather than claim superior support before a support
track record exists.

### 8.3.3 Side-specific value propositions

Marketing must maintain **two parallel message tracks** without splitting the brand. Part 3
(§3.4) and `docs/sales/02_solution.md` provide the substance:

| Side           | Primary promise                                                          | Proof point (verifiable)                                                                                               | What not to say                                                                                                                            |
| -------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Restaurant** | One place to order, receive, and pay across all your suppliers           | Unified cart/checkout, receiving with quality capture, chat scoped to orders                                           | "Save X hours per week" — no sourced figure exists (Part 3 §3.4)                                                                           |
| **Supplier**   | All orders in one system; grow your restaurant customer base on-platform | Fulfillment board, driver dispatch/GPS, customer-import/referral tooling (`docs/features/supplier-customer-growth.md`) | "Replace WhatsApp" — framing that threatens existing relationships; Part 3 §3.8 notes phone/WhatsApp has zero marginal cost and high trust |
| **Both**       | Connect existing relationships, don't disintermediate them               | Supplier-initiated invites, contract pricing, referral discounts (Part 7 §7.9)                                         | "Marketplace that cuts out the middleman" — contradicts product design intent (Part 3 §3.8)                                                |

The supplier-side growth program is not merely a product feature — it is a **marketing channel**
(see §8.6.3). Positioning should make suppliers feel like distribution partners, not just
paying tenants.

### 8.3.4 Competitive response messaging (Lebanon-specific)

Part 4's single most important Lebanon finding: **Supy is the only competitor with confirmed,
direct Lebanon operations** (§4.9.1). Marketing must prepare honest competitive framing without
naming Supy in primary consumer advertising (negative comparison risks credibility pre-proof);
instead, use **category contrast**:

| Buyer objection (anticipated)               | Response frame                                                                                                                                                                                                                                | Evidence basis                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| "We already use Supy / another tool"        | "Supplify connects restaurants _and_ suppliers in one platform — if your suppliers aren't on the same system, you're still reconciling across channels."                                                                                      | Part 4 §4.9.2 white-space table                                                                  |
| "Why not just use WhatsApp?"                | "WhatsApp doesn't reconcile what you ordered, what arrived, and what you owe. Supplify keeps that chain in one place — your supplier relationships stay; the chaos doesn't."                                                                  | Part 3 §3.8; `docs/sales/01_problem.md`                                                          |
| "$49/month is another cost on thin margins" | "Restaurants run on 3–5% margins industry-wide (Part 2 §2.3). Supplify is priced below the threshold where multi-stakeholder approval is typically required (Part 3 §3.7) — one avoided stockout or invoice dispute covers the subscription." | Industry margin data is sourced; ROI claim is **directional logic**, not a measured Supplify ROI |
| "Is this proven?"                           | "We're launching in Lebanon now with a free trial — no credit card, full Gold features to evaluate. Be among the first operators on the platform."                                                                                            | Honest pre-launch framing; Free Trial mechanics verified (Part 7 §7.3)                           |

---

## 8.4 Marketing Personas

Part 3 (§3.3) defines five illustrative personas as founder-testable hypotheses. This section
**does not replace them** — it adds the marketing layer: where each persona discovers solutions,
what message resonates, and what channel reaches them. All personas retain Part 3's explicit
label: **illustrative, not interview-derived**.

### 8.4.1 Restaurant-side personas

**Persona R1 — "Rami," independent owner-operator** _(Part 3 §3.3)_ — Sole decision-maker;
Silver ($49/mo). Reach via founder network, supplier referral, local F&B WhatsApp groups.
Message: daily ordering/reconciliation in one place; no-card trial. Content: 60-second
order→receive→invoice demo (Arabic + English). Barrier: phone/WhatsApp inertia — frame as
enhancement, not replacement (Part 3 §3.8).

**Persona R2 — "Layla," multi-branch operations manager** _(Part 3 §3.3)_ — Recommender +
owner approver; Gold ($149/mo). Reach via founder outreach, LinkedIn, hotel/F&B contacts.
Message: central visibility without per-location tool sprawl (Part 1 §1.9). Target operators
opening a second branch — the natural adoption trigger (Part 3 §3.5).

**Persona R3 — "Karim," cloud-kitchen operator** _(Part 3 §3.3; not current GTM target)_ —
Highest structural fit (Part 2 §2.11) but **deprioritized for launch** until founder decides
(Part 3 open item #3). Reserve SEO keywords for future activation.

### 8.4.2 Supplier-side personas

**Persona S1 — "Nadine," independent distributor owner** _(Part 3 §3.3)_ — Dual role as
revenue prospect and restaurant acquisition channel via customer import. Message: order
consolidation + "bring your customers onto one platform." Priority collateral: customer-import
walkthrough and referral reward explainer (Part 7 §7.9).

**Persona S2 — "Youssef," sales rep / order-desk coordinator** _(Part 3 §3.3)_ — Internal
champion, not budget authority. Enable via S1 one-pager; do not target with paid ads
pre-launch.

### 8.4.3 Persona prioritization for Year 1 marketing spend

Given zero budget and founder-led GTM (Part 7 §7.11, Part 10 §10.1), marketing effort should
concentrate on personas where **product-led and referral mechanics do the heavy lifting**:

| Priority     | Persona                                       | Rationale                                                                                                    |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **1**        | S1 (Nadine) + R1 (Rami) via supplier referral | Supplier import/referral loop is the only scalable zero-cash acquisition channel shipped today (Part 7 §7.9) |
| **2**        | R2 (Layla)                                    | Gold-tier ARPU ($149/mo) justifies founder direct-sales time (Part 10 §10.2)                                 |
| **3**        | S2 (Youssef)                                  | Enable via S1 collateral, not direct outreach                                                                |
| **Deferred** | R3 (Karim)                                    | Structural fit acknowledged; GTM decision pending (Part 3 §3.9 open item #3)                                 |

---

## 8.5 SEO and Content Strategy

### 8.5.1 Current state

No public marketing website SEO performance data exists — there are no live tenants, no
Google Search Console history, and no content marketing program documented in the codebase.
This section defines a **research-informed keyword and content architecture** for launch,
not a report on existing rankings.

### 8.5.2 Keyword taxonomy (English — primary for launch web properties)

Keywords are grouped by intent stage. Search volumes for Lebanon-specific terms are **not
available** in this research pass — treat all volume estimates as unknown and prioritize
**high-intent, low-competition long-tail** over broad head terms dominated by global incumbents.

| Funnel stage      | Example keyword themes                                                                                                          | Content format                            | Notes                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| Problem-aware     | Manual procurement pain, food waste/margin pressure, multi-branch ops                                                           | Blog posts, LinkedIn                      | No Lebanon search-volume data; ReFED margin context (Part 2 §2.7) usable, not Supplify ROI |
| Solution-aware    | "restaurant supplier platform," "procurement software MENA," feature-specific (receiving, GPS delivery, invoice reconciliation) | Homepage, feature pages                   | Part 4 §4.9.2 white space at $49 self-serve; competitor comparison pages for sales only    |
| Transaction-aware | "Supplify pricing," "restaurant software free trial," "restaurant software Lebanon"                                             | `/pricing`, `/register`, geo landing page | Verified tiers (Part 7 §7.2); Arabic keywords need native-speaker validation               |

### 8.5.3 Arabic SEO considerations

Part 1 (§1.5) and Part 4 (§4.9.6) establish bilingual capability as a structural differentiator.
Marketing research findings:

- **Product:** bilingual Arabic/English fields exist at schema level (Part 1 §1.2) — marketing
  pages and in-app copy should mirror this, not treat Arabic as an afterthought translation.
- **Competitive gap:** no competitor in Part 4's set has verified Arabic-language product
  support — an absence-of-evidence finding that supports Arabic-first SEO investment **if**
  the product UI is sufficiently localized at launch (verify against `apps/web` i18n coverage
  before committing — flagged as open item).
- **Keyword research gap:** Arabic search behavior for B2B procurement software in Lebanon is
  **undocumented in this research pass**. Do not invent search volumes. Recommended next step:
  Google Keyword Planner or Ahrefs pass with Lebanon geo-target, conducted by a native Arabic
  speaker, before Part 9 allocates content budget.

### 8.5.4 Content pillars (Year 1, pre-paid-media)

Four content pillars align with verified product capabilities and Part 3 pain points. Each
pillar specifies **what not to claim**:

| Pillar                          | Working title                             | Core message                                      | Format                                          | Proof requirement                                                            |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| **1 — The connected order**     | "From cart to payment in one system"      | Order → fulfillment → receiving → invoice chain   | Demo video, feature page, 3-part blog series    | Must show real product UI, not mockups                                       |
| **2 — Two-sided by design**     | "Built for restaurants and suppliers"     | Parallel value props; supplier referral loop      | Dual-audience landing pages, supplier one-pager | Customer-import flow verified (`docs/features/supplier-customer-growth.md`)  |
| **3 — Priced for independents** | "Enterprise depth. Independent pricing."  | $49 entry vs. $250+ competitors; self-serve trial | Pricing page, comparison table (internal)       | Public tier matrix; do not claim "cheapest" without ongoing price monitoring |
| **4 — Built for MENA**          | "Lebanon-first. Arabic-ready. Bilingual." | Regional focus, bilingual schema, USD pricing     | About page, geo landing page                    | Lebanon-first is verified; "Arabic-ready" requires UI audit                  |

**Content explicitly deferred until post-launch proof exists:**

- Customer case studies and logo walls
- ROI calculators with "hours saved" inputs (no sourced benchmark — Part 3 §3.4)
- Smart quick lists and smart reorder (Platinum/Gold) — enforced July 2026
- **Remaining catalog-only Platinum strings** (developer API, advanced custom reports, central purchasing — Part 4 §4.9.4)
- "Trusted by X restaurants" claims

### 8.5.5 Technical SEO baseline (launch checklist)

No technical SEO audit has been run. Before Part 9 launch activities, the following baseline
items should be verified against the production web deployment — listed here as research
requirements, not completed findings:

- Indexable marketing pages separate from authenticated `/app/*` routes
- Structured data (Organization, SoftwareApplication) with accurate pricing from `tier-matrix.md`
- Hreflang tags if Arabic and English marketing pages coexist
- Page speed and mobile responsiveness (restaurant operators often browse on mobile between shifts — **assumption**, not usage data)
- Sitemap and robots.txt excluding tenant-specific and admin routes

---

## 8.6 Channel Strategy

### 8.6.1 Channel prioritization framework

Part 7 (§7.11) states near-term CAC is "dominated by founder time opportunity cost, not paid
acquisition spend." Part 10 (§10.3) confirms no paid or organic marketing channel is modeled
yet — awareness is founder-network-driven. This section ranks channels by **evidence of fit**
for a pre-launch, bootstrapped, two-sided marketplace in Lebanon, not by projected ROI (which
cannot be calculated without spend data).

| Rank   | Channel                                             | Cash cost                                                                            | Evidence of fit                                                                                                                    | Status today                                    |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **1**  | Supplier-driven referral / customer import          | Discount/reward cost only (20% first-paid discount + 1 mo free/credit — Part 7 §7.9) | Shipped product feature; only channel with built-in two-sided acquisition                                                          | Live in codebase                                |
| **2**  | Founder direct network (restaurants + distributors) | Founder time                                                                         | Part 1 §1.13 "founder market access" in Lebanon                                                                                    | Active motion (Part 10 §10.1)                   |
| **3**  | Product-led trial (self-serve registration)         | Infrastructure cost only                                                             | No-card Free Trial with Gold features (Part 7 §7.3); monetization UX nudges conversion (`docs/product/monetization-ux.md`)         | Live in codebase                                |
| **4**  | LinkedIn (founder personal brand + company page)    | Founder time                                                                         | B2B SaaS norm; reaches R2 (Layla) and S1 (Nadine) professional profiles                                                            | **Not started** — no documented activity        |
| **5**  | Local trade associations / F&B events               | Event fees (variable)                                                                | Part 1 §1.11 forward-looking; 402 new restaurant brands registered mid-2025 (Part 2 §2.12) — fresh-openings cohort as event target | **Not started**                                 |
| **6**  | SEO / content marketing                             | Time or freelance cost                                                               | Long-cycle; necessary for GCC expansion (Part 14) but slow for Lebanon launch proof                                                | **Not started**                                 |
| **7**  | WhatsApp Business / community groups                | Founder time                                                                         | Matches how target buyers already communicate (Part 3 §3.8) — but must not appear to replace supplier relationships                | **Not started**; high touch                     |
| **8**  | Paid search (Google Ads)                            | Cash                                                                                 | High-intent but expensive; global incumbents bid on category terms                                                                 | **Deferred** — no budget, no landing-page proof |
| **9**  | Paid social (Meta, Instagram)                       | Cash                                                                                 | Visual food content engages restaurant audience — but B2B conversion unproven for this category in Lebanon                         | **Deferred**                                    |
| **10** | Review platforms (G2, Capterra)                     | Time to solicit reviews                                                              | Competitors have review moats (Supy G2 4.9/5 — Part 4 §4.3.1)                                                                      | **Deferred** until first 5–10 satisfied tenants |

### 8.6.2 Priority channels — operational notes

**Supplier-as-channel (Rank 1):** The customer-growth program (CSV import → invite → 20% first-
paid discount → supplier reward — Part 7 §7.9) is the only shipped zero-cash scale mechanism.
Supplier onboarding is marketing: every mid-market distributor signed (Part 10 §10.2) is a
distribution node. Priority collateral: supplier-facing "Bring your customers" one-pager (Arabic

- English) before any restaurant-facing paid ad. Messaging must emphasize "your customers stay
  yours" (Part 3 §3.8).

**Product-led trial (Rank 3):** The Free Trial ships Gold-equivalent features with Free-tier
limits only (Part 7 §7.3) — marketing must frame upgrades as **higher ceilings**, not feature
unlocks. Align copy with shipped touchpoints: no-card 30-day trial, `UpgradeModal` on limit blocks,
80% usage banner, proactive nudge after 3+ blocks (`docs/product/monetization-ux.md`).

### 8.6.3 Channels explicitly deferred

| Channel                                               | Deferral rationale                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Paid search**                                       | No cash budget; global incumbents dominate head terms; no conversion data to optimize           |
| **GCC paid media**                                    | Named funded competitors (Supy, Foodics, Kaso — Part 2 §2.13); Supplify has zero proof points   |
| **Influencer / food-blogger partnerships**            | B2B procurement is not a consumer discovery category; ROI unmeasurable pre-launch               |
| **Open ad marketplace / sponsored catalog placement** | Part 7 (§7.6) explicitly recommends against expanding paid placement before launch — trust risk |
| **Affiliate program**                                 | No margin data to set commission rates; no tracking infrastructure documented                   |

---

## 8.7 Message Architecture

### 8.7.1 Message hierarchy

| Level                 | Message                                                                                                      | Usage                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **Tagline (draft)**   | "One platform for restaurants and suppliers."                                                                | Homepage hero, email signature — derived from `docs/sales/02_solution.md` headline |
| **Value proposition** | "Order, fulfill, receive, and pay — connected."                                                              | Sub-headline, demo opener                                                          |
| **Proof points (3)**  | (1) Two-sided from $49/mo, (2) Free trial, full Gold features, (3) Built for MENA — bilingual, Lebanon-first | Feature sections, comparison tables                                                |
| **Call to action**    | "Start free trial" / "Book a demo" (founder-led)                                                             | All conversion points                                                              |

Tagline and value prop are **drafts for founder confirmation**, consistent with Part 1's
treatment of vision/mission (§1.3–§1.4).

### 8.7.2 Objection-handling message map

Part 10 (§10.6) documents sales objections; marketing should pre-empt the top four in
public-facing content:

| Objection                   | Pre-emptive content                                     | Honesty constraint                                        |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| "Too expensive"             | Pricing page with Silver at $49; annual discount (~17%) | Do not claim ROI without data                             |
| "We already have a process" | Problem-content pillar: cost of manual reconciliation   | Do not quantify hours saved                               |
| "Not proven / too new"      | Free trial, founder accessibility, transparent roadmap  | Do not fabricate customer count                           |
| "My suppliers won't use it" | Supplier-side value prop + referral incentive explainer | Acknowledge chicken-and-egg; cite supplier-import feature |

### 8.7.3 Tone and voice guidelines

Derived from `PRODUCT.md` and Part 1 §1.5:

- **Do:** short sentences, active voice, specific feature names, plain Arabic and English
- **Do not:** "digital transformation," "synergy," "AI-powered" (until shipped), "leading platform"
- **Do not:** enterprise ERP jargon — "tenants," "RBAC," "API" in consumer-facing copy
- **Visual alignment:** calm neutrals, violet accent for CTAs only — no gradient text, no
  stock-photo-heavy layouts (`PRODUCT.md` anti-references)

---

## 8.8 Geographic Marketing Implications

### 8.8.1 Lebanon (Year 1 — sole active market)

| Factor                                                  | Marketing implication                                                                                           | Source                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------- |
| ~4,000–4,500 F&B establishments (directional)           | Total addressable awareness pool is small enough for founder-led coverage — paid mass media unnecessary         | Part 2 §2.12, Part 3 §3.1.3 |
| Greenfield digitization (no incumbent penetration data) | Category-education content needed; buyers may not search for "procurement software"                             | Part 2 §2.12                |
| 402 new restaurant brands mid-2025                      | Fresh-openings cohort = no legacy tool; target with "start right" messaging — tempered by sub-20% survival rate | Part 2 §2.12                |
| 23% bank/mobile-money account penetration               | Payment messaging must accommodate cash settlement alongside platform invoicing                                 | Part 2 §2.12, Part 3 §3.8   |
| Supy confirmed Lebanon presence                         | Competitive awareness content needed for founder-led sales; not for broad advertising                           | Part 4 §4.9.1               |
| USD-denominated pricing                                 | Marketing can state prices in USD; acknowledge LBP exposure in FAQ for local buyers                             | Part 7 §7.2, Part 3 §3.7    |

### 8.8.2 GCC (deferred — research-only notes for Part 14)

No GCC marketing should run before Lebanon proof exists. Research notes for future use:

- UAE foodservice ~US$23–27B, Saudi ~US$30–32B (Part 2 §2.13) — larger markets, harder
  competitive entry (Supy, Foodics, Kaso).
- GCC pricing repricing question unresolved (Part 7 §8) — marketing cannot set GCC prices until
  Part 14 decides.
- Review-platform and LinkedIn presence matter more in GCC B2B buying — plan G2/Capterra
  listing as prerequisite to GCC entry, not Lebanon launch.

---

## 8.9 Measurement Framework

No marketing KPIs can be benchmarked against historical performance. This section defines
**what to instrument from day one** so Part 9 and Part 12 have real inputs — not targets
presented as achievements.

### 8.9.1 Metrics available at launch (product-instrumented)

| Metric                                  | Source                                                                         | Marketing use                                        |
| --------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Trial signups (restaurant vs. supplier) | Tenant registration logs                                                       | Channel attribution (add UTM params to invite links) |
| Trial → limit-block events              | `supplify_monetization_blocked` localStorage + API                             | PQL identification (Part 10 §10.3)                   |
| Blocks → upgrade modal opens            | `OPEN_UPGRADE` events with source metadata (`docs/product/monetization-ux.md`) | Message/plan optimization                            |
| Supplier import → invite → signup       | `docs/features/supplier-customer-growth.md` funnel                             | Referral channel effectiveness                       |
| Referral conversion (first paid)        | `referral-conversion.service.js`                                               | Supplier-as-channel ROI                              |
| Plan distribution at conversion         | Billing/subscription tables                                                    | ARPU validation vs. Part 7 §7.10 model               |

### 8.9.2 Metrics requiring setup and external reporting constraints

Website traffic, SEO rankings, content engagement, and CAC-by-channel require deliberate setup
(Analytics, Search Console, UTM discipline — Part 10 notes no CRM exists). Do not publish
conversion rates, NPS, LTV/CAC figures (Part 7 §7.10–§7.11), or growth percentages externally
until the first 20–30 paying tenants provide 3–6 months of billing history.

---

## 8.10 Strategic Recommendations Summary

The following recommendations synthesize this part for Part 9 (Marketing Plan) and founder
action. All are **recommendations**, not executed activities.

1. **Confirm brand foundation** — adopt or revise Part 1's proposed vision/mission/values and
   `PRODUCT.md` personality before any external-facing creative work.
2. **Lead with supplier-as-channel** — prioritize supplier-facing "bring your customers"
   collateral over restaurant-facing paid acquisition; it is the only shipped zero-cash scale
   mechanism.
3. **Align all trial messaging to limits-not-features** — the Free Trial's Gold-equivalent
   design (Part 7 §7.3) is a marketing constraint, not a bug; copy must reflect it.
4. **Build four content pillars** (§8.5.4) before paid media — organic and founder-shared
   content is the only credible pre-proof awareness layer.
5. **Run Arabic keyword research** before committing to bilingual SEO — the competitive gap
   (Part 4 §4.9.6) is real but unquantified.
6. **Prepare Supy-competitive framing for sales**, not advertising — honest category contrast
   without named negative advertising pre-traction.
7. **Instrument UTM and channel attribution from first signup** — without this, Part 9 cannot
   allocate even founder time rationally.
8. **Defer G2/Capterra, paid search, and GCC marketing** until Lebanon cohort proof exists.
9. **Do not market remaining catalog-only Platinum strings** (developer API, advanced custom
   reports, central purchasing) until backend-enforced or contractually disclosed (Part 4 §4.9.4).
10. **Smart quick lists and smart reorder** may be marketed to Platinum prospects — both are
    enforced; LLM reorder assist still requires `AI_ENABLED` verification (Part 11 §11.2).
11. **Commission 15–20 structured prospect conversations** (Part 3 §3.9 open item #5) before
    Part 9 finalizes messaging — this part has reached the limit of secondary research.

---

## Sources & Assumptions Used in This Part

- **Brand personality and design principles:** `PRODUCT.md` (verified internal source).
- **Vision, mission, values (draft):** Part 1, §1.3–§1.5 — proposed, not founder-confirmed.
- **Market segmentation and personas:** Part 3, §3.1–§3.3 — personas labeled illustrative.
- **Pain points and solution framing:** `docs/sales/01_problem.md`, `docs/sales/02_solution.md`.
- **Competitive landscape and white space:** Part 4, §4.3–§4.9 — competitor figures cited
  inline in Part 4, not re-sourced here.
- **Pricing, trial design, referral mechanics:** Part 7, §7.2–§7.3, §7.9–§7.11;
  `docs/product/tier-matrix.md`; `docs/sales/08_pricing_strategy.md`.
- **Monetization UX and trial conversion touchpoints:** `docs/product/monetization-ux.md`.
- **Supplier growth program:** `docs/features/supplier-customer-growth.md`.
- **Sales motion and channel baseline:** Part 10, §10.1–§10.4.
- **Regional market data (Lebanon establishment counts, GCC foodservice sizing, financial
  inclusion, cloud-kitchen growth):** Part 2 — see that part's source list for primary
  citations.
- **Industry margin and cost-structure context:** Part 2, §2.3, §2.7 (ReFED, National
  Restaurant Association via Restaurant Dive).
- **No customer interviews, brand-tracking surveys, SEO performance data, paid campaign
  results, or conversion metrics exist and none are represented as existing anywhere in this
  part.**

### Assumptions explicitly labeled in this part

- Category label "restaurant–supplier operations platform" is a messaging hypothesis, not
  tested with prospects.
- Arabic keyword targets and search volumes are unknown — require dedicated research pass.
- Mobile-first browsing behavior for restaurant operators is plausible but unverified.
- LinkedIn and trade-event channels are ranked by B2B SaaS convention, not Supplify-specific
  data.
- Content pillar titles and tagline are drafts for founder confirmation.

---

### Open items for founder review

1. **Confirm or revise the positioning statement (§8.3.1) and tagline (§8.7.1)** before
   Part 9 builds a marketing calendar — both are drafts, not approved copy.
2. **Decide on cloud-kitchen GTM (Part 3 open item #3)** — if yes, activate Persona R3
   content and SEO keywords; if no, explicitly deprioritize in Part 9.
3. **Audit Arabic UI coverage** in `apps/web` before marketing "Arabic-ready" — Part 4 §4.9.6
   establishes competitive white space, but Supplify's own localization completeness is
   unverified in this part.
4. **Run Arabic + English keyword research** with Lebanon geo-target before Part 9 allocates
   any content or paid spend.
5. **Commission 15–20 structured prospect conversations** (restaurants + suppliers) to
   validate personas, category label, and objection map — secondary research has reached its
   limit (Part 3 §3.9 open item #5, carried forward).
6. **Confirm billing disclosure in marketing copy** — Part 10 (§10.1) notes real payment
   collection is not live; trial and pricing pages must not imply self-serve card checkout
   until a live processor ships.
7. **Decide G2/Capterra listing timing** — competitor review moats (Supy 4.9/5) suggest early
   listing after first satisfied tenants, but soliciting reviews with zero tenants is premature.
8. **Set up UTM attribution and basic web analytics** on marketing pages before first external
   traffic — without this, channel ranking in §8.6.1 cannot be validated.
9. **Resolve GCC pricing (Part 7 §7.8)** before any GCC marketing content is drafted in Part 14.
10. **Platinum AI marketing** — smart quick lists and smart reorder may be marketed; do not
    claim developer API, advanced custom reports, or central purchasing until enforced
    (Part 4 §4.9.4; `PLATINUM_CATALOG_ONLY_FEATURES.md`).
