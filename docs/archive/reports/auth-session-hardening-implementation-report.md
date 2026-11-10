# Auth session hardening — implementation report

**Date:** 2026-07-29  
**OTP:** Not implemented (deferred).

## Architecture discovered

See `docs/audits/auth-session-architecture-current-state.md`. Web ERP uses Keycloak OIDC + HttpOnly cookies; mobile uses bearer tokens; staff magic-link and consumer JWT are separate.

## Development values verified (live Admin API)

**Before hardening (audited earlier same day):**

| Setting                       | Value   |
| ----------------------------- | ------- |
| Access token (`supplify-api`) | 3600 s  |
| SSO idle                      | 1800 s  |
| SSO max                       | 36000 s |
| Rotation                      | off     |

**After `apply-session-policy.mjs` (verified):**

| Setting                                         | Value              |
| ----------------------------------------------- | ------------------ |
| `accessTokenLifespan`                           | **1200** (20 min)  |
| `ssoSessionIdleTimeout`                         | **604800** (7 d)   |
| `ssoSessionMaxLifespan`                         | **2592000** (30 d) |
| `clientSessionIdleTimeout`                      | **604800**         |
| `clientSessionMaxLifespan`                      | **2592000**        |
| `revokeRefreshToken`                            | **true**           |
| `refreshTokenMaxReuse`                          | **0**              |
| `rememberMe`                                    | **false**          |
| Client `access.token.lifespan` (api/mobile/web) | **1200**           |

## Preproduction / production

| Env        | Live verification                                                                     |
| ---------- | ------------------------------------------------------------------------------------- |
| Preprod    | **Unknown** — Admin API unauthorized with available credentials; apply script not run |
| Production | **Unknown** — same                                                                    |

**Do not ship traffic assumptions** until `apply-session-policy.mjs` is run and verified per env.

## Keycloak changes

- `deploy/keycloak/session-policy.json`
- `deploy/keycloak/apply-session-policy.mjs`
- Realm exports (`realm-export.json`, `.preprod.json`, `.prod.json`) + `mobile-client.json` updated with explicit session fields
- README updated

## Backend changes

- Cookie maxAges: 20 min access / 30 day refresh (`AUTH_*_COOKIE_MAX_AGE_MS`)
- `refreshAccessTokenDetailed` + `refreshAccessTokenSingleFlight` + failure classification
- Transient Keycloak failures → **503** `AUTH_TEMPORARILY_UNAVAILABLE` (**cookies retained**)
- Invalid/reuse → clear cookies + 401
- `/auth/me`, `/auth/session`, `/auth/refresh`, `/auth/mobile/refresh` return `accessTokenExpiresAt`
- Sanitized events in `auth-session-events.js`

## Frontend changes

- `apps/web/src/lib/authSessionRefresh.ts` — proactive schedule, visibility/online, single-flight
- `AuthGuard` starts scheduler from `/auth/me`
- RTK `base.ts` — 401 fallback refresh; no logout on `FETCH_ERROR` / auth 503
- Logout stops scheduler (`Header`, `AdminTopBar`)

## Cookie / rotation

- Refresh remains HttpOnly
- Rotation enabled in Keycloak; concurrent refreshes coalesced in API + web
- Cookie maxAge aligned with policy (not security boundary)

## Tests added / updated

| Suite                        | Result                                 |
| ---------------------------- | -------------------------------------- |
| `auth-session.test.js`       | Pass                                   |
| `authSessionRefresh.test.ts` | Pass                                   |
| `auth.routes.test.js`        | Pass (after cookies optional chaining) |
| `socket-auth.test.js`        | Pass                                   |
| `rbac.test.js`               | Pass                                   |
| `AuthGuard.test.tsx`         | Pass                                   |

## Manual tests

| Scenario                             | Status                                   |
| ------------------------------------ | ---------------------------------------- |
| Dev Keycloak policy apply + verify   | **Done**                                 |
| Browser open > access token lifetime | Pending QA (proactive refresh scheduled) |
| PWA close/reopen                     | Pending QA                               |
| Offline refresh                      | Code path covered; pending device QA     |
| Driver Maps return                   | Pending QA                               |
| Multi-tab                            | Single-flight covered in unit tests      |
| Preprod/prod apply                   | **Not done** — credentials               |

## Known limitations

- Admin stricter idle/max requires separate Keycloak client (deferred)
- Password-reset session kill depends on Keycloak admin actions (document in runbook)
- `supplify-mobile` not in preprod/prod realm exports (existing gap)
- Sibling mobile proactive timer alignment is documentation-first

## Rollout

1. Dev — **done** (policy applied)
2. Deploy API + web with proactive refresh
3. Preprod: run apply script → verify Admin GET → internal soak
4. Pilot tenants → production apply + verify

## Rollback

1. Revert `session-policy.json` snapshot → re-apply
2. Redeploy previous API/web
3. Optional: `AUTH_PROACTIVE_REFRESH=false`

## OTP integration timing

Introduce email OTP **only** on new interactive logins (after logout, absolute/idle expiry, revocation, password events). Do **not** require OTP on proactive refresh.
