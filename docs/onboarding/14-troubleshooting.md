# 14 — Troubleshooting Guide

**Audience:** Developers, DevOps, support engineers, demo presenters.  
**Scope:** Common failures across auth, infrastructure, API errors, data, GPS, PWA, and mobile.  
**Method:** Code-traced symptoms → diagnosis → safe fix. No destructive production actions without explicit approval.

**Quick health URLs (local defaults):**

| Service  | URL                                | Check             |
| -------- | ---------------------------------- | ----------------- |
| Web      | `http://localhost:5173`            | SPA loads         |
| API      | `http://localhost:3000/api/health` | 200 JSON          |
| Keycloak | `http://localhost:8180`            | Admin console     |
| Postgres | `localhost:5433` (docker)          | `pnpm db:migrate` |
| Redis    | `localhost:6379`                   | Socket.IO + cache |
| MinIO    | `localhost:9000`                   | File uploads      |

---

## 1. Cannot log in / stuck on login page

### Symptoms

- Redirect loop to `/login`
- `/login?expired=true` after idle
- `/login?error=callback_failed`
- Keycloak form shows then returns to login with no app session

### Likely causes

| Cause                                          | Evidence                                               |
| ---------------------------------------------- | ------------------------------------------------------ |
| Keycloak down or wrong URL                     | `auth.routes.js` login catch → `error=callback_failed` |
| `KEYCLOAK_BASE_URL` mismatch                   | API `.env` vs Docker port (8180 vs 8080)               |
| OAuth `state` mismatch                         | Session store not persisting (`oauthState`)            |
| Cookie not set (Secure on HTTP)                | E2E hint in `tests/e2e/auth.setup.ts`                  |
| `WEB_ORIGIN` / `OAUTH_CALLBACK_BASE_URL` wrong | Cookies set on wrong domain                            |
| User missing realm role                        | No `restaurant`/`supplier`/`admin` role in Keycloak    |
| Demo user missing                              | Keycloak realm imported without users                  |

### Diagnose

```bash
# Keycloak up?
curl -s -o /dev/null -w "%{http_code}" http://localhost:8180/realms/Supplify

# API auth probe
curl -i http://localhost:3000/auth/session

# Recreate demo users
pnpm run seed:demo-users
```

**Browser:** DevTools → Application → Cookies on API origin — expect `access_token`, `refresh_token` after login.

**Logs:**

- API: `Login error`, `Error saving session` — `apps/api/src/routes/auth.routes.js`
- Keycloak container: `docker compose logs keycloak`

### Files

- `apps/api/src/routes/auth.routes.js`
- `apps/api/src/lib/auth.js` (JWKS, token exchange)
- `apps/api/src/lib/rbac.js` (`setAuthCookies`)
- `apps/api/scripts/seed-demo-users.js`
- `apps/web/src/components/AuthGuard.tsx`
- `apps/web/src/services/api/base.ts` (`redirectToLoginForAuthError`)

### Safe fix

1. Align env: `KEYCLOAK_BASE_URL=http://localhost:8180`, `WEB_ORIGIN=http://localhost:5173`, `OAUTH_CALLBACK_BASE_URL` = API public URL.
2. `pnpm run seed:demo-users` (passwords: `SupplifyAdmin1!`, etc.).
3. Clear site cookies; retry incognito.
4. Local HTTP: ensure `COOKIE_SECURE=false` in dev.
5. If session store fails: verify Postgres session table / `SESSION_SECRET` set.

### Escalation

- Production: verify Keycloak realm client redirect URIs include exact API callback URL.
- Railway: check `KEYCLOAK_USE_OPTIMIZED` and memory (`docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md`).

---

## 2. Keycloak admin / seed account failures

### Symptoms

- `Keycloak admin token failed: 401`
- `seed:full` warns "Keycloak accounts failed"
- Users exist in DB but cannot sign in

### Likely causes

- Keycloak not started before seed
- Wrong `KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN_PASSWORD` (default `admin`/`admin`)
- Realm name mismatch (`KEYCLOAK_REALM=Supplify`)
- `SKIP_KEYCLOAK=true` left set

### Diagnose

```bash
pnpm run seed:accounts      # prod-like emails
pnpm run seed:demo-users    # admin@, restaurant@, supplier@
```

### Files

- `apps/api/scripts/seed-full.mjs` (lines 77–97)
- `apps/api/scripts/seed-accounts-for-prodlike.js`
- `docker-compose.yml` Keycloak service

### Safe fix

1. `docker compose up -d keycloak` — wait for healthy.
2. Re-run account scripts (idempotent).
3. First login creates `app_user` — email must match `restaurant.contact_email` or `supplier.contact_email`.

### Escalation

- Import realm JSON from `deploy/keycloak/` if realm corrupted.

---

## 3. HTTP 401 Unauthorized on API calls

### Symptoms

- API returns `{ error: "Unauthorized" }` or 401
- RTK Query errors; empty dashboards
- Mobile: token rejected

### Likely causes

| Code path                     | Cause                          |
| ----------------------------- | ------------------------------ |
| Missing/expired JWT           | `requireAuth` in `rbac.js`     |
| Invalid issuer/JWKS           | Keycloak realm URL changed     |
| Staff portal on wrong route   | `assertStaffPortalRouteAccess` |
| Bearer token expired (mobile) | No refresh cookie              |

### Diagnose

```bash
curl -b cookies.txt http://localhost:3000/api/auth/me
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/auth/me
```

**Logs:** `JWT verify failed`, `User not found for sub`.

### Files

- `apps/api/src/lib/rbac.js` (`requireAuth`, `verifyAccessToken`)
- `apps/api/src/lib/auth.js`
- `apps/web/src/services/api/base.ts`

### Safe fix

1. Log out and log in (`GET /auth/logout`).
2. `POST /auth/refresh` if refresh cookie valid.
3. Verify `app_user.keycloak_sub` matches token `sub` (re-login upserts).
4. Staff users: use `/staff/login` only.

### Escalation

- Clock skew between API and Keycloak (rare) — sync NTP.

---

## 4. HTTP 403 Forbidden

### Symptoms

- Action visible but API returns 403
- "You don't have permission" toasts

### Likely causes

- Missing `requirePermission` key for role
- Plan feature off (`requireFeature`)
- Billing lock (`billingAccessMiddleware`) — sometimes 402, not 403
- Driver accessing non-delivery routes
- Admin tab without `adminPermissions`
- CSRF header missing on web mutations

### Diagnose

- Compare role in **Settings → Team** with `docs/architecture/rbac-permission-matrix.md`.
- `GET /api/auth/me` → `tenantPermissions` array.
- `GET /api/subscriptions/current` → features/limits.

### Files

- `apps/api/src/middlewares/billingAccess.js`
- `apps/api/src/lib/plan-enforcement.js`
- `apps/api/src/middlewares/csrf.js`
- `apps/web/src/components/RequirePermission.tsx`

### Safe fix

1. Assign correct tenant role (Owner for full access).
2. Upgrade plan or admin unlock subscription.
3. Web: ensure `X-CSRF-Token` header sent (`api/base.ts`).
4. Impersonation: permissions follow impersonated tenant, not admin superpowers on billing writes.

### Escalation

- Permission cache stale: Redis key `perm:{userId}:{tenantId}:{tenantType}` TTL 180s — wait or restart API.

---

## 5. HTTP 402 Payment Required / billing lock

### Symptoms

- Writes fail; read-only mode banners
- "Activate your account" / "Trial expired"

### Likely causes

- `lock_reason`: `pending_activation`, `free_sandbox_expired`, `SUSPENDED`, past due beyond grace
- `seed-billing` demo: `supplier-silver@` locked, `restaurant-gold@` past due

### Diagnose

```bash
# As tenant owner
GET /api/billing/status
GET /api/subscriptions/current
```

### Files

- `apps/api/src/middlewares/billingAccess.js`
- `apps/api/scripts/seed-billing.js`

### Safe fix

1. **Demo:** use `restaurant@supplify.com` / `supplier@supplify.com` (active Gold).
2. Complete activation checkout (`/app/settings` → billing).
3. Admin: `POST /api/admin-dashboard/subscriptions/:id/unlock` or extend trial.

### Escalation

- Stripe/payment provider misconfig — check `billing.routes.js` logs.

---

## 6. HTTP 429 Too Many Requests

### Symptoms

- `Too many requests from this IP`
- Public endpoints fail under load test

### Likely causes

- `express-rate-limit` on API (`server.js`)
- Public routes: 60/min prod, 200/min dev
- Driver location rate limit (`driver-location.service.js`)

### Diagnose

- Response headers `RateLimit-*`
- Redis keys `rl:*` if Redis store enabled

### Files

- `apps/api/src/server.js` (rate limit config)
- `apps/api/src/config/env.js` `RATE_LIMIT_MAX`

### Safe fix

1. Dev: increase `RATE_LIMIT_MAX` temporarily.
2. Back off retries in client.
3. Do not disable rate limits in production without review.

### Escalation

- DDoS / bot traffic — WAF/nginx layer.

---

## 7. HTTP 500 / 502 / 503

### Symptoms

- Generic error toasts
- nginx 502 Bad Gateway
- API process crash loop

### Likely causes

| Status | Cause                                   |
| ------ | --------------------------------------- |
| 500    | Unhandled exception; DB query error     |
| 502    | API down behind proxy; upstream timeout |
| 503    | Health check failing; DB pool exhausted |

### Diagnose

```bash
docker compose logs api --tail 100
curl http://localhost:3000/api/health
```

**Logs:** `request-timing` middleware; uncaught stack in API stdout.

### Files

- `apps/api/src/server.js`
- `apps/api/src/lib/db.js` (pool)
- `deploy/nginx/*`

### Safe fix

1. Restart API container.
2. Verify `DATABASE_URL` connectivity.
3. Run pending migrations (`pnpm db:migrate`).
4. Check disk/memory (Keycloak OOM — `KEYCLOAK_RAILWAY_MEMORY_FIX.md`).

### Escalation

- Postgres connection limit — reduce pool size or scale DB.

---

## 8. Redis connection / cache failures

### Symptoms

- Socket.IO chat not realtime (falls back or disconnects)
- Permission cache misses causing slow auth
- Rate limiter errors on startup
- Logs: `ECONNREFUSED` Redis, `MaxRetriesPerRequestError`

### Likely causes

- `REDIS_URL` unset (dev may run without Redis — degraded mode)
- Railway: using `REDIS_PUBLIC_URL` for internal traffic (egress/fees) — wrong URL
- Redis down

### Diagnose

```bash
redis-cli -u $REDIS_URL ping
```

### Files

- `apps/api/src/config/resolve-redis-url.js`
- `apps/api/src/lib/cache.js`
- Socket.IO Redis adapter setup in server

### Safe fix

1. Local: `docker compose up -d redis`; set `REDIS_URL=redis://localhost:6379`.
2. Railway: use private `REDIS_URL`, not public proxy (`isLikelyPublicRedisUrl`).
3. Temporary: API may boot without Redis — expect no cross-instance sockets.

### Escalation

- Redis memory eviction clearing sessions — increase plan or TTL review.

---

## 9. Database migration failures

### Symptoms

- API crash on startup: missing table/column
- `migrate` container: `WARN: partial SQL migrations`
- `role "api_user" does not exist`
- `cannot drop type order_status`

### Likely causes

- Partial failed migration
- Skipped migration file
- Wrong Postgres port (`5432` vs `5433` docker)
- 175 migrations not all applied

### Diagnose

```sql
SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 10;
```

```bash
pnpm db:migrate
docker compose logs migrate
```

### Files

- `apps/api/db/migrations/*.sql`
- `apps/api/scripts/run-migration.js`
- `apps/api/src/lib/migrator.js` (runtime backfill)
- `docs/guides/database-migrations.md`

### Safe fix

1. **Dev only:** `pnpm db:reset` or new Docker volume.
2. Fix failing SQL; re-run `run-migration.js`.
3. `api_user` grants: already commented in `0019`/`0020`/`0039` — use `postgres` user locally.
4. `0021` enum issue: reset DB per migration guide.

### Escalation

- Production: never `db:reset` — forward-fix migration with idempotent `IF NOT EXISTS`.

---

## 10. `seed:full` / demo data problems

### Symptoms

- Empty admin tenant lists
- Login works but no orders/products
- Keycloak users missing
- Wrong plan tier data

### Likely causes

- Seed aborted mid-way
- `ALLOW_PRODLIKE_SEED` not set (handled by `seed:full`)
- Keycloak step failed but DB seeded

### Diagnose

Re-run full seed ( **wipes commercial data** ):

```bash
pnpm run seed:full
```

### Files

- `apps/api/scripts/seed-full.mjs`
- Individual scripts listed in seed-full output

### Safe fix

1. Full re-seed on local only.
2. Partial: `pnpm run seed:demo-tenants`, `seed:plan-tiers`, `seed:demo-readiness`.
3. Keycloak only: `pnpm run seed:accounts && pnpm run seed:demo-users`.

### Escalation

- Staging with real data: never run `seed:full` — use targeted scripts.

---

## 11. GPS / delivery tracking not showing

### Symptoms

- Restaurant order tracking empty
- Map never loads
- "Last seen" stale immediately
- Driver location POST fails

### Likely causes

- `GPS_TRACKING_ENABLED=false`
- No driver assignment / order not in transit
- `MAP_PROVIDER` missing API key (`GOOGLE_MAPS_API_KEY`, `MAPBOX_ACCESS_TOKEN`)
- Stale threshold: `GPS_STALE_AFTER_SECONDS=300`
- Privacy: `GPS_ALLOW_RESTAURANT_LIVE_TRACKING=false`

### Diagnose

- Env in `apps/api/src/config/env.js` lines 244–252
- Order status must be in transit family
- Network tab: driver location POST responses

### Files

- `docs/features/drivers-and-gps-tracking.md`
- `apps/api/src/services/driver-location.service.js`
- `apps/api/src/services/delivery-eta.service.js`
- `apps/web/src/components/orders/RestaurantOrderTrackingPanel.tsx`

### Safe fix

1. Enable `GPS_TRACKING_ENABLED=true`.
2. Complete fulfillment path: assign driver → mark shipped/in transit.
3. Add map API key to `apps/web/.env`.
4. Demo without live GPS: narrate ETA text-only; show fulfillment board.

### Escalation

- Mobile app not sending background location — check mobile permissions docs.

---

## 12. PWA / service worker / push notifications

### Symptoms

- Install prompt never appears
- Push opt-in fails
- `serviceWorker registration failed`
- Notifications never arrive

### Likely causes

- Not HTTPS (required except localhost)
- Browser blocked notifications
- Missing VAPID keys on API
- `push_notifications` plan feature off
- User denied permission

### Diagnose

- `apps/web/static/manifest.webmanifest` — tested by `pwaManifest.test.ts`
- `GET /api/push/vapid-public-key`
- Browser Application → Service Workers

### Files

- `apps/web/src/lib/registerServiceWorker.ts`
- `apps/web/src/hooks/usePushNotifications.ts`
- `apps/api/src/routes/push.routes.js`

### Safe fix

1. Use HTTPS or localhost.
2. Reset notification permission in browser settings.
3. Configure VAPID env vars on API.
4. Gold plan tenant for push feature gate.

### Escalation

- iOS Safari PWA limitations — document platform constraints.

---

## 13. Socket.IO / chat realtime

### Symptoms

- Messages appear only after refresh
- Typing indicator stuck
- Console WebSocket errors

### Likely causes

- Redis adapter unavailable (single instance still works locally)
- Wrong socket base URL (`socketBaseUrl.ts`)
- CORS origin mismatch
- Auth cookie not sent cross-origin

### Diagnose

- `apps/web/src/lib/socketBaseUrl.test.ts`
- Network WS connection to API origin

### Files

- `apps/web/src/hooks/useChatRealtime.ts`
- API Socket.IO setup in `server.js`

### Safe fix

1. Ensure web proxies API in dev Vite config.
2. Start Redis for multi-instance.
3. Same-site cookies: align API and web domains.

### Escalation

- Production: sticky sessions or Redis adapter mandatory.

---

## 14. File upload / MinIO / S3 errors

### Symptoms

- Product images fail
- Chat attachments 500
- `STORAGE_DRIVER` misconfiguration

### Likely causes

- MinIO not running
- `S3_ENDPOINT`, keys wrong
- `storage_mb` plan limit exceeded

### Diagnose

```bash
docker compose ps minio
curl http://localhost:9000/minio/health/live
```

### Files

- `apps/api/src/config/env.js` `STORAGE_DRIVER`
- `apps/api/src/routes/files.routes.js`

### Safe fix

1. `docker compose up -d minio`
2. `STORAGE_DRIVER=s3` with local MinIO credentials from `docker/.env`.

### Escalation

- Production S3 bucket policy / IAM.

---

## 15. CSRF errors on POST/PATCH/DELETE

### Symptoms

- 403 with CSRF message
- Mutations work in Postman but not browser

### Likely causes

- Missing `X-CSRF-Token: 1` header
- Cookie session without CSRF setup
- Mobile Bearer incorrectly blocked (should skip — see `csrf.test.js`)

### Files

- `apps/api/src/middlewares/csrf.js`
- `apps/web/src/services/api/base.ts`

### Safe fix

1. Use generated API client (sets header).
2. Mobile: use `Authorization: Bearer` only.
3. Public routes `/api/public/*` exempt.

### Escalation

- Custom integrators must document CSRF header requirement.

---

## 16. CORS / cookie / third-party login issues

### Symptoms

- API calls blocked by CORS
- Cookies not sent on cross-subdomain setup

### Likely causes

- `WEB_ORIGIN` not in CORS allowlist
- `COOKIE_DOMAIN` wrong for subdomain split
- `SameSite=None` without `Secure`

### Files

- `apps/api/src/server.js` CORS config
- `apps/api/src/lib/rbac.js` cookie options

### Safe fix

1. Set `WEB_ORIGIN` exactly (no trailing slash mismatch).
2. Production: first-party API+web domain pattern per `callbackOrigin()` docs.

### Escalation

- Split domains require `COOKIE_DOMAIN=.example.com` + HTTPS.

---

## 17. Impersonation issues (admin)

### Symptoms

- Impersonation banner but wrong tenant
- 403 while impersonating
- Cannot exit impersonation

### Likely causes

- `impersonation_token` cookie invalid/expired
- Admin missing `ADMIN_TENANTS`
- Billing lock still enforced (by design)

### Files

- `apps/api/src/lib/impersonation.js`
- `apps/web/src/hooks/useImpersonation.ts`

### Safe fix

1. `POST /api/admin-dashboard/impersonate/stop`
2. Clear cookies; re-login admin.

### Escalation

- Audit log review for impersonation events.

---

## 18. Mobile app auth / parity

### Symptoms

- Mobile login fails; web works
- Plan gates differ mobile vs web

### Likely causes

- Keycloak mobile client not configured (`docs/mobile/KEYCLOAK_MOBILE_CLIENT.md`)
- `EXPO_PUBLIC_API_URL` points to localhost on physical device
- Types out of sync with `apps/web/src/types/index.ts`

### Safe fix

1. Configure Keycloak public client with PKCE + redirect `supplify://auth/callback`.
2. Use LAN IP or public API URL on device.
3. Run `cd supplify-mobile && npm run typecheck`.

### Escalation

- See `docs/mobile/MOBILE_FEATURE_PARITY.md`.

---

## 19. Cron / background jobs not running

### Symptoms

- Scheduled quick lists never place
- Trial expiry not locking
- Invoices not marking overdue

### Likely causes

- `CRONS_ENABLED=false`
- `DELIVERY_ROLLOVER_ENABLED=false` (rollover no-op by design)
- API single instance crashed

### Files

- `apps/api/src/lib/register-cron-jobs.js`
- `docs/operations/cron-jobs.md`

### Safe fix

1. Enable crons in env for non-dev.
2. Manual: `node apps/api/scripts/run-delivery-rollover.mjs --force`

### Escalation

- Move jobs to dedicated worker if API scales horizontally.

---

## 20. Typecheck / build / test failures (local dev)

### Symptoms

- `pnpm typecheck` fails
- Vitest failures after pull

### Safe fix

1. `pnpm install`
2. `pnpm db:migrate`
3. `pnpm --filter @supplify/api test:run`
4. `pnpm --filter @supplify/web test:run`

### Escalation

- Compare with CI logs; check Node 18+.

---

## Log locations summary

| Component    | Where                                             |
| ------------ | ------------------------------------------------- |
| API          | stdout / Railway logs / `docker compose logs api` |
| Web          | Vite dev console; nginx access in prod            |
| Keycloak     | `docker compose logs keycloak`                    |
| Postgres     | `docker compose logs postgres`                    |
| Migrations   | `docker compose logs migrate`                     |
| E2E failures | `tests/e2e/test-results/`                         |

---

## Escalation matrix

| Severity | Condition               | Action                                                  |
| -------- | ----------------------- | ------------------------------------------------------- |
| P0       | Production auth down    | Status page; rollback API; verify Keycloak              |
| P1       | Orders cannot be placed | Check billing lock, DB, API 500s                        |
| P2       | Chat/realtime degraded  | Redis + Socket.IO                                       |
| P3       | Reports slow            | Analytics indexes; read replicas                        |
| P4       | Demo script gap         | Use backups in [12-demo-script.md](./12-demo-script.md) |

---

_Document version: 2026-06-17. Related: [09-authentication-rbac.md](./09-authentication-rbac.md), [08-database-guide.md](./08-database-guide.md)._
