# Approvals & budgets — removed

**Status:** Removed from the product (2026-05). Not part of the MVP.

- UI route `/app/approvals` removed
- API `/api/approvals` unmounted from `server.js`
- Plan key `approvals_budgets` stripped from subscription plans (migration `0114`)
- Order approval gate in `approvals.service.js` is a no-op

Restaurants place orders without internal approval workflows or budget caps. Do not re-enable without an explicit product decision.
