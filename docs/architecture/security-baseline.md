# Security Assessment

## Summary

The app implements **solid baseline security** (auth, headers, rate limiting, cookies) but has **dependency vulnerabilities** and a few **hardening opportunities**. It is not yet fully aligned with current security standards until dependency updates and production settings are applied.

---

## What’s in good shape

### Authentication & session

- **OIDC with Keycloak**: Authorization code flow, state parameter for CSRF on login, tokens from Keycloak.
- **Tokens in cookies**: Access/refresh tokens stored in **httpOnly** cookies (not accessible to JS), **secure** in production, **sameSite** configurable via `COOKIE_SAME_SITE` (defaults to `'lax'`; must be `'none'` when web and API are on different domains, e.g. Railway cross-origin deployments).
- **Session**: Express session with **SESSION_SECRET**, **httpOnly** session cookie, **secure** in production.
- **JWT**: Verified with `jose` and remote JWKS (Keycloak), with timeout on Keycloak HTTP calls.

### API security

- **Helmet**: Content-Security-Policy, X-DNS-Prefetch-Control, etc.
- **CORS**: Restricted to `WEB_ORIGIN`, `credentials: true`, explicit methods and headers (including `X-CSRF-Token`).
- **Rate limiting**: Multiple limiters applied per route group — general API (1000/15min per IP), auth (`/auth`: 500/15min), public API (`/api/public`: 200/15min), chat send (`/api/chat` POST: 300/15min).
- **Authorization**: Routes use `requireAuth` and `requireRole`; tenant isolation (e.g. supplier/restaurant by email) on sensitive data.
- **SQL**: Queries use parameterized `query(text, params)` (pg); no string concatenation of user input into SQL.

### Frontend

- No `dangerouslySetInnerHTML` or raw `innerHTML` found; React’s default escaping helps against XSS.
- API calls use `credentials: 'include'` so cookies are sent to the same-origin (or allowed CORS) API.

### Public surface

- Public routes (e.g. `/api/public/...`) are intentionally unauthenticated (reservations, staff portal, etc.). Some use `optionalAuth` (for example `POST /api/public/invitations/accept`), so CSRF is skipped on `/api/public` and `/auth` only for requests that do not carry the session cookie (`access_token` / `refresh_token`). A request with the session cookie must send `X-Requested-With: Supplify` from an allowed origin, even under those prefixes (2026-11-10).

---

## Gaps and risks

### 1. Dependency vulnerabilities (high priority)

> **⚠️ Point-in-time snapshot** — this table was accurate at audit time but packages may have been upgraded since. Always run `pnpm audit` before a release and resolve new findings.

The audit at the time of writing reported 14 issues (5 high, 5 moderate, 4 low). Representative examples:

| Severity | Package                                  | Issue                                 | Action                                        |
| -------- | ---------------------------------------- | ------------------------------------- | --------------------------------------------- |
| High     | **axios** (api + web)                    | DoS via `__proto__` in mergeConfig    | Upgrade to >= 1.13.5                          |
| High     | **@remix-run/router** (react-router-dom) | XSS via open redirects                | Upgrade react-router-dom to >= 6.30.2         |
| High     | **glob** (via tailwind/sucrase)          | Command injection (dev/build)         | Upgrade tailwind / lockfile; or use overrides |
| High     | **qs** (express, supertest)              | DoS via arrayLimit                    | Upgrade express / use overrides for qs        |
| Moderate | **react-router**                         | External redirect via untrusted paths | Same as @remix-run/router upgrade             |
| Moderate | **esbuild** (vite)                       | Dev server request handling           | Upgrade Vite when possible                    |
| Moderate | **lodash / lodash-es / js-yaml**         | Prototype pollution                   | In dev/tooling; upgrade or overrides          |
| Low      | **aws-sdk** v2                           | Region validation                     | Prefer migrating to AWS SDK v3                |

Apply dependency upgrades and, where needed, `pnpm overrides` for transitive packages (see below). **Run `pnpm audit --prod` before every release** to catch new issues.

### 2. CSRF on API routes

- **Current** (`apps/api/src/middlewares/csrf.js`): state-changing requests that carry the session cookie must send the non-simple header `X-Requested-With: Supplify` and an `Origin`/`Referer` in `WEB_ORIGINS`; otherwise 403 `CSRF_FORBIDDEN`. Valid Bearer tokens (mobile) skip the check.
- **Exemptions**: safe methods; `/health`; `/webhooks/*` (signature-verified); e2e and HMAC upload endpoints; `POST /auth/mobile/refresh` (refresh token in the JSON body, never read from cookies); and `/auth/*` and `/api/public/*` requests **without** a session cookie (anonymous callers and Bearer clients). The OAuth flows (`/auth/login`, `/register`, `/callback`, `GET /logout`) are GET redirects and unaffected.
- **Cookie requests under `/auth` and `/api/public`** (`POST /auth/refresh`, `/auth/logout`, `/auth/legal-acceptance`, `PATCH /auth/me/locale`, `/auth/admin-preferences`, `POST /api/public/invitations/accept|reject|branch/accept`) are no longer exempt. Fixed 2026-11-10; relevant when `COOKIE_SAME_SITE=none`. The web client already sends the header on every call (RTK base query and `authSessionRefresh.ts`).
- **Consumer shop cookie** (`consumer_auth_token`) under `/api/public/consumer/*`: writes that carry the cookie must send `X-Requested-With: Supplify` (403 `CSRF_FORBIDDEN` otherwise). The Origin allowlist is intentionally **not** applied there because tenant custom shop domains (`tenant_custom_domain`) are not in `WEB_ORIGINS`; the header alone blocks cross-site forms and, with the CORS preflight, cross-origin fetch. The web client (`services/api/base.ts`) and both mobile clients already send the header on every non-GET. Anonymous consumer writes (login, register, guest checkout) are unchanged. Added 2026-11-10 (batch F).

### 3. Secrets and config

- **Hosted dev images** (`APP_ENV=dev` with `NODE_ENV=production`) are no longer fully exempt from `validateProductionConfig`: `RATE_LIMIT_ENABLED` must be true and `SESSION_SECRET` / `IMPERSONATION_SECRET` / `ACTIVE_TENANT_SECRET` / `CONSUMER_AUTH_SECRET` must not be empty or a built-in development default. `OAUTH_CALLBACK_BASE_URL` is required in preprod and prod. `consumer-auth.service.js` refuses the `dev-consumer-auth-secret` fallback when `NODE_ENV=production`. The `/api/e2e` secret comparison is constant-time. (Batch F, 2026-11-10.)
- **Dev auto-grants**: the seeded-email role grants (`admin@supplify.com`, `supplifyadmin@supplify.com`, `supplier@`, `restaurant@`) only apply when `APP_ENV=dev`, `NODE_ENV!=='production'` **and** the token has `email_verified=true`.
- **Default secrets** in `config/env.js` (e.g. `SESSION_SECRET`, `KEYCLOAK_CLIENT_SECRET`) must **never** be used in production.
- **Recommendation**: In production, require explicit env vars and fail startup if critical secrets are missing or still default.

### 4. Session store

- **Current**: In-memory session store (no Redis/persistent store in use).
- **Risk**: Sessions are lost on restart; in multi-instance deployments, sessions are not shared.
- **Recommendation**: For production, use a persistent store (e.g. `connect-pg-simple` or Redis) and configure it in `server.js`.

### 5. Rate limit levels

- Limits (e.g. 1000 and 500 per 15 minutes) are noted as “increased for testing.”
- **Recommendation**: For production, use lower limits (e.g. 200–400 general, 20–50 auth) and consider stricter auth limits to reduce brute-force and abuse.

### 6. Content-Security-Policy

- **scriptSrc**: `'self'` only (good).
- **styleSrc**: includes `'unsafe-inline'` for styles.
- **Recommendation**: When feasible, move to nonce- or hash-based CSP for styles to phase out `'unsafe-inline'`.

### 7. Account linking, OAuth redirect, SSRF, error bodies (batch F, 2026-11-10)

- **Account linking** (`lib/rbac.js`): an existing `app_user` is re-bound to a Keycloak `sub` by email only when the token has `email_verified === true`, and never when the row already holds a real (UUID) different `sub` (403 `ACCOUNT_LINK_CONFLICT`; unverified: 403 `EMAIL_NOT_VERIFIED`). Non-UUID seed placeholders (`admin-sub`) can still be adopted by a verified login. Bearer (mobile) requests now apply the same unverified-email gate as the web callback (`mustBlockUnverifiedEmail`, active when `AUTH_EMAIL_OTP_ENABLED=true`) and answer 403 `EMAIL_NOT_VERIFIED`.
- **OAuth redirect_uri** (`lib/oauth-callback-origin.js`): when `OAUTH_CALLBACK_BASE_URL` is unset, `X-Forwarded-Host` and `Host` are honoured only if they match `WEB_ORIGINS` or `PUBLIC_API_URL` (scheme taken from the allowlisted origin); otherwise the configured web origin is used. Local dev still trusts the request host.
- **SSRF guard** (`lib/ssrf-guard.js`): IPv6 literals are fully parsed. IPv4-mapped (dotted or WHATWG hex), IPv4-compatible `::/96`, NAT64 `64:ff9b::/96` (embedded v4 checked) and `64:ff9b:1::/48`, 6to4 `2002::/16` (embedded v4 checked), Teredo, ULA, link-local, site-local, multicast, discard and unparseable literals are rejected. `pinned-fetch.js` already applies the same check to every resolved DNS answer.
- **5xx bodies** (`middlewares/sanitizeServerErrors.js`, mounted in `server.js`): outside local dev, any 5xx JSON body with an `error` object loses `details`/`stack` and gets the generic message `Internal server error` (503 keeps its curated message). `name`, `ok`, `data` and `requestId` are kept; 4xx/2xx are never modified; the original text is logged with the requestId.
- **Guest checkout** (`public-sales.routes.js`): added a global 20/hour/IP limit across suppliers and a per-recipient cap (3/hour per email, 3/hour per phone for WhatsApp, Redis-backed with in-memory fallback) on outbound order notifications.
- **Other**: driver-to-user links require supplier tenant membership (and `linked_user_email` is only returned for members); receiving checks order ownership in the same query that loads order items, before line validation; `chatSendGuard` exempts only the exact read-receipt routes; dispute resolution with credit note/refund needs `INVOICES_MANAGE`.
- **Deferred**: raw card / PCI handling and Stripe webhook de-duplication (billing is mock-only).

---

## Alignment with common standards

- **OWASP Top 10**: Auth, injection (parameterized SQL), and secure cookies are addressed; dependency and CSRF strategy should be tightened as above.
- **HTTPS**: Enforced in production via `secure: true` on cookies; ensure the app is only served over TLS in production.
- **Least privilege**: Role-based access and tenant scoping are used; continue to audit new routes for `requireAuth`/`requireRole` and tenant checks.

---

## Recommended next steps

1. **Upgrade dependencies** (see below) and re-run `pnpm audit`.
2. **Production env**: Require non-default `SESSION_SECRET`, `KEYCLOAK_*`, and no default `KEYCLOAK_CLIENT_SECRET`; validate on startup.
3. **Session**: Configure a production session store (e.g. PostgreSQL or Redis).
4. **Rate limits**: Lower limits and optionally add stricter auth-specific limits.
5. **Optional**: Add CSRF token or custom header for sensitive API mutations and document CORS + SameSite as the main CSRF mitigation.
6. **CSP**: Plan migration off `'unsafe-inline'` for styles (e.g. nonces with Vite).

---

## Dependency upgrades (to address high/moderate)

Run from repo root:

```bash
# Direct dependency bumps (in each package)
pnpm --filter @supplify/api add axios@^1.13.5
pnpm --filter @supplify/web add axios@^1.13.5 react-router-dom@^6.30.2
```

For transitive issues (e.g. **qs**, **glob**), add to root `package.json`:

```json
"pnpm": {
  "overrides": {
    "qs": ">=6.14.2"
  }
}
```

Then run `pnpm install` and `pnpm audit` again. Fix remaining items (esbuild via Vite, tailwind/sucrase/glob) by upgrading those tools or applying further overrides as needed.
