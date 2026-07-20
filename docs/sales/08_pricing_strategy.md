# 08 — Pricing Strategy

## Positioning

Supplify’s pricing is designed so that a **30-day Free Trial** demonstrates real workflows, **Growth** is the natural first paid plan for daily use, and **Scale** serves multi-location restaurants and high-volume suppliers. Hidden custom / Enterprise handling exists for special accounts — see [enterprise.md](../product/enterprise.md).

Canonical numbers and matrices: [four-plan-pricing-model.md](../product/four-plan-pricing-model.md).

### Principles

- **Trial proves value** — Prospects get Growth-target features for 30 days with Free limit caps and a finite AI trial pool; expiry locks writes until upgrade.
- **Growth is the entry paid plan** — Restaurant Growth ($49) for single-branch purchasing; Supplier Growth ($149) for catalog + fulfillment with 50 active customer locations/month.
- **Scale is multi-site / high volume** — Restaurant Scale ($149) for up to 3 branches and advanced ops; Supplier Scale ($349) for 200 active customer locations/month plus multi-warehouse / driver depth.
- **Primary upgrade levers** — Restaurants scale by **active branches** (add-on available on Scale). Suppliers scale by **active ordering customer locations / billing period** (add-on packs of +50 on Scale). Do not lead with legacy “orders per day” as the main commercial story.

### In-product conversion

- Soft walls and upgrade modal recommend the next tenant-specific plan from usage and blocked features.
- Public UI uses Growth / Scale / 30-day Free Trial names — never Bronze / Silver / Gold / Platinum as customer-facing labels (those remain internal codes).

### Audience mapping

- **Restaurants** — “I need another branch / more AI assists / advanced roles” maps to Growth → Scale (and branch add-ons).
- **Suppliers** — “I need more active customer locations / warehouses / drivers” maps to Growth → Scale (and location/warehouse add-ons).
- **Investors** — Trial creates pipeline; Growth and Scale drive ARR. Conversion and admin stats show how often limits and features drive upgrades.
