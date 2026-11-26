# Marketplace real-PostgreSQL integration tests

Integration tests for the marketplace visibility and platform-category plans
(`docs/superpowers/plans/2026-11-25-*.md`). They run the API's own `lib/db.js`, migrations,
routes and sockets against an isolated PostgreSQL 16 container.

## Start the database

```bash
docker run -d --name supplify-marketplace-audit \
  -e POSTGRES_PASSWORD=audit -e POSTGRES_DB=marketplace_audit \
  -p 127.0.0.1::5432 postgres:16-alpine
docker port supplify-marketplace-audit 5432   # e.g. 127.0.0.1:58175
export SUPPLIFY_MARKETPLACE_DATABASE_URL=postgres://postgres:audit@127.0.0.1:<port>/marketplace_audit
```

## Run

```bash
pnpm test:marketplace:pg
MARKETPLACE_BENCH=1 pnpm test:marketplace:pg   # include the benchmark suite
```

## Safety

- `env.js` refuses any URL whose host is not `127.0.0.1` or whose database is not
  `marketplace_audit`, and the harness re-checks `current_database()` after connecting.
- `env.js` sets `SUPPLIFY_DATABASE_URL`. Without it, `resolveNativeDatabaseUrl()` silently
  rewrites a localhost `DATABASE_URL` to the dev `supplify-postgres` container.
- Redis is disabled (`REDIS_URL=''`), so caches use the in-process fallback.

## Pieces

| File           | Purpose                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| `env.js`       | Side-effect import: points the API at the audit DB. Import it before any API module.          |
| `harness.js`   | `startMarketplaceDb()`, `resetMarketplaceDb(pool)`, `startApiForTest()`, `authHeaders(sub)`   |
| `fixtures.js`  | `createSupplierOrg`, `createRestaurant`, `createProduct`, `follow`, `block`, `createOrder`, … |
| `auth-mock.js` | `withTestAuth` for `vi.mock('…/lib/auth.js')`; `makeTestToken(sub)` for HTTP and sockets      |

HTTP tests mock `lib/auth.js` and send `x-test-user: <userSub>` (or `authHeaders(sub)`):

```js
vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})
```

`resetMarketplaceDb` truncates the tenant root tables with `CASCADE` and restores the
migration-seeded rows the cascade removes (for example the platform `product_category` tree),
from a snapshot schema taken right after migrations.
