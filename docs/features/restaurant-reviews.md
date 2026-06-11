# Restaurant Reviews (Consumer)

Diners can rate restaurants after a completed **consumer order** (Track E guest ordering). Ratings aggregate per restaurant and are exposed on public review endpoints.

**Plan gate:** None on review endpoints; consumer ordering itself is restaurant-configured.

## Rules

- One review per `consumer_order` (unique `consumer_order_id`).
- Order must be in a delivered lifecycle status (`COMPLETED`, `DELIVERED`, etc. — same set as supplier reviews via `DELIVERED_ORDER_STATUSES`).
- Authors may **edit** their review within **7 days**; **delete** anytime (own reviews only, matched by `reviewer_user_id`).
- `restaurant_rating_summaries` is maintained by a DB trigger on `restaurant_reviews` insert/update/delete.
- Public list endpoints omit PII beyond optional `reviewer_name`.

## API (`/api/consumer-reviews`)

| Method | Path                                 | Auth          | Description                                                                                    |
| ------ | ------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/restaurants/:restaurantId`         | None          | Paginated public reviews (`limit`, `offset`)                                                   |
| GET    | `/restaurants/:restaurantId/summary` | None          | Aggregated averages (`avg_overall`, `avg_food`, `avg_service`, `avg_ambiance`, `review_count`) |
| POST   | `/restaurants/:restaurantId`         | Optional auth | Create review (`consumerOrderId`, ratings 1–5, optional `comment`, `reviewerName`)             |
| PATCH  | `/:id`                               | Auth          | Update own review (within 7 days)                                                              |
| DELETE | `/:id`                               | Auth          | Delete own review                                                                              |

Rating dimensions: `overallRating` (required), `foodRating`, `serviceRating`, `ambianceRating` (optional).

## Database

Migration: `0159_restaurant_reviews.sql` — `restaurant_reviews`, `restaurant_rating_summaries`, refresh trigger.

FK to `consumer_order` finalized in `0161_consumer_ordering.sql` / `0162` follow-up migrations.

## Web

Consumer receipt and order flows can prompt for review post-delivery (when wired). Public summary/review list available for storefront enrichment.

Service: `consumer-reviews.service.js`

## Tests

| File                                                  | Covers                                               |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `apps/api/src/routes/consumer-reviews.routes.test.js` | Public list, create eligibility, edit window, delete |

## See also

- [consumer-ordering.md](./consumer-ordering.md) — guest menu, checkout, receipt
- [supplier-reviews.md](./supplier-reviews.md) — B2B supplier ratings (parallel pattern)
- [reservations-foh.md](./reservations-foh.md) — other public guest flows
