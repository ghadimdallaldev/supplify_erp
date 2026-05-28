# Approvals & budgets — removed

**Removed:** 2026-05 (product direction). See [APPROVALS_BUDGETING_REMOVAL_AUDIT.md](../../APPROVALS_BUDGETING_REMOVAL_AUDIT.md) for full audit.

## What was removed

- UI route `/app/approvals` and settings tab (pages deleted)
- API `/api/approvals` (route module deleted; was unmounted from `server.js`)
- `GET /api/orders/:id/approval-status`
- Plan key `approvals_budgets` (migration `0114`)
- Order approval gate on placement (no `PENDING_APPROVAL` for new orders)
- Migration `0118` releases legacy stuck `PENDING_APPROVAL` orders

## What remains (compatibility only)

- DB tables: `approval_rules`, `budget_periods`, `budget_allocations`, `order_approvals` (not dropped)
- Deal/promotion **admin** approval flows (unrelated feature)
- Promotion **boost budget** fields on deals (unrelated)
