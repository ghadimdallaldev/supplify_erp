# Supplify security audit — 2026-07-28

## Executive summary

Phase 1 controlled-pilot hardening was reviewed against the supplied security plan and the regenerated 640-route inventory. Confirmed tenant, RBAC, identity, session, and abuse-control changes are implemented in code. The honest verdict is **controlled pilot ready subject to the production migration and live Redis checks**; this is not a claim of full production security.

## Verified changes

- Restaurant dashboard catalog counts are scoped to followed, non-blocked suppliers for the active restaurant.
- Legacy `/api/admin/*` audit/dashboard surfaces now require admin or tenant permissions.
- Quote supplier reads require `ORDERS_VIEW`; responses require `ORDERS_MANAGE`.
- Restaurant connection and sponsorship reads require `SETTINGS_VIEW`; mutations require `SETTINGS_MANAGE`.
- Warehouse and driver `supplier_id` overrides require an impersonation match or explicit admin permission and produce an audit event.
- Email identity normalization and the fail-closed CI unique index migration are present.
- Authenticated lookup rejects deactivated `app_user` records.
- Active-tenant signing uses `ACTIVE_TENANT_SECRET`; hosted validation requires it to be strong and distinct from `IMPERSONATION_SECRET`.
- Impersonation and active-tenant cookies use `COOKIE_SAME_SITE`.
- Dedicated Redis-backed limiter definitions cover refresh, invitation acceptance, and public availability checks.

## Test evidence

Command:

```text
pnpm.cmd --filter api exec vitest run src/lib/identity-normalize.test.js src/lib/validate-config.test.js src/lib/impersonation.test.js src/lib/tenant-switch.test.js src/lib/impersonation-guards.test.js src/routes/admin.routes.test.js src/routes/quote-requests.routes.test.js src/routes/warehouses.routes.test.js src/routes/drivers.routes.test.js
```

Result: **11 test files passed, 71 tests passed**. The dedicated RBAC suite also passed: **15 test files, 168 tests**. The full API suite also passed: **274 test files, 1,518 tests**.

## Remaining and deferred work

- Run `0193_identity_hardening.sql` against the target database; deployment must stop if duplicate groups are reported.
- Run live Redis-backed 429 verification for the dedicated limiters, and add an integration test covering tenant override denial plus a real deactivated-user authentication flow.
- Non-production JWT issuer mismatches remain warning-only by design; production remains strict.
- Full route authorization matrix, ZAP, malware scanning, RLS, and global username/phone schema remain Phase 2+.
- pnpm audit:prod was not run because it would transmit private dependency metadata to an external registry audit service; run it only with explicit approval.

Machine-readable details: [`2026-07-28-security-findings.json`](./2026-07-28-security-findings.json). Route seed: [`route-inventory.json`](./route-inventory.json).
