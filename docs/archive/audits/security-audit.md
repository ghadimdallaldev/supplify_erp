# Security audit — pre-staging launch

**Date:** 2026-05-28  
**Scope:** Auth, RBAC, tenant isolation, admin/impersonation, billing, public routes, uploads, API validation, PWA, secrets, rate limits.  
**Method:** Static code review + targeted fixes + test suite.

---

## Executive summary

**No P0 vulnerabilities left unaddressed in code** for the items fixed in this pass. **Staging go** requires **production env hardening** (especially `S3_PUBLIC_READ=false`, strong secrets, **no `E2E_SECRET`**).

**Tests:** `pnpm test:api` — **684 passed** (includes `billingAccess`, RBAC, public routes)  
**Build:** `pnpm build` — **pass**

---

## P0 issues

| #   | Issue                                                                                                                                   | Status                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | **Public-read S3 bucket default** — private uploads (disputes, chat, staff docs) may be world-readable via URL if `S3_PUBLIC_READ=true` | **Config / ops** — startup now **warns** in prod; set `S3_PUBLIC_READ=false` in staging/prod |
| 2   | **Dispute attachments** — any `fileKey` accepted without ownership check                                                                | **Fixed** — `assertUploadKeyOwnedByUser` in `addDisputeAttachment`                           |
| 3   | **Chat attachments** — arbitrary `fileUrl` allowed                                                                                      | **Fixed** — `assertChatAttachmentUrl` on send                                                |
| 4   | **`E2E_SECRET` in production** — `/api/e2e/reset-seed` can wipe data                                                                    | **Fixed** — `validateProductionConfig()` **fails startup** if set                            |
| 5   | **Billing middleware fail-open** — billing DB errors allowed all traffic                                                                | **Fixed** — returns **503** `BILLING_CHECK_UNAVAILABLE` (except missing-table `42P01`)       |

### P0 requiring deployment approval (not code-only)

| Issue                     | Action                                                                 |
| ------------------------- | ---------------------------------------------------------------------- |
| Default MinIO credentials | Production startup **rejects** `S3_ACCESS_KEY`/`SECRET` = `minioadmin` |
| Public S3 objects         | Set `S3_PUBLIC_READ=false`; signed GET for private prefixes            |

---

## P1 issues (recommendations)

| Area                               | Finding                                               | Recommendation                                 |
| ---------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Auth / session                     | Cookies: `httpOnly`, `secure` (prod), `sameSite: lax` | OK — keep                                      |
| CSRF                               | Header + origin on `/api/*`; public routes exempt     | OK — document public exemptions                |
| CORS                               | Allows missing `Origin`                               | Accept for non-browser; restrict if needed     |
| Rate limits                        | In-memory only                                        | Redis store for multi-instance                 |
| Error messages                     | Some routes return `error.message` in prod            | Centralize sanitized 500 messages              |
| Public `GET /restaurants`          | Unauthenticated directory                             | Rate limit OK; consider field whitelist        |
| Reservation manage token           | Full row spread in response                           | Whitelist response fields; UUID validate token |
| Presigned PUT                      | No `content-length-range` on S3                       | Add condition on presign                       |
| Admin invoice list by email        | Odd for ADMIN role                                    | Document; not a cross-tenant leak              |
| Chat: ADMIN sees all conversations | Support feature                                       | Document in admin runbook                      |
| Impersonation + billing            | **No bypass** when impersonating                      | Verified in `billingAccess.js` + tests         |

---

## Safe fixes made (this pass)

| File                                | Fix                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `lib/validate-config.js`            | Reject `E2E_SECRET` in production; reject default S3 keys; warn on `S3_PUBLIC_READ` |
| `middlewares/billingAccess.js`      | Fail closed → 503 on billing check errors                                           |
| `middlewares/billingAccess.test.js` | Test for 503 behavior                                                               |
| `services/disputes.service.js`      | Upload key ownership on attach                                                      |
| `lib/sanitize-upload.js`            | `assertChatAttachmentUrl()`                                                         |
| `routes/chat.routes.js`             | Validate attachment URLs on send                                                    |

---

## Existing controls (verified)

| Control                                             | Location                     |
| --------------------------------------------------- | ---------------------------- |
| Production secret validation                        | `lib/validate-config.js`     |
| Helmet + HSTS (prod)                                | `server.js`                  |
| Tiered rate limiting                                | `server.js`                  |
| CSRF middleware                                     | `middlewares/csrf.js`        |
| Billing lock + impersonation                        | `billingAccess.js`, tests    |
| RBAC permission middleware                          | Most tenant routes           |
| Socket auth + conversation access                   | `socket-auth`, `chat-access` |
| PWA SW skips API/auth/socket                        | `apps/web/static/sw.js`      |
| `.env` gitignored                                   | `.gitignore`                 |
| Parameterized SQL in route handlers                 | Codebase-wide                |
| `assertUploadKeyOwnedByUser` on product file attach | `files.routes.js`            |
| Staff link anti-enumeration                         | `public.routes.js`           |
| E2E routes 404 without secret                       | `e2e.routes.js`              |

---

## RBAC & tenant isolation

| Check                                 | Result                                                         |
| ------------------------------------- | -------------------------------------------------------------- |
| Restaurant vs supplier API separation | Enforced via `getRequestTenant`, role checks, scoped queries   |
| Cross-tenant order/dispute access     | Blocked in route handlers                                      |
| Driver scope                          | Driver routes + assignments scoped                             |
| Impersonation billing                 | **Enforced** — admins impersonating tenants get billing lock   |
| Last owner / role escalation          | Covered by existing RBAC tests (`rbac-guards`, `tenant-roles`) |

---

## Public routes

| Route family              | Rate limit                      | Validation                |
| ------------------------- | ------------------------------- | ------------------------- |
| `/api/public/*`           | `publicLimiter` (60/15min prod) | Zod on reservation create |
| Staff magic link          | `staffLinkLimiter` (10/15min)   | UUID tokens               |
| Branch invitations public | CSRF exempt                     | Token-based               |

**Recommendation:** Dedicated limiter on `POST /api/public/reservations` if spam observed.

---

## File uploads

| Control                             | Status                                      |
| ----------------------------------- | ------------------------------------------- |
| MIME allowlist                      | `files.routes.js`                           |
| Size check (when client sends size) | Presign flow                                |
| Key prefix `uploads/{userId}/`      | Enforced on attach (product, dispute, chat) |
| Presign expiry                      | 300s                                        |

---

## PWA / service worker

```javascript
// apps/web/static/sw.js — sensitive paths are NOT cached
;(/api/, /auth/, /socket.io/)
```

Logout and session cookies are not stored in Cache API. **No launch blocker.**

---

## Secrets & frontend exposure

| Item              | Status                                                   |
| ----------------- | -------------------------------------------------------- |
| Secrets in git    | Examples only; `.env` ignored                            |
| `VITE_*` in web   | API URL, Keycloak public client, S3 endpoint/bucket — OK |
| VAPID private key | Server-only (`env.js`)                                   |

---

## SQL injection

No user-controlled string interpolation into SQL in `apps/api/src` route handlers. Dynamic `WHERE` clauses use `$n` parameters. Offline scripts under `apps/api/scripts/` are out of request path.

---

## Tests added / updated

- `billingAccess.test.js` — billing check failure → 503
- `supplier-pain-killer.test.js` — batch reorder mock shape

**Suites to run before deploy:**

```bash
pnpm test:api
pnpm test:rbac
pnpm test:billing
pnpm test:web
pnpm build
```

---

## Remaining security risks

1. **`S3_PUBLIC_READ=true`** in production — **must be false** for private assets.
2. **Multi-instance rate limits** — per-process memory store.
3. **Route-level error leakage** — inconsistent prod sanitization.
4. **Public restaurant directory** — intentional; confirm product acceptance.
5. **Presigned upload size** — client can bypass API size check via direct PUT.

---

## Staging go / no-go

| Criterion                | Status                             |
| ------------------------ | ---------------------------------- |
| P0 code fixes merged     | Yes                                |
| Production env checklist | **Required** (secrets, S3, no E2E) |
| Migrations applied       | Run `0128` + prior pending         |
| CI / tests green         | Yes                                |

**Recommendation: GO to staging** after ops applies production env checklist below.

### Pre-staging env checklist

- [ ] `NODE_ENV=production`
- [ ] Strong `SESSION_SECRET`, `IMPERSONATION_SECRET`, `KEYCLOAK_CLIENT_SECRET` (≥32 chars)
- [ ] `DATABASE_SSL=true`
- [ ] `WEB_ORIGINS` = HTTPS staging origins only
- [ ] `E2E_SECRET` **unset**
- [ ] `S3_PUBLIC_READ=false` (or dedicated public bucket for catalog only)
- [ ] `S3_ACCESS_KEY` / `S3_SECRET_KEY` not `minioadmin`
- [ ] Email provider configured (`SENDGRID_API_KEY` or `SMTP_HOST`)
