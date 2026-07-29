# Auth session management

**Audience:** Engineers  
**OTP:** Not in this feature — interactive login MFA comes later.

## Goals

ERP human users (admins, suppliers, restaurants, drivers, Keycloak staff) stay signed in through:

- Access-token expiry (proactive refresh)
- Browser / PWA close and reopen
- Phone lock, backgrounding, temporary offline
- Long delivery shifts

They must re-authenticate after logout, session expiry/revocation, password change/reset, account disablement, or client data wipe.

## Architecture

```text
Browser/PWA
  HttpOnly cookies: access_token + refresh_token
  Proactive scheduler → POST /auth/refresh (credentials)
  401 fallback → same single-flight refresh

API
  requireAuth: verify JWT; on expiry → Keycloak refresh (single-flight)
  Transient Keycloak errors → 503 AUTH_TEMPORARILY_UNAVAILABLE (cookies kept)
  Invalid/reuse → clear cookies + 401

Keycloak
  Access token: 20 minutes
  SSO / client idle: 7 days
  SSO / client max: 30 days
  Refresh rotation: on (max reuse 0)
```

## Cookie TTLs

| Cookie          | maxAge                                     | Notes                                               |
| --------------- | ------------------------------------------ | --------------------------------------------------- |
| `access_token`  | 20 min (`AUTH_ACCESS_COOKIE_MAX_AGE_MS`)   | Aligns with access JWT                              |
| `refresh_token` | 30 days (`AUTH_REFRESH_COOKIE_MAX_AGE_MS`) | Aligns with SSO max; Keycloak remains authoritative |

Flags: `httpOnly`, `secure`/`sameSite`/`domain` from `COOKIE_*`.

## Out of scope (unchanged)

| Flow             | Behavior                                       |
| ---------------- | ---------------------------------------------- |
| Consumer diner   | 30-day API JWT `consumer_auth_token`           |
| Staff magic-link | 12-hour UUID `staff_portal_session`            |
| Impersonation    | Short-lived admin view-as JWT (default 60 min) |
| Machine / cron   | No user refresh tokens                         |

## Admin stricter policy

Admins share `supplify-api`. A separate admin client (idle 1d / max 7d) is a **follow-up** — do not hack role-based timeouts on the shared client.

## Feature flags / env

| Env                              | Default    | Purpose                                            |
| -------------------------------- | ---------- | -------------------------------------------------- |
| `AUTH_PROACTIVE_REFRESH`         | true       | Server advertises proactive refresh via `/auth/me` |
| `AUTH_ACCESS_COOKIE_MAX_AGE_MS`  | 1200000    | Access cookie                                      |
| `AUTH_REFRESH_COOKIE_MAX_AGE_MS` | 2592000000 | Refresh cookie                                     |

## Mobile

`supplify-mobile` stores tokens in SecureStore and already single-flights refresh. Access tokens now match 20 minutes after Keycloak apply. Align any mobile proactive timers with JWT `exp`.

## Related

- Audit: `docs/audits/auth-session-architecture-current-state.md`
- Plan: `docs/plans/auth-session-hardening-plan.md`
- Keycloak runbook: `docs/runbooks/keycloak-session-configuration.md`
- Troubleshooting: `docs/runbooks/auth-session-troubleshooting.md`
