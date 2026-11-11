# Supplify: Verified Product Knowledge (HORECA Beirut 2026 campaign)

Source: read-only code/doc audit on 2026-11-10 (not a runtime test). Status doc used: `docs/onboarding/16-implementation-status.md` (dated 2026-06-17). Re-verify against the running demo before any claim goes into the film or site.

## 1. What Supplify is

A B2B marketplace and operating system for the restaurant supply chain. Restaurants discover suppliers, order, receive and manage inventory. Suppliers manage catalog, incoming orders, warehouses, fulfillment and delivery, and their restaurant customers. Drivers are supplier-side staff who see only their assigned deliveries.

### Campaign messaging update — 2026-11-11

The microsite now highlights supplier product Deals and sponsored Boosts; separate business workspaces and linked branch accounts; protected sign-in, role-based access and activity logs; and **40+ features across supplier and restaurant workflows** with a personal-demo teaser. [Claim coverage](feature-coverage.md) maps 44 distinct user capabilities to implementation/domain sources and records the limits of the security and workspace wording. This is a capability count, not a count of subscription feature keys or a promise that every account includes every feature. The demo teaser does not make additional functionality claims.

## 2. Who it serves

- **Restaurants / groups / branches:** purchasers, managers, receiving staff, accountants.
- **Suppliers / distributors:** owners, managers, warehouse, fulfillment, catalog, promotions, accountants, drivers.

## 3. Capability status (safe to advertise = IMPLEMENTED)

| Capability                                                        | Status                     | Notes                                                                                                                                                                  |
| ----------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supplier discovery (search, follow, reviews, connection requests) | Implemented                | Quote requests (RFQ) exist; mention lightly                                                                                                                            |
| Catalog (CRUD, CSV import, bulk image import, bilingual EN/AR)    | Implemented                | Contract pricing is placeholder-gated: do not feature                                                                                                                  |
| Ordering (browse, cart, place, amend)                             | Implemented                | The restaurant's order IS the purchase order; no separate PO object                                                                                                    |
| Reorder via quick lists (incl. scheduled)                         | Implemented                | AI smart reorder is partial (API + widget, no dedicated nav): do not headline                                                                                          |
| Supplier order management (accept/decline, process, ship)         | Implemented                |                                                                                                                                                                        |
| Inventory + warehouses                                            | Implemented                | Plan-gated (`inventory_management`, `warehouses`)                                                                                                                      |
| Fulfillment board, run sheets, pick lists, proof of delivery      | Implemented                |                                                                                                                                                                        |
| Driver assignment, live GPS, ETA                                  | Implemented, env-dependent | ETA is a straight-line estimate (20 km/h default), only while out for delivery with a recent GPS fix. Say "estimated arrival", never "turn-by-turn" or "traffic-aware" |
| Invoices, credit notes, disputes, statements                      | Implemented (core)         | Statement `openingBalance` was hardcoded 0: avoid showing statement balances                                                                                           |
| Analytics / reports / customer growth                             | Implemented                | Dashboard period selector doesn't refilter spend trend: avoid showing it                                                                                               |
| Supplier promotions                                               | Implemented                | Admin-approved                                                                                                                                                         |
| Notifications (in-app, email, push, chat)                         | Implemented                |                                                                                                                                                                        |
| Roles/permissions, multi-branch orgs, custom roles                | Implemented                | 56 permission keys                                                                                                                                                     |
| Arabic UI with RTL                                                | Implemented                | 32 namespaces in `apps/web/src/i18n`                                                                                                                                   |

## 4. Real order lifecycle (use this exact flow in sims and film)

`PLACED` → `ACKNOWLEDGED` (supplier accepts) → `PROCESSING` → `SHIPPED` → `DELIVERED` → `RECEIVED` (full/partial) → `INVOICED`.
Side paths: `CANCELLED`/decline, `RECEIVED_WITH_DISPUTE`. Driver sub-states: assigned → picked up → out for delivery → delivered.
Do not show: Approvals/budgets (removed), `PENDING_APPROVAL`, `COMPLETED` (legacy).

## 5. Do NOT advertise

- Automatic card billing/payments: production is `BILLING_GATEWAY=manual`; pilot guidance is "do not sell auto-charge"
- WhatsApp notifications (disabled in prod)
- Turn-by-turn routing or traffic-aware ETA
- Approvals/budgets, Enterprise tier, Wish Money/bank transfer
- Any pricing, plan names, customer counts, savings, testimonials, integrations or partnerships. Pricing exists internally but the brief forbids inventing commitments; do not publish prices.
- Any HORECA sponsorship or endorsement

## 6. Differentiators (supportable)

1. One connected flow: discover → order → fulfil → deliver → receive → invoice, in one system.
2. Both sides of the relationship: supplier tools (customers, promotions, inventory) and restaurant tools (receiving, inventory, recipe costing).
3. Supplier-run delivery with driver app, live location and estimated arrival.
4. Built for the region: bilingual English/Arabic catalog and UI, RTL.
5. Role-based access for teams and multi-branch groups.

## 7. Journeys to feature

- **Restaurant (7 steps):** find suppliers → browse catalog → build cart → place order → track (accepted, preparing, shipped, estimated arrival) → receive → reorder from a quick list.
- **Supplier (7 steps):** new order arrives → review/accept → check stock → prepare (pick list) → assign driver → delivery status updates → customer/business overview.

## 8. Highlights by audience

- **Suppliers (lead message):** keep existing restaurant customers ordering through one place; organised orders, stock and deliveries; know which customers are active; run promotions.
- **Restaurants:** order from all suppliers in one place; clear order status and arrival estimates; receiving and inventory in the same system; fast repeat ordering.

## 9. Demo-data caveats

- `seed-horeca-demo.mjs` only seeds identity + catalog (+ keycloak); `seed/horeca-sections.mjs` doesn't exist, so orders, invoices and history are NOT seeded for the HORECA dataset yet.
- Driver logins are not in `seed:full`.
- The user's note says demo logins for Cedar Fresh Produce and Bekaa Valley Dairy exist and were login-tested; the shared demo password is in `DEMO_PASSWORD` in the seed data file and must never be committed to new files or logged.
- Seeded accounts can be past-due/locked depending on plan; use top-tier demo accounts for screenshots.
