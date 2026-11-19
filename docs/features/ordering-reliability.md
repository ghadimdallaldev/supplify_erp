# Restaurant ordering reliability

Restaurant checkout splits a basket into one order per supplier. Prices,
currencies, stock availability, quantity rules, delivery location, and plan limits
are enforced by the API. Order headers, lines, stock reservations, usage, and
idempotency claims are committed in one transaction; a failure rolls them back.

An identical retry uses the same `Idempotency-Key` and normalized payload. A
successful replay returns the original order IDs without reserving stock again;
a different payload with a successful key returns a conflict. Claim insertion
uses the actor/key unique index, including overlapping submissions. Migration
`0236_manual_order_idempotency_actor_scope.sql` removes the older restaurant/key
constraint so independent supplier actors can use the same key for one customer.

## Quote and manual checkout corrections (2026-11-18)

Checkout locks relevant quote-request parents in ID order, reads current eligible
response lines with shared row locks, then checks selected product/supplier IDs,
unit prices, currencies and quantity limits before writing orders or usage. A
committed closure, changed price/quantity or new response on a locked request after
preflight is rejected before order writes. Existing quote response/closure writers
wait until the order transaction commits.

Supplier manual orders resolve automatic quote locks and prices through the same
transaction client. This avoids nested pool acquisition and supports a single
database connection. Stock-mode resolution also carries that connection through
organization billing, subscriptions, trial features and feature overrides. Those
transactional reads bypass shared caches and singleflight to avoid publishing
rolled-back values or waiting on a separate connection. They retain
`quote_response_item_id` on quoted order lines and persist the delivery date
computed by the existing delivery-rule resolver.
Supplier-local cutoff behavior is covered by the calendar corrections below.

Manual keys use `SUPPLIER:<supplierId>:RESTAURANT:<restaurantId>`. The server derives
the supplier from the authenticated workspace. Historical restaurant-scoped manual
responses replay only when the destination and every stored line belong to that
supplier; another supplier's response is never returned. Successful retries remain
valid after quote closure. Rollback removes order, reservation, usage and key together.

API success data is `{ order }` or `{ orders }` for restaurant checkout and
`{ order }` for manual checkout. Web mutation types reflect those wrappers. Both
native clients normalize restaurant results into arrays, validate returned order
IDs, and preserve the retry key on errors or ambiguous responses. They expose the
typed manual endpoint and existing quote metadata. The existing native cart already
has a supplier-count fallback; the hook correction establishes its promised return
contract and prevents malformed success data from confirming checkout.

Apply migration 0236 in each target environment before rollout. Only the disposable
audit database was migrated in this session. Hosted migration application, mixed
API-version retries, all warehouse/plan combinations, new-request phantoms and
non-quote pricing races remain unverified.

`GET /api/orders` includes an optional nullable `supplier_name` for restaurant
workspaces, aggregated from the order's purchased supplier lines. Tenant filtering
and pagination remain in force. Equal creation timestamps are ordered by ID as a
stable pagination tie-breaker. The web restaurant list shows that supplier;
supplier workspaces retain the customer counterparty. Both web list layouts
format totals using the stored order currency. Android and iOS already consume
`supplier_name` and the order currency; their nullable projection types and
concurrent checkout replay regressions are mirrored.

Real PostgreSQL regressions are in `tests/integrity/restaurant.pg.test.js`.
Run them against the disposable database with
`node scripts/qa/restaurant-audit-db.mjs start`, then
`node scripts/qa/restaurant-audit-db.mjs test`, and finally
`node scripts/qa/restaurant-audit-db.mjs stop`. The runner refuses hosted database
targets, stores its temporary credential outside the repository, and only removes
the container carrying its own ownership label.

Supplier checkout HTTP/SQL regressions are in
`tests/integrity/supplier-order-checkout.pg.test.js`, run with the separately owned
supplier audit database via `node scripts/qa/supplier-audit-db.mjs test`.

## Supplier delivery calendars and order notes (2026-11-19)

Cutoffs use the supplier's named `last_order_timezone`. Blank or unsupported
historical settings fall back to the platform timezone. A stored `UTC` setting
uses UTC. Requested `YYYY-MM-DD` values retain their calendar
day, and impossible days return 400 on restaurant and manual checkout.

Restaurant checkout resolves each supplier's delivery day once during price
preparation. Contract pricing and the order header share that result across a
cutoff boundary. Manual checkout also returns its `deliveryResolution` metadata.
Both native clients type and preserve this optional response object.

Minutes-before-window rules use the supplier's zoned delivery midnight. A skipped
midnight advances through the DST gap. Calendar rollover adds calendar days and
handles the tested 25-hour New York day and Beirut midnight transition. Absolute
cutoffs retain their existing minute precision and permit the configured minute.

Placement, list, detail and ordinary update responses project the requested
delivery day as calendar text, including historical nulls. Earlier saved replay
JSON remains a separate rollout compatibility check. Note-only PATCH requests now
write `notes`; an empty string clears them under the existing actor/access guards.

Migration `0237_supplier_timezone_validation.sql` clears historical timezone names
that PostgreSQL cannot resolve. An empty setting uses the platform fallback.
It preserves recognized names and was applied only to the owned audit database.

The [2026-11-16 restaurant feature audit](../audits/RESTAURANT_FEATURE_AUDIT_2026-11-16.md)
records the tested scope and Development verification separately.
