# Four-plan pricing model

Supplify's public commercial model is now:

| Tenant type | Public plan       | Internal code | Monthly | Annual | Primary scale metric                         |
| ----------- | ----------------- | ------------- | ------: | -----: | -------------------------------------------- |
| Restaurant  | Restaurant Growth | `silver`      |     $49 |   $490 | 1 active branch                              |
| Restaurant  | Restaurant Scale  | `gold`        |    $149 | $1,490 | 3 active branches                            |
| Supplier    | Supplier Growth   | `gold`        |    $149 | $1,490 | 50 active ordering customer locations/month  |
| Supplier    | Supplier Scale    | `platinum`    |    $349 | $3,490 | 200 active ordering customer locations/month |

The internal codes are deliberately preserved for compatibility with existing subscriptions, feature gates, tier comparisons, audit logs, and billing history. Hidden rows remain in the catalog for legacy/custom handling, but self-serve APIs hide inactive rows and hide the internal `free` row except for tenants currently using a trial.

## Trial

The public experience is a 30-day free trial, not a permanent no-cost plan. The implementation keeps the existing internal `free` row and `subscription.free_sandbox_expires_at` lock behavior. New/internal trial subscriptions record a `trial_target_plan_id`; by default restaurants target Restaurant Growth and suppliers target Supplier Growth.

## Supplier active customer locations

`active_customer_locations_monthly` counts distinct `COALESCE(customer_order.branch_id, customer_order.restaurant_id)` for a supplier during the subscription billing period. If the subscription period is unavailable, the fallback is the current UTC calendar month.

Qualifying order statuses are accepted/operational statuses: `ACKNOWLEDGED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `RECEIVED_PARTIAL`, `RECEIVED_FULL`, `RECEIVED_WITH_DISPUTE`, `INVOICED`, and `COMPLETED`. Drafts, placed-but-not-accepted orders, cancellations, and rejected/test-like activity are excluded.

The metric is exposed in entitlements and subscription usage. It does not silently reject restaurant orders. When the supplier is already at the effective cap for the current billing period, supplier-initiated customer activation flows block new connection requests, referral invitations, and sponsorships with a limit response so the supplier can upgrade, add capacity, or ask admin for review.

## Add-ons

Admin-provisioned recurring add-ons are included in checkout, renewal, invoice metadata, billing status totals, and effective limits.

| Plan             | Add-on                                  | Internal key                            | Monthly |
| ---------------- | --------------------------------------- | --------------------------------------- | ------: |
| Restaurant Scale | Additional branch                       | `restaurant_extra_branch`               |     $39 |
| Supplier Scale   | Additional 50 active customer locations | `supplier_active_customer_locations_50` |     $75 |
| Supplier Scale   | Additional supplier branch              | `supplier_extra_branch`                 |     $49 |
| Supplier Scale   | Additional warehouse                    | `supplier_extra_warehouse`              |     $19 |

Annual add-ons use the same two-months-free convention as the base plan: `monthly * 10`.

## Plan Source Of Truth

The database `subscription_plan` catalog is authoritative for monthly price, annual price, feature JSON, limit JSON, display order, active status, and tenant type. Frontend code may format labels and loading states, but it must not treat hardcoded prices or legacy public names as authoritative.

Self-serve plan APIs return only plans for the current tenant type. Restaurants must not see supplier plans, and suppliers must not see restaurant plans. Enterprise/custom rows remain hidden from public self-serve selection.

## Feature And Limit Matrix Summary

Restaurant Growth includes core purchasing, receiving, inventory, finance, supplier deals, basic reports, recipe costing, waste tracking, and AI reorder assistance for one active branch. Restaurant Scale adds multi-location controls, advanced reporting/roles/audit capabilities, integrations where implemented, and higher AI/storage/user limits.

Supplier Growth includes catalog, customer pricing, incoming order management, fulfillment, basic delivery, finance, disputes, promotions, customer growth, reports, supplier reorder intelligence, and 50 active customer locations/month. Supplier Scale adds multi-location/warehouse fulfillment, route/driver depth, advanced customer intelligence, advanced reports/roles/audit capabilities, integrations where implemented, and 200 active customer locations/month.

Unlimited commercial meters use the existing `-1` convention. Technical safeguards such as import batch limits, upload size limits, API rate limits, pagination, and payload limits remain in force and should not be marketed as normal-use commercial quotas.

## Upgrade And Downgrade Behavior

Successful checkout or admin activation should immediately invalidate subscription, billing, session, and entitlement caches so the tenant receives the new plan limits and features. Add-ons are retained only when compatible with the target plan.

Downgrades must be non-destructive: existing branches, users, warehouses, and active customer locations are not deleted. New creation is blocked or routed to admin review when usage already exceeds the target plan. Forced admin changes require explicit preview/audit behavior.

## Admin Operations

Admin plan management should treat restaurant and supplier catalogs separately, validate prices and JSON limits/features, block unsafe plan deletion/code edits for active subscriptions, expose trial target plan and trial extension state, and show recurring totals including active add-ons. Add-on provisioning is admin-only for this release.

## Migration And Compatibility

The migration strategy preserves existing internal codes instead of renaming every subscription row. Public mappings are tenant-aware:

| Legacy/internal code | Restaurant public handling                                  | Supplier public handling                                               |
| -------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `free`               | 30-day trial targeting Restaurant Growth by default         | 30-day trial targeting Supplier Growth by default                      |
| `silver`             | Restaurant Growth                                           | Supplier Growth compatibility / manual review                          |
| `gold`               | Restaurant Scale                                            | Supplier Growth by default unless usage requires Supplier Scale review |
| `platinum`           | Restaurant Custom or Scale with preserved overrides/add-ons | Supplier Scale                                                         |
| `enterprise`         | Hidden custom/admin handling                                | Hidden custom/admin handling                                           |

Migration preview data must show tenant ID, tenant type, current plan, proposed public plan, current usage, target limits, required overrides, preserved active add-ons, preserved active tenant overrides, and conflicts requiring manual review. Active Supplier Silver subscriptions are remapped to Supplier Growth and active Restaurant Platinum subscriptions are remapped to Restaurant Scale with `subscription_change_log` history while preserving subscription IDs and billing dates. Do not log tenant-confidential business details in migration previews.

## Launch Recommendation

The repository-level implementation is suitable for demonstration and supervised pilot validation once the focused test set passes and the migration preview has been reviewed. It can support live manual billing because internal checkout, renewal, invoice, and billing-status totals include add-ons. It is not ready for live automated recurring billing until a real payment provider subscription/webhook integration replaces the current manual/stub gateway behavior.

## Billing status

Internal checkout and renewal totals are complete for manual/stub billing:

`base plan price + active recurring add-ons = recurring subscription total`

Live automated payment-provider readiness is still limited by the existing gateway layer. The repository currently implements stub/manual providers; real recurring PSP subscriptions and webhooks remain external production work.

## User and driver limits

The canonical `users` limit counts active, login-enabled tenant members: distinct `app_user` records attached through tenant roles or active workspace membership for the tenant's billing workspace. It does not count platform administrators, unrelated driver records, or legacy non-login restaurant contact rows. Pending, non-expired invitations are included when creating a new invite so teams cannot queue seats beyond the plan limit. Invitation acceptance and explicit tenant-role assignment re-check the limit before creating a login-enabled seat.

Supplier `drivers` are a separate plan limit and count active rows in `drivers` for the supplier. Creating a driver is blocked when the effective driver limit has been reached.

## AI allowances

Paid plan LLM calls use the daily `ai_requests_per_day` meter. Restaurant Growth receives 30/day, Restaurant Scale 150/day, Supplier Growth 50/day, and Supplier Scale 300/day.

Trial subscriptions use a separate total-pool meter, `ai_trial_requests_total`, instead of the normal daily allowance. Restaurant trials receive 50 genuine LLM calls total; supplier trials receive 100 total. Heuristic forecasts, deterministic calculations, cached responses, and failed provider calls that produce no usable AI output are not counted as successful AI usage. When allowance is exhausted, API responses must identify fallback output as heuristic/rule-based and include reset or trial-expiry metadata rather than labeling fallback output as AI.

## Trial target behavior

A trial subscription remains stored on the internal `free` plan for compatibility, but feature and limit resolution now uses `trial_target_plan_id` when it is present. If no target is recorded, restaurants default to Restaurant Growth and suppliers default to Supplier Growth. Self-serve trial targets must be active paid catalog rows for the tenant type; internal free, enterprise, and admin-assignment/custom rows are rejected. Trial expiry and write-lock behavior continue to use `free_sandbox_expires_at` and the existing account-lock middleware.

## Warnings and background writes

Location limit payloads include `remaining`, `percentUsed`, and `warningThresholdReached` metadata so UI and admin surfaces can warn before branch, warehouse, or active-customer-location caps are exceeded. Supplier customer-growth activation flows enforce the active-customer-location cap before creating additional connection requests, referral invitations, or sponsorships. Scheduled Quick List order execution skips restaurants with locked active/trial/past-due subscriptions, waitlist offer expiry can close stale offers but skips automatic next-guest promotion for locked restaurants, invoice overdue notifications require both restaurant and supplier tenants to be unlocked before the job claims the overdue notification write, email retry skips locked operational tenant-bound failed sends while allowing billing/payment/subscription lifecycle retries, and email digest sends only to admin users or users with an unlocked tenant membership, reorder forecast cache refresh skips locked restaurants before forecast writes, recipe recalculation queue processing skips locked restaurants and keeps dirty rows queued, automated collections reminders skip locked suppliers before reminder logs/notifications, inventory expiry reminders skip locked restaurants before dedup logs/notifications, reorder cadence reminders skip locked recipients before reminder logs/notifications, promotion expiry maintenance only activates scheduled supplier promotions for unlocked suppliers and skips expiry notification writes for locked suppliers, delivery rollover skips locked supplier subscriptions before rescheduling assignments or creating rollover routes/stops, stale GPS alerts skip locked suppliers before alert logs/notifications, fulfillment exception checks skip locked suppliers before exception writes, and queued supplier catalog/image imports fail before mutating product records when the supplier is locked. These guards prevent background operational writes from bypassing expired-trial or payment locks.
