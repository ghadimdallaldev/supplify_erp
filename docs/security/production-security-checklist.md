# Production security checklist

## P0/P1 pilot controls

- [x] Tenant-scoped product dashboard count.
- [x] Legacy admin audit/dashboard permission gates.
- [x] Quote inbox and response permissions.
- [x] Restaurant connection/sponsorship permissions.
- [x] Admin tenant override binding and audit event.
- [x] Case-insensitive `app_user` email uniqueness migration.
- [x] Deactivated `app_user` authentication gate.
- [x] Separate active-tenant and impersonation signing secrets in hosted environments.

## Pilot controls

- [x] SameSite configuration is shared by auth, impersonation, and active-tenant cookies.
- [x] Dedicated refresh, invitation acceptance, and public availability rate limits.
- [x] Impersonation mutation block and stop/logout allowlist tests.
- [x] No raw SQL or raw identity data in conflict responses and migration duplicate reports.
- [ ] Run migration against the target production database and resolve any duplicate count before deploy.
- [ ] Confirm Redis health and limiter behavior across all production replicas.

## Deferred defense in depth

- [ ] Full 554-route authorization matrix review.
- [ ] OWASP ZAP against a controlled live environment.
- [ ] Malware scanning for uploads.
- [ ] PostgreSQL RLS.
- [ ] Global username/phone schema and exhaustive abuse matrix.
