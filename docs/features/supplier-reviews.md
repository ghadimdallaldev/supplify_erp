# Supplier Reviews

Restaurants can rate suppliers after a delivered order. Ratings are aggregated per supplier and exposed on supplier list/detail and public review endpoints.

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
