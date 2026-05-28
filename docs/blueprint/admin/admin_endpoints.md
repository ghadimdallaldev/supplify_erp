# Admin endpoints

Base path: `/api/admin-dashboard`. All require auth + role ADMIN + ADMIN_ACCESS.

| Method | Path                                                | Description                                                                                                     |
| ------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GET    | /overview                                           | Tenant counts, subscription stats, MRR/ARR, activity, alerts                                                    |
| GET    | /plans                                              | List plans (optional ?tenant_type=)                                                                             |
| POST   | /plans                                              | Create plan                                                                                                     |
| PATCH  | /plans/:id                                          | Update plan                                                                                                     |
| GET    | /subscriptions                                      | List subscriptions (?status, ?tenantType)                                                                       |
| PATCH  | /subscriptions/:id                                  | Update plan/status (force, reason, applyAtPeriodEnd)                                                            |
| POST   | /subscriptions/:id/preview-change                   | Preview plan change (willExceed, featureDiff)                                                                   |
| POST   | /subscriptions/:id/unlock                           | Clear lock; for Free Trial expired also extends `free_sandbox_expires_at` (body: `freeTrialDays` 3–7, `reason`) |
| POST   | /subscriptions/:id/extend-free-trial                | Extend Free Trial expiry + unlock (body: `days` optional 3–7)                                                   |
| GET    | /platform-settings                                  | Platform settings (`freeSandboxDays`, default 7)                                                                |
| PATCH  | /platform-settings                                  | Update `freeSandboxDays` (3–7 only)                                                                             |
| GET    | /usage/:tenantId                                    | Usage meters (?tenantType, ?period)                                                                             |
| GET    | /health                                             | System health (recent errors, dbPool)                                                                           |
| GET    | /financial-overview                                 | GMV, outstanding, overdue, revenue by plan, top tenants                                                         |
| GET    | /audit-logs                                         | Audit logs (?tenantId, ?actionType, limit, offset)                                                              |
| POST   | /impersonate                                        | Start impersonation (body: tenantId, tenantType)                                                                |
| POST   | /impersonate/stop                                   | Stop impersonation                                                                                              |
| GET    | /impersonate                                        | Current impersonation status                                                                                    |
| GET    | /tenants/suppliers                                  | List suppliers                                                                                                  |
| GET    | /tenants/restaurants                                | List restaurants                                                                                                |
| POST   | /tenants/:tenantType/:id/override-limit             | Create/update limit override                                                                                    |
| DELETE | /tenants/:tenantType/:id/override-limit/:overrideId | Remove override                                                                                                 |
| GET    | /tenants/:tenantType/:id/entitlements               | Tenant entitlements                                                                                             |
| GET    | /tenants/suppliers/:id/usage                        | Supplier usage                                                                                                  |
| GET    | /tenants/restaurants/:id/usage                      | Restaurant usage                                                                                                |
