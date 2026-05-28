# 08 — Pricing Strategy

## How Plans Drive Value and Revenue

Supplify’s pricing is designed so that **Free** demonstrates the product without giving away serious usage, **Gold** feels like the default plan for real daily use, and **Platinum** (and optional **Enterprise**) serve scale and custom needs.

### Design principles

- **Free is for setup and testing** — Low limits (e.g. 3 orders/day, 3 chats/day, 15 products, 1 supplier for restaurants; 0 warehouses, 15 products for suppliers) so users see value quickly but hit friction when they try to run operations on Free. This creates a clear “upgrade to get real work done” moment.
- **Gold is the default serious plan** — Restaurants and suppliers running daily operations are expected to be on Gold (or higher). Gold unlocks multi-branch/multi-warehouse, reports, smart reorder, and higher limits so it’s the natural step after Free or Silver.
- **Platinum is “never think about limits”** — For chains and large suppliers who don’t want to worry about caps. Very high or unlimited limits and the full feature set.
- **Enterprise** — Custom limits, SLAs, and contracts; assigned only by admin. Not self-serve. See **docs/monetization/ENTERPRISE.md**.

### How we surface upgrades

- **Recommendations** — The app can recommend a plan based on usage (e.g. near or over limits) and blocked features. “Recommended: Gold” appears in subscription and upgrade flows so the next step is obvious.
- **Clear messaging** — When a limit is hit or a feature is gated, the message explains what’s missing and which plan unlocks it (value, not just price).
- **Conversion tracking** — We record lightweight funnel events (e.g. feature/limit blocked, plans viewed, upgrade modal opened, plan changed). Admins see blocks → upgrades conversion and most-blocked feature/limit to tune positioning and pricing.

### What buyers care about

- **Restaurants** — “I need more orders per day / more branches / reports” maps directly to Silver → Gold → Platinum. No surprise lockouts; upgrade paths are clear.
- **Suppliers** — “I need more products / warehouses / chat” follows the same logic. Enterprise is for custom deals and SLAs.
- **Investors** — Free creates pipeline; Gold and Platinum drive ARR. Conversion and admin stats show how often limits and features drive upgrades.

Pricing strategy is aligned with product limits and features so that revenue grows as customers get more serious about using the platform.
