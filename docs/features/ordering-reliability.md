# Restaurant ordering reliability

Restaurant checkout splits a basket into one order per supplier. Prices,
currencies, stock availability, quantity rules, delivery location, and plan limits
are enforced by the API. Order headers, lines, stock reservations, usage, and
idempotency claims are committed in one transaction; a failure rolls them back.

An identical retry uses the same `Idempotency-Key` and normalized payload. A
successful replay returns the original order IDs without reserving stock again;
a different payload with a successful key returns a conflict. Claim insertion
handles both the original restaurant/key unique constraint and the later
actor/key index, including overlapping submissions. Existing migrations are
unchanged.

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

The [2026-11-16 restaurant feature audit](../audits/RESTAURANT_FEATURE_AUDIT_2026-11-16.md)
records the tested scope and Development verification separately.
