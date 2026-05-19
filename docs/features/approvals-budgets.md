# Approvals & Budgets

Plan feature key: `approvals_budgets` (Gold+ on restaurant plans).

## Overview

Restaurants can define **budget periods** with per-category allocations and **approval rules** that gate purchase orders above a dollar threshold. When a placed order exceeds a rule’s threshold, it enters `PENDING_APPROVAL` until an assigned approver approves or rejects it.

## How approval rules work

1. Create rules under **Settings → Approvals** (or `POST /api/approvals/rules`).
2. Each rule has:
   - `thresholdAmount` — approval required when order total **exceeds** this amount
   - `approverUserId` **or** `requiresRole` (e.g. `RESTAURANT_MANAGER`) — who must approve
3. On `POST /api/orders` with status `PLACED`, the highest matching active rule is applied.
4. The order status becomes `PENDING_APPROVAL`; the supplier is **not** notified until approval.
5. Approvers see pending items on **/app/approvals** → Pending Approvals tab.

**Self-approval:** If the requester would be the same as the resolved approver, the rule is skipped (order proceeds as `PLACED`).

## Budget periods

- Create monthly/quarterly/annual/custom periods with optional branch scope.
- Allocate amounts by category name (matched to product category on order lines).
- **Budget Overview** shows spent vs allocated; alerts when remaining &lt; 20%.

## API reference

All routes require auth, restaurant role, and `approvals_budgets` feature.

| Method | Path                                     | Permission    | Description                        |
| ------ | ---------------------------------------- | ------------- | ---------------------------------- |
| GET    | `/api/approvals/budgets`                 | ORDERS_VIEW   | List budget periods                |
| POST   | `/api/approvals/budgets`                 | ORDERS_MANAGE | Create period + allocations        |
| PATCH  | `/api/approvals/budgets/:id`             | ORDERS_MANAGE | Update period                      |
| DELETE | `/api/approvals/budgets/:id`             | ORDERS_MANAGE | Soft-delete (`is_active=false`)    |
| GET    | `/api/approvals/budgets/:id/usage`       | ORDERS_VIEW   | Spent vs allocated by category     |
| GET    | `/api/approvals/rules`                   | ORDERS_VIEW   | List approval rules                |
| POST   | `/api/approvals/rules`                   | ORDERS_MANAGE | Create rule                        |
| PATCH  | `/api/approvals/rules/:id`               | ORDERS_MANAGE | Update rule                        |
| DELETE | `/api/approvals/rules/:id`               | ORDERS_MANAGE | Deactivate rule                    |
| GET    | `/api/approvals/pending`                 | ORDERS_VIEW   | Pending approvals for current user |
| POST   | `/api/approvals/orders/:orderId/request` | ORDERS_CREATE | Manual approval request            |
| POST   | `/api/approvals/requests/:id/approve`    | ORDERS_MANAGE | Approve (assigned approver only)   |
| POST   | `/api/approvals/requests/:id/reject`     | ORDERS_MANAGE | Reject (notes required)            |
| GET    | `/api/orders/:id/approval-status`        | ORDERS_VIEW   | Latest approval state for order    |

## UI

- **/app/approvals** — Pending Approvals + Budget Overview (sidebar when feature enabled)
- **Settings → Approvals** — Rules and budget period management (`?tab=approvals`)
- **Order detail** — Banner for Awaiting Approval / Approved / Rejected

## Database

Migration: `0069_approvals_budgets.sql` — tables `budget_periods`, `budget_allocations`, `approval_rules`, `order_approvals`; adds `PENDING_APPROVAL` to `order_status` enum.
