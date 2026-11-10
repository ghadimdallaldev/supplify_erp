# Enterprise Sales Motion Checklist

One-page checklist for enterprise (restaurant/supplier) discovery, sizing, and onboarding.

---

## Discovery

**Restaurant**

- How many locations/branches? (current and planned)
- How many FTE (purchasing, kitchen, receiving)?
- Orders per day/week to suppliers?
- Current tools (ERP, POS, inventory)?
- Pain points: manual POs, reconciliation, supplier communication?

**Supplier**

- How many warehouses/depots?
- How many restaurant customers (active vs target)?
- Order volume (orders/day, lines/order)?
- Catalog size (SKUs) and growth?
- Integration needs (EDI, API, portal-only)?

---

## Sizing

| Dimension      | Restaurant                         | Supplier                  |
| -------------- | ---------------------------------- | ------------------------- |
| Branches       | # locations                        | —                         |
| Warehouses     | —                                  | # depots                  |
| Users          | # logins (owner, managers, staff)  | # logins                  |
| Orders/day     | Placed to suppliers                | Received from restaurants |
| Catalog/limits | Inventory SKUs, suppliers followed | Product SKUs              |

Capture: current state, 12-month target, 24-month target.

---

## Integration & SLA

- **Integrations**: EDI (orders/invoices), API (catalog, orders), SSO (SAML/OIDC), accounting export.
- **SLA**: Uptime target (e.g. 99.5%), support channel (email, phone, portal), response tiers.
- **Data**: Data residency, retention, export/backup.

---

## Onboarding Steps

1. **Contract signed** — Legal + order form.
2. **Tenant created** — Admin creates org (restaurant/supplier), assigns plan (e.g. Enterprise).
3. **SSO / access** — Configure IdP (if SSO); invite users and assign roles.
4. **Catalog & limits** — Set branch/warehouse limits, product/inventory limits per plan.
5. **Go-live** — Training, cutover, support handoff.

---

## Contract Fields Template

- **Parties**: Customer legal name, Supplify entity.
- **Term**: Start date, initial term (e.g. 12 months), auto-renewal.
- **Plan & pricing**: Plan name, list price, discount, payment terms (NET 30, etc.).
- **Limits**: Branches/warehouses, users, orders, storage (as per order form).
- **SLA**: Uptime %, support hours, response times.
- **Data & security**: DPA reference, data location, confidentiality.
- **Termination**: Notice period, early exit, data return.

---

## Timelines

| Phase        | Typical duration     |
| ------------ | -------------------- |
| Discovery    | 1–2 calls            |
| Proposal     | 3–5 days             |
| Legal/DPA    | 1–3 weeks            |
| Provisioning | 1–2 days (post-sign) |
| Onboarding   | 1–2 weeks            |
| Go-live      | By week 2–4          |

---

_Keep this doc updated as standard questions and templates evolve._
