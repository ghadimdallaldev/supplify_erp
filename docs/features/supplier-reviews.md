# Supplier Reviews

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

Restaurants can rate suppliers after a delivered order. Ratings are aggregated per supplier and exposed on supplier list/detail and public review endpoints.

**Plan gate:** `supplier_reviews` — **Silver+** restaurant plans (off on Free Trial).

## Reviewer identity (marketplace visibility release 1, 2026-11-26)

- Every review list (public `GET /api/reviews/suppliers/:id`, supplier directory cards, supplier detail) returns `reviewer_label: "Verified restaurant"` and no restaurant id or name.
- `is_own` is `true` only for the signed-in restaurant's own reviews. The public route accepts an optional session for this.
- `GET /api/reviews/my` is unchanged: a restaurant always sees its own reviews.

## Rules

- One review per `customer_order` (enforced by unique `order_id`).
- Order must be in a delivered lifecycle status: `COMPLETED`, `DELIVERED`, `RECEIVED_PARTIAL`, `RECEIVED_FULL`, or `INVOICED`.
- Order must include line items from the reviewed supplier.
- Authors may **edit** their review within **7 days**; **delete** anytime (own reviews only).
- `supplier_rating_summaries` is maintained by a DB trigger on `supplier_reviews` insert/update/delete.

## API (`/api/reviews`)

| Method | Path                             | Auth       | Description                                                |
| ------ | -------------------------------- | ---------- | ---------------------------------------------------------- |
| GET    | `/suppliers/:supplierId`         | None       | Paginated public reviews (`limit`, `offset`)               |
| GET    | `/suppliers/:supplierId/summary` | None       | Aggregated averages and count                              |
| GET    | `/my`                            | Restaurant | Restaurant's own reviews                                   |
| POST   | `/suppliers/:supplierId`         | Restaurant | Create review (`orderId`, ratings 1–5, optional `comment`) |
| PATCH  | `/:id`                           | Restaurant | Update own review (within 7 days)                          |
| DELETE | `/:id`                           | Restaurant | Delete own review                                          |

## Supplier catalog enrichment

`GET /api/suppliers` and `GET /api/suppliers/:id` include:

- `avg_overall`, `review_count`
- `recent_reviews` (3 on list, 5 on detail)

## Notifications

After `POST /api/receiving/receive`, if the order is delivered and has no review yet, the **restaurant team** receives an in-app notification prompting them to leave a review (`notifyTenantUsers`).

## Database

Migration: `0070_supplier_reviews.sql` — `supplier_reviews`, `supplier_rating_summaries`, refresh trigger.
