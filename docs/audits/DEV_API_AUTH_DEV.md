# Dev API Auth — Railway Development

**Date:** 2026-06-11  
**API:** `https://supplify-api-dev-development.up.railway.app`  
**Keycloak:** `https://keycloak-dev.supplifyerp.com`  
**Realm:** `Supplify`  
**Client:** `supplify-api` (confidential, secret `changeme` unless overridden)

---

## Demo credentials (from `seed-demo-users.js`)

| Role         | Email                     | Password               | Realm role     |
| ------------ | ------------------------- | ---------------------- | -------------- |
| Admin        | `admin@supplify.com`      | `SupplifyAdmin1!`      | `admin`        |
| Supplier     | `supplier@supplify.com`   | `SupplifySupplier1!`   | `supplier`     |
| Restaurant   | `restaurant@supplify.com` | `SupplifyRestaurant1!` | `restaurant`   |
| Staff portal | _(no default)_            | _(no default)_         | `staff_portal` |

Staff portal accounts are created per restaurant via `/api/staff/create-account` + magic link — there is no global demo staff user in Keycloak by default.

---

## Findings (2026-06-11 audit)

| Role           | Password grant on Railway Keycloak | Smoke harness (latest)                                                                 |
| -------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| **Admin**      | **Works**                          | `keycloak_grant` OK                                                                    |
| **Supplier**   | **Works**                          | `keycloak_grant` OK — `supplier@supplify.com` / `SupplifySupplier1!`                   |
| **Restaurant** | **Works**                          | `keycloak_grant` OK — `restaurant@supplify.com` / `SupplifyRestaurant1!`               |
| **Staff**      | **N/A**                            | `unavailable` — set `SUPPLIFY_STAFF_TOKEN` or `E2E_STAFF_EMAIL` / `E2E_STAFF_PASSWORD` |

Earlier audit runs reported `invalid_grant` for supplier/restaurant; the expanded harness re-test confirmed demo password grant works on Railway Keycloak as of 2026-06-11.

**Token env override verified:** Setting `SUPPLIFY_ADMIN_TOKEN` is preferred over password grant (`getTokenSource('admin')` → `env_override`, token bytes match).

---

## Token env overrides (verified in harness)

The smoke test **always prefers** `SUPPLIFY_*_TOKEN` over Keycloak password grant. Set any combination:

| Env var                     | Role                                        |
| --------------------------- | ------------------------------------------- |
| `SUPPLIFY_ADMIN_TOKEN`      | Platform admin                              |
| `SUPPLIFY_SUPPLIER_TOKEN`   | Supplier tenant                             |
| `SUPPLIFY_RESTAURANT_TOKEN` | Restaurant tenant                           |
| `SUPPLIFY_STAFF_TOKEN`      | Staff portal (Keycloak `staff_portal` role) |

Optional credential overrides (password grant fallback):

| Env var                                            | Default                                            |
| -------------------------------------------------- | -------------------------------------------------- |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`           | `admin@supplify.com` / `SupplifyAdmin1!`           |
| `E2E_SUPPLIER_EMAIL` / `E2E_SUPPLIER_PASSWORD`     | `supplier@supplify.com` / `SupplifySupplier1!`     |
| `E2E_RESTAURANT_EMAIL` / `E2E_RESTAURANT_PASSWORD` | `restaurant@supplify.com` / `SupplifyRestaurant1!` |
| `E2E_STAFF_EMAIL` / `E2E_STAFF_PASSWORD`           | _(none)_                                           |

Keycloak connection:

| Env var                  | Railway dev value                      |
| ------------------------ | -------------------------------------- |
| `KEYCLOAK_BASE_URL`      | `https://keycloak-dev.supplifyerp.com` |
| `KEYCLOAK_REALM`         | `Supplify`                             |
| `KEYCLOAK_CLIENT_ID`     | `supplify-api`                         |
| `KEYCLOAK_CLIENT_SECRET` | `changeme`                             |

---

## Commands

### 1. Fetch admin token (PowerShell)

```powershell
$body = @{
  grant_type    = 'password'
  client_id     = 'supplify-api'
  client_secret = 'changeme'
  username      = 'admin@supplify.com'
  password      = 'SupplifyAdmin1!'
  scope         = 'openid profile email'
}
$r = Invoke-RestMethod -Method Post `
  -Uri 'https://keycloak-dev.supplifyerp.com/realms/Supplify/protocol/openid-connect/token' `
  -ContentType 'application/x-www-form-urlencoded' `
  -Body $body
$r.access_token
```

### 2. Fetch supplier/restaurant token (after seeding users)

Same as above; replace `username` / `password` with supplier or restaurant demo credentials.

### 3. Verify token sources (smoke harness startup)

```powershell
cd c:\myProjects\supplify_erp\apps\api
$env:SUPPLIFY_DEV_API_URL = 'https://supplify-api-dev-development.up.railway.app'
$env:KEYCLOAK_BASE_URL = 'https://keycloak-dev.supplifyerp.com'
$env:KEYCLOAK_CLIENT_SECRET = 'changeme'
# Optional overrides:
# $env:SUPPLIFY_SUPPLIER_TOKEN = '<paste Bearer token>'
# $env:SUPPLIFY_RESTAURANT_TOKEN = '<paste Bearer token>'
# $env:SUPPLIFY_STAFF_TOKEN = '<paste Bearer token>'
pnpm smoke:dev-api --phase=admin
```

On startup the harness prints per-role auth source (`env_override` vs `keycloak_grant`) and OK/FAIL.

### 4. Full safe smoke run

```powershell
cd c:\myProjects\supplify_erp\apps\api
$env:SUPPLIFY_DEV_API_URL = 'https://supplify-api-dev-development.up.railway.app'
$env:KEYCLOAK_BASE_URL = 'https://keycloak-dev.supplifyerp.com'
$env:KEYCLOAK_CLIENT_SECRET = 'changeme'
$env:SUPPLIFY_TEST_MODE = 'safe'
$env:SUPPLIFY_ALLOW_MUTATIONS = 'false'
pnpm smoke:dev-api
```

### 5. Mutation probes (smoke*test* prefix)

```powershell
$env:SUPPLIFY_ALLOW_MUTATIONS = 'true'
# Requires working SUPPLIFY_SUPPLIER_TOKEN and SUPPLIFY_RESTAURANT_TOKEN
pnpm smoke:dev-api --phase=mutations
```

### 6. Seed demo users on Railway Keycloak

```powershell
cd c:\myProjects\supplify_erp\apps\api
$env:KEYCLOAK_BASE_URL = 'https://keycloak-dev.supplifyerp.com'
$env:KEYCLOAK_ADMIN_USERNAME = '<keycloak-admin>'
$env:KEYCLOAK_ADMIN_PASSWORD = '<keycloak-admin-password>'
pnpm seed:demo-users
```

---

## Staff portal auth (alternative to `SUPPLIFY_STAFF_TOKEN`)

1. Restaurant admin creates staff portal account: `POST /api/staff/:id/create-account`
2. Staff receives magic link email → `POST /api/public/staff/request-link` (skipped in smoke — sends email)
3. Session token from magic link can be used as `SUPPLIFY_STAFF_TOKEN` if exchanged for a Keycloak JWT, or test staff self routes via session cookie in browser.

For automated smoke tests, **`SUPPLIFY_STAFF_TOKEN`** (Bearer JWT for a `staff_portal` Keycloak user) is the supported path.

---

## Related artifacts

- [`dev-api-preflight.json`](./dev-api-preflight.json) — reachability preflight
- [`DEV_API_ROUTE_TEST_RESULTS.md`](./DEV_API_ROUTE_TEST_RESULTS.md) — live route results
- [`apps/api/scripts/lib/auth-token.mjs`](../../apps/api/scripts/lib/auth-token.mjs) — token helper
