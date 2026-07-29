# Auth session architecture — current state

**Date:** 2026-07-29  
**Scope:** Keycloak OIDC (ERP humans), web cookies, mobile bearer tokens, staff magic-link, consumer JWT, impersonation, service/machine auth.  
**OTP:** Out of scope (not implemented).

---

## Executive summary

Development Keycloak was verified live via Admin API. Web ERP users use HttpOnly `access_token` / `refresh_token` cookies. Access JWTs for `supplify-api` last **1 hour**, but **SSO Session Idle is 30 minutes**. The web app does not refresh until an API request fails JWT verification. Local JWT checks do not touch Keycloak, so idle is not extended by normal use. **Active web/PWA users are forced to re-authenticate about every hour** — unacceptable for drivers and disruptive for all ERP roles.

Preprod and production Keycloak session settings are **unknown live** (Admin API unauthorized with available credentials; realm JSON omits SSO/token lifespan fields).

---

## 1. Access-token lifespan

| Source                                            | Value                      | Certainty           |
| ------------------------------------------------- | -------------------------- | ------------------- |
| Dev realm default `accessTokenLifespan`           | **300 s (5 min)**          | Verified live (dev) |
| Dev client `supplify-api` `access.token.lifespan` | **3600 s (1 h)**           | Verified live (dev) |
| Dev client `supplify-mobile`                      | unset → **inherits 5 min** | Verified live (dev) |
| Preprod/prod client attributes in exports         | **not set**                | Export only         |
| Preprod/prod live                                 | **Unknown**                | Unknown live        |
| App cookie `access_token` maxAge                  | **1 hour** (hardcoded)     | Code                |

Web OAuth uses confidential client **`supplify-api`**. Mobile OAuth uses public client **`supplify-mobile`** (PKCE).

---

## 2. Refresh-token lifespan

| Source                                            | Value                                                              | Certainty               |
| ------------------------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| Keycloak (no `offline_access` on web login scope) | Tied to **SSO session idle/max**                                   | Verified live semantics |
| Web OAuth scopes                                  | `openid profile email` — **no offline_access**                     | Code (`auth.js`)        |
| Mobile OAuth                                      | Expo AuthSession; optional scope includes offline_access on client | Code + export           |
| App cookie `refresh_token` maxAge                 | **7 days**                                                         | Code                    |
| Refresh rotation (dev)                            | **`revokeRefreshToken=false`**                                     | Verified live (dev)     |
| `refreshTokenMaxReuse` (dev)                      | **0** (N/A while rotation off)                                     | Verified live (dev)     |

Cookie maxAge is **not** authoritative. Keycloak rejects refresh after SSO idle/max even if the cookie remains.

---

## 3. SSO session idle timeout

| Env                | Value               | Certainty     |
| ------------------ | ------------------- | ------------- |
| Development        | **1800 s (30 min)** | Verified live |
| Preprod            | **Unknown**         | Unknown live  |
| Production         | **Unknown**         | Unknown live  |
| Realm JSON exports | **field absent**    | Export only   |

---

## 4. SSO session maximum

| Env                  | Value                  | Certainty     |
| -------------------- | ---------------------- | ------------- |
| Development          | **36000 s (10 hours)** | Verified live |
| Preprod / production | **Unknown**            | Unknown live  |
| Realm JSON exports   | **field absent**       | Export only   |

---

## 5. Client session idle and maximum

| Setting (dev)                                         | Value                    | Certainty     |
| ----------------------------------------------------- | ------------------------ | ------------- |
| `clientSessionIdleTimeout`                            | **0** (inherit SSO idle) | Verified live |
| `clientSessionMaxLifespan`                            | **0** (inherit SSO max)  | Verified live |
| Client attribute overrides on `supplify-api` / mobile | **empty**                | Verified live |

---

## 6. Cookie expiration and security

Configured in `apps/api/src/lib/rbac.js` `setAuthCookies` / `authCookieOptions`, env in `apps/api/src/config/env.js`.

| Cookie                         | maxAge         | httpOnly | secure                                  | sameSite           | domain                   |
| ------------------------------ | -------------- | -------- | --------------------------------------- | ------------------ | ------------------------ |
| `access_token`                 | 1 h            | true     | `COOKIE_SECURE`                         | `COOKIE_SAME_SITE` | optional `COOKIE_DOMAIN` |
| `refresh_token`                | 7 d            | true     | same                                    | same               | same                     |
| Express session (`/auth` only) | 24 h           | true     | same                                    | same               | same                     |
| `impersonation_token`          | 60 min default | true     | NODE_ENV production (not COOKIE_SECURE) | —                  | —                        |
| `active_tenant_token`          | 30 d           | true     | COOKIE\_\*                              | —                  | —                        |
| `consumer_auth_token`          | 30 d           | true     | COOKIE\_\*                              | —                  | —                        |

Deployed examples: preprod/prod often `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=none`, `COOKIE_DOMAIN=.supplifyerp.com` for cross-host setups; same-origin nginx deployments can use `lax`.

---

## 7. Browser / PWA persistence

- Auth cookies use **maxAge** (persistent), not session cookies → survive browser/PWA close.
- Service worker (`apps/web/static/sw.js`) **skips** `/api` and `/auth` — no token caching.
- Capacitor driver shell (`apps/web/capacitor.config.ts`) uses the same cookie/OAuth web path; no separate Capacitor auth plugin.
- Session restore = cookies present + Keycloak still accepts refresh.

---

## 8. Staff magic-link sessions

| Item      | Detail                                                                                      |
| --------- | ------------------------------------------------------------------------------------------- |
| Mechanism | UUID in `staff_portal_session` table                                                        |
| TTL       | **12 hours** (`MAGIC_LINK_TTL_MS`)                                                          |
| Transport | `localStorage['staff.portal.token']` + Bearer / body / query                                |
| APIs      | `/api/public/staff/*` only                                                                  |
| Keycloak  | Separate path for staff without `user_id`; `STAFF_PORTAL` Keycloak users use normal cookies |
| OTP later | Should be evaluated separately; do **not** silently merge into ERP Keycloak policy          |

---

## 9. Consumer (diner) authentication

| Item           | Detail                                            |
| -------------- | ------------------------------------------------- |
| Mechanism      | API-signed HS256 JWT cookie `consumer_auth_token` |
| TTL            | **30 days**                                       |
| Keycloak       | **Not used**                                      |
| Refresh        | None — re-login/signup                            |
| This hardening | **Do not change** unless security-required        |

---

## 10. Service-account / machine authentication

| Mechanism                                 | Present?                                                   |
| ----------------------------------------- | ---------------------------------------------------------- |
| Client-credentials grant in API           | **No**                                                     |
| Keycloak Admin API (`admin-cli` password) | Yes — provisioning / password reset                        |
| ROPC password grant                       | Dev/tests/invites; disabled on preprod/prod `supplify-api` |
| API keys                                  | Entitlement seed only; no middleware                       |

Cron/jobs use DB credentials / internal secrets — not user refresh tokens.

---

## 11. Environment differences

| Topic                                    | Dev                 | Preprod            | Prod            |
| ---------------------------------------- | ------------------- | ------------------ | --------------- |
| Realm name                               | `Supplify`          | `supplify-preprod` | `supplify-prod` |
| Registration                             | allowed             | allowed            | **disabled**    |
| Direct access grants (`supplify-api`)    | true                | false              | false           |
| Client `access.token.lifespan` in export | 3600                | absent             | absent          |
| `supplify-mobile` in export              | yes                 | **no**             | **no**          |
| Live SSO/token policy                    | Verified (see §1–5) | **Unknown**        | **Unknown**     |
| Seed users in export                     | yes                 | no                 | no              |

Import note: Keycloak `--import-realm` **skips** if realm already exists — JSON alone does not update live session settings on existing deploys.

---

## 12. Unknown live settings

Must be verified via Admin API/Console before production rollout:

- Preprod: all SSO/token/rotation settings
- Production: all SSO/token/rotation settings
- Whether admin password reset invalidates existing user sessions (Keycloak action policy)
- Whether hosted realms differ from exports after manual Admin UI edits

---

## Request / refresh behavior (current)

```text
Web login → Keycloak code → /auth/callback → setAuthCookies
API request → requireAuth verifies JWT
  → if expired + cookie client → refreshAccessToken → setAuthCookies → continue
  → if expired + Bearer → 401 JWT_EXPIRED (mobile must /auth/mobile/refresh)
Web RTK 401 → redirect /login (no client-side refresh call)
No proactive refresh scheduler on web
No server-side single-flight for refresh
Mobile: SecureStore + client single-flight + ensureValidAccessToken on bootstrap
```

### Forced re-login triggers (current)

| Trigger                           | Forced login?                                       |
| --------------------------------- | --------------------------------------------------- |
| Access token expiry alone         | Eventually yes (via failed refresh after SSO idle)  |
| Browser/PWA close/reopen          | No (cookies persist) until Keycloak rejects refresh |
| Explicit logout                   | Yes                                                 |
| Refresh failure / SSO idle or max | Yes                                                 |
| Account deactivated on callback   | Yes                                                 |
| Staff magic-link expiry           | Yes (that path only)                                |

### Role policy

Admins, restaurants, suppliers, drivers, and Keycloak staff share **one** `supplify-api` client and realm policy. No safe role-based Keycloak timeout without a separate admin client/flow (deferred).

---

## Key file map

| Area                  | Path                                     |
| --------------------- | ---------------------------------------- |
| Auth routes           | `apps/api/src/routes/auth.routes.js`     |
| Cookies + requireAuth | `apps/api/src/lib/rbac.js`               |
| Keycloak OIDC         | `apps/api/src/lib/auth.js`               |
| Env cookies/KC        | `apps/api/src/config/env.js`             |
| Web 401               | `apps/web/src/services/api/base.ts`      |
| AuthGuard             | `apps/web/src/components/AuthGuard.tsx`  |
| Realm exports         | `deploy/keycloak/realm-export*.json`     |
| Mobile tokens         | `../supplify-mobile/src/features/auth/*` |

---

## Related docs

- Prior canvas audit (dev numbers): conversation 2026-07-29
- Onboarding: `docs/onboarding/09-authentication-rbac.md` (documents 1h / 7d cookies; incomplete vs live Keycloak)
