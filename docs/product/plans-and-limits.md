# Plans, Limits, And Monetization

Supplify's current public commercial model is the four-plan model described in [four-plan-pricing-model.md](./four-plan-pricing-model.md). That document is the canonical source for plan names, prices, primary scale metrics, add-ons, trial behavior, AI allowance, and billing limitations.

## Public Plans

| Tenant type | Public plan       | Internal code | Monthly | Annual | Primary scale metric                         |
| ----------- | ----------------- | ------------- | ------: | -----: | -------------------------------------------- |
| Restaurant  | Restaurant Growth | `silver`      |     $49 |   $490 | 1 active branch                              |
| Restaurant  | Restaurant Scale  | `gold`        |    $149 | $1,490 | 3 active branches                            |
| Supplier    | Supplier Growth   | `gold`        |    $149 | $1,490 | 50 active ordering customer locations/month  |
| Supplier    | Supplier Scale    | `platinum`    |    $349 | $3,490 | 200 active ordering customer locations/month |

Internal codes are preserved for compatibility. Public UI and product copy should use tenant-specific names, not legacy tier labels.

## Trial

The public trial is a 30-day free trial of a selected paid plan. The internal `free` plan row remains for compatibility with `free_sandbox_expires_at`, trial locks, and admin extension tooling. The trial target is stored on the subscription when available.

## Commercial Rules

Restaurants scale by active branches. Paid restaurant plans should not commercially cap normal orders, connected suppliers, order lines, inventory SKUs, invoices, or ordinary deal redemptions.

Suppliers scale by active ordering customer locations per billing period. The canonical usage key is `active_customer_locations_monthly`; products/SKUs are fair-use technical controls rather than the main commercial metric.

## Billing And Add-ons

Recurring totals are calculated as base plan price plus active recurring add-ons. The current repository supports manual/stub billing flows; live automated recurring provider subscriptions remain external production work.

Admin-provisioned add-ons are documented in [four-plan-pricing-model.md](./four-plan-pricing-model.md#add-ons).

## Related Docs

- [four-plan-pricing-model.md](./four-plan-pricing-model.md) - canonical pricing, limits, trial, add-ons, AI, and billing status.
- [monetization-ux.md](./monetization-ux.md) - soft walls, account locks, upgrade modal behavior.
- [enterprise.md](./enterprise.md) - hidden custom/enterprise handling.
- [free-trial-expiry.md](../features/free-trial-expiry.md) - trial expiry lock behavior.
- [tenant-registration.md](../features/tenant-registration.md) - signup and activation flow.

## Superseded Docs

[tier-matrix.md](./tier-matrix.md) and [subscriptions.md](./subscriptions.md) describe the previous four-tier catalog and are retained for historical implementation context only. Do not use them as current pricing guidance.
