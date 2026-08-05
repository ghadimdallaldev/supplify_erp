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

- Public routes (e.g. `/api/public/...`) are intentionally unauthenticated (reservations, staff portal, etc.); CSRF is skipped only for those prefixes.

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

- **Current**: CSRF middleware **skips all `/api/*`** routes (“handled by session cookies”).
- **Reality**: Protection relies on **CORS** (single origin) + **SameSite cookies**; no double-submit or custom header for API.
- **Risk**: If `WEB_ORIGIN` is too broad or CORS is misconfigured, cross-site requests could send cookies.
- **Recommendation**: For strict compliance (e.g. OWASP), consider requiring a CSRF token or custom header for state-changing API requests, or document that CORS + SameSite is the chosen mitigation.

### 3. Secrets and config

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
