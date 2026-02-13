# Admin scope

Admin users (role ADMIN) have access to:

- **Overview:** Tenant counts, subscription stats, MRR/ARR, activity (orders/chats 24h), alerts (e.g. past due).
- **Plans:** List/create/update subscription plans (per tenant_type RESTAURANT/SUPPLIER).
- **Subscriptions:** List all subscriptions; PATCH plan, status (including suspend/resume); preview-change; force downgrade with reason; applyAtPeriodEnd.
- **Tenants:** List suppliers and restaurants with subscription/usage summary.
- **Override limits:** POST (upsert) and DELETE tenant limit overrides (with optional expiry).
- **Health:** GET /health — recent API errors (system_event), DB pool stats; placeholders for job/webhook/email failures.
- **Finance:** GET /financial-overview — GMV, outstanding, overdue, revenue by plan (MRR/ARR), top tenants by revenue/overdue.
- **Audit logs:** GET /audit-logs (admin_audit_log).
- **Impersonation:** Start/stop viewing as a Restaurant or Supplier (cannot impersonate ADMIN); short-lived token; cleared on logout.

All admin-dashboard routes require: requireAuth, requireRole(['ADMIN']), resolveAdminContext, requirePermission('ADMIN_ACCESS').
