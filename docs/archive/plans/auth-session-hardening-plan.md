# Auth Session Hardening Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes track progress. Do not implement email OTP.

**Goal:** Stop hourly forced re-logins; make ERP human sessions last up to 7 days idle / 30 days absolute with proactive refresh and refresh-token rotation, without exposing refresh tokens to JavaScript.

**Architecture:** Keep Keycloak as IdP and HttpOnly cookie sessions for web. Encode explicit realm/client session policy in realm JSON + an Admin-API apply script (because `--import-realm` skips existing realms). Align cookie maxAges with policy. Add backend single-flight refresh + observability. Add web proactive refresh using `accessTokenExpiresAt` from `/auth/me` and `/auth/refresh` (JS cannot read HttpOnly JWT). Preserve staff magic-link, consumer JWT, and machine auth unchanged.

**Tech Stack:** Keycloak 24+ realm JSON / Admin API, Express cookies, RTK Query web, Expo mobile (parity notes), Vitest.

**Global constraints:**

- No OTP, no custom password login, no Keycloak replacement
- Refresh tokens stay HttpOnly (web); never log tokens
- Do not weaken RBAC / tenant isolation
- Do not change consumer or staff magic-link unless required
- Do not assume preprod/prod live values
- Do not commit unless asked

---

## Target policy (ERP humans)

| Setting                | Target                                                                            |
| ---------------------- | --------------------------------------------------------------------------------- |
| Access Token Lifespan  | **20 minutes** (1200 s) — realm + `supplify-api` / `supplify-mobile` client attrs |
| SSO Session Idle       | **7 days** (604800 s)                                                             |
| SSO Session Max        | **30 days** (2592000 s)                                                           |
| Client Session Idle    | **7 days**                                                                        |
| Client Session Max     | **30 days**                                                                       |
| Remember Me            | **disabled**                                                                      |
| `revokeRefreshToken`   | **true**                                                                          |
| `refreshTokenMaxReuse` | **0** after single-flight lands                                                   |
| Access cookie maxAge   | **20 minutes**                                                                    |
| Refresh cookie maxAge  | **30 days**                                                                       |

### Admin stricter policy

Admins share `supplify-api`. **Do not** hack role-based Keycloak timeouts in Phase 1. Document separate admin client/flow as Phase 2 follow-up (idle 1d / max 7d).

### Out of policy

Consumer diner JWT, staff magic-link UUID sessions, Keycloak admin-cli, cron/jobs.

---

## File map

| File                                                        | Responsibility                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `deploy/keycloak/realm-export.json` (+ preprod/prod)        | Explicit session fields + client access.token.lifespan                                   |
| `deploy/keycloak/apply-session-policy.mjs`                  | Idempotent Admin API apply for existing realms                                           |
| `deploy/keycloak/session-policy.json`                       | Shared numeric policy constants                                                          |
| `apps/api/src/lib/rbac.js`                                  | Cookie maxAges; single-flight refresh; transient vs invalid errors                       |
| `apps/api/src/lib/auth.js`                                  | Refresh helper; classify Keycloak errors                                                 |
| `apps/api/src/lib/auth-session-events.js`                   | Sanitized auth session events/metrics hooks                                              |
| `apps/api/src/routes/auth.routes.js`                        | Return `accessTokenExpiresAt` / `expires_in`; refresh observability                      |
| `apps/api/src/config/env.js`                                | Cookie TTL env overrides (optional)                                                      |
| `apps/web/src/lib/authSessionRefresh.ts`                    | Proactive scheduler, visibility/online, single-flight                                    |
| `apps/web/src/services/api/base.ts`                         | 401 fallback single-flight; offline-safe (no cookie wipe / no login redirect on network) |
| `apps/web/src/components/AuthGuard.tsx`                     | Start/stop refresh scheduler from `/auth/me`                                             |
| Docs under `docs/features`, `docs/runbooks`, `docs/reports` | Ops + report                                                                             |

---

## Task 1: Keycloak policy as code

- [ ] Add `deploy/keycloak/session-policy.json` with target integers
- [ ] Update `realm-export.json`, `.preprod.json`, `.prod.json` realm fields + client `access.token.lifespan: "1200"` on api (and mobile where present)
- [ ] Add `apply-session-policy.mjs` (env: KEYCLOAK_BASE_URL, admin user/pass, realm) applying realm + client attributes
- [ ] Document in README how to run per environment
- [ ] Apply to **development** live realm via script (verify Admin GET afterward)

## Task 2: Backend refresh hardening

- [ ] Classify Keycloak refresh failures: `invalid_grant` / session → clear cookies; network/5xx → **do not** clear cookies
- [ ] Process-level single-flight keyed by refresh-token hash
- [ ] Align `setAuthCookies` maxAges (20m / 30d); env overrides optional
- [ ] `/auth/me`, `/auth/refresh`, `/auth/session` return `accessTokenExpiresAt` (from JWT `exp`)
- [ ] Emit sanitized events (refresh succeeded/failed, single-flight joined, session expired, logout)
- [ ] Tests for cookies, single-flight, transient vs invalid

## Task 3: Web proactive refresh

- [ ] `authSessionRefresh.ts`: schedule at `exp - (3–5 min + jitter)`; visibility + online handlers; stop on logout
- [ ] Single-flight `POST /auth/refresh` with credentials
- [ ] Wire from AuthGuard when `getMe` succeeds
- [ ] baseQuery: on 401, attempt one single-flight refresh then retry; network errors do not redirect to login
- [ ] Tests for scheduler, single-flight, offline deferral

## Task 4: Logout / revocation verification

- [ ] Confirm logout still revokes + clears cookies + stops scheduler
- [ ] Document password-reset session invalidation gap (Keycloak admin action) in runbook
- [ ] Do not treat access expiry as logout

## Task 5: Mobile / PWA notes

- [ ] Document mobile already has client single-flight; recommend aligning SecureStore refresh with 30d KC max; ensure proactive refresh uses 20m exp
- [ ] Optional small mobile tweak only if needed for parity (sibling repo) — prefer docs + checklist in this repo first
- [ ] PWA: cookies + proactive refresh sufficient; SW unchanged

## Task 6: Docs + rollout + report

- [ ] `docs/features/auth-session-management.md`
- [ ] `docs/runbooks/auth-session-troubleshooting.md`
- [ ] `docs/runbooks/keycloak-session-configuration.md`
- [ ] `docs/reports/auth-session-hardening-implementation-report.md`
- [ ] Rollout: apply script on preprod (verify live) → pilot → prod
- [ ] Run API + web auth-related tests; record results

## Rollout / rollback

**Rollout:** Dev apply script → automated tests → preprod verify live → internal → pilot tenants → prod verify live.

**Rollback:** Re-apply previous session-policy JSON snapshot; revert cookie maxAge code; disable proactive refresh via env `AUTH_PROACTIVE_REFRESH=false` if needed.

## Security notes

- Rotation + single-flight required together
- HttpOnly refresh only on web
- Metrics without token material
- Admin stricter policy deferred (shared client)
