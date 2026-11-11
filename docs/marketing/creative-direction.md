# Creative Direction: HORECA Beirut 2026

Current deployment (2026-11-11): this presentation is a public entry in the main Supplify web build, not a separate Railway app. UI/styles live under `apps/web/src/demo/`, assets under `apps/web/static/demo/`, and campaign endpoints in the existing API. See `docs/features/demo-experience.md` and `railway-deployment.md`; the standalone paths in earlier design notes below are historical.

## Directions considered

1. **Ledger**: editorial paper-and-ink, serif display, hairline rules. Credible and calm, but static.
2. **The Order Line**: one continuous line that follows an order through restaurant, order, supplier, warehouse, delivery. The product's actual story (flow) becomes the visual device. Distinctive, meaningful, ownable.
3. **Night Dispatch**: dark control-room UI. Rejected: trendy dark-SaaS look, clashes with the product's calm light UI and `PRODUCT.md` anti-references.

**Chosen: The Order Line, set with Ledger typography.** Tagline: **"Every order, one line."** (EN). Arabic equivalent to be written naturally (not literal), e.g. "كل طلب، من البداية للتسليم".

## Demo UI refresh — 2026-11-11

The user supplied [Cartify](https://www.cartifyapp.ai/) as a layout and product-presentation reference. The campaign now uses a split hero with direct restaurant/supplier walkthrough actions, staggered real Supplify screen previews, centered feature introductions, three icon-led capability cards, alternating white/lavender sections, and a rounded final demo banner. The Supplify violet identity and "Every order, one line" story remain. Headings use bold Inter for a clearer presentation at demo distance; Instrument Serif remains available for small editorial details and existing simulation content. No Cartify images, brand assets, testimonials, customer counts, partner claims or performance metrics are reused.

Page sequence: hero and compact order line → capability strip → feature cards → audience cards → selected seven-step walkthrough → connected lifecycle → real product viewer → captioned film → FAQ → personal demo request. The former separate benefits section is consolidated into the feature cards to reduce repetition.

Responsive behavior: full section navigation on desktop; disclosure navigation on phones; paired hero actions on phones; single-column feature/audience cards on smaller screens. Hero screenshots use media-qualified picture sources so phones do not fetch the desktop composition. Product previews retain their screen tabs and keyboard-operable enlargement. Selecting a role opens the same sample walkthrough without the former full-screen transition curtain. Reduced-motion preferences disable smooth transitions. The walkthrough accent selector supports arrows, Home and End with one tab stop.

Styles are split between `app/globals.css` (existing application/simulation styles) and `app/experience.css` (campaign presentation). No dependency, backend endpoint, lead schema or environment change is required. This refresh supersedes the display typography and paper color below; the original art direction remains here for historical context.

## Business messaging and product images — 2026-11-11

Feature presentation now includes supplier Deals/Boosts, separate company workspaces, and concrete security benefits (protected sign-in, team permissions and activity logs). A distinct **40+ features** panel invites visitors to a personal demo with more to discover and a few surprises. The claim basis and copy limits are recorded in `feature-coverage.md`.

Product-gallery images fit within their frames with preserved proportions and a 520px maximum display height. The former 640px minimum image width on phones is removed, so every screen is visible without a forced horizontal crop. A consistent screen-title bar anchors each image; the existing full-size enlargement remains available. Responsive image source sizes match the actual gallery columns. Hero screenshots preserve their proportions, and the decorative counter that suggested a non-existent hero carousel is removed.

## Original system

- **Palette:** paper `#F5F1EA`, ink `#15121A`, Supplify violet `#5B21B6` (the ONLY accent; used for the line, primary CTA, active state), mint `#059669` (delivered/complete), amber `#D97706` (pending), hairlines `#15121A` at 12% opacity. No gradients on text, no glass, no glow blobs, no stock people.
- **Type:** Display EN: Instrument Serif. Body/UI EN: Inter (matches the product). Mono (order IDs, timestamps): JetBrains Mono. Arabic display: Noto Naskh Arabic; Arabic body: IBM Plex Sans Arabic. Large, confident type; sentence case.
- **Layout:** strict 4/8 spacing grid, one container width, generous but not empty. The Order Line runs along a vertical rail on mobile and a horizontal rail on desktop.
- **Motion rules:** (1) the line draws, it never fades; (2) status chips tick through the REAL lifecycle (Placed → Acknowledged → Processing → Shipped → Delivered → Received → Invoiced); (3) 200-300ms, ease `cubic-bezier(.2,0,0,1)`; (4) one motion idea per section; (5) `prefers-reduced-motion` shows final states, no movement.
- **Product imagery:** real screenshots from the dev demo, cropped tightly to the strongest region, in device-less flat frames with a hairline border. Synthetic simulations rebuild UI faithfully in code using the product's tokens (violet, Inter), never fake "dashboards".
- **Sound:** subtle tonal UI ticks for status changes, one soft low swell at brand reveal. No swooshes.

## Shared story (site + film)

Problem: orders arrive by call, chat and paper; restaurants don't know what's coming; suppliers chase and re-key.
Answer: one connected line from discovery to invoice.
Restaurant story: find suppliers → browse → build order → place → watch it move → receive → reorder.
Supplier story (lead): order arrives → accept → check stock → prepare → assign driver → status updates → know your customers.
CTA: **Request a personal demo.** Never claim pricing, customer counts, savings, partnerships, HORECA endorsement, automatic billing, WhatsApp, or turn-by-turn ETA. See `product-knowledge.md` section 5.

## Film voiceover (~150 words, 60s): draft for the film team to refine

"Every day, restaurants and suppliers run on calls, chats and paper. Orders get lost. Stock is a guess. Nobody knows where the delivery is. / Supplify puts every order on one line. / A restaurant finds its suppliers, builds an order and sends it. The supplier sees it the moment it lands, accepts it, checks stock, and prepares it. A driver takes it from the warehouse, and the restaurant follows it to the door. / On arrival, the restaurant confirms what it received, and the invoice follows. Next week, reordering takes a few taps. / For suppliers, it is also a way to stay close to the restaurants you already serve, and to see who is ordering, and who is due. / Supplify. Every order, one line. Come and see it at HORECA, or request a personal demo."
(Check every claim against `product-knowledge.md` before final; trim to fit exactly ~60s.)
