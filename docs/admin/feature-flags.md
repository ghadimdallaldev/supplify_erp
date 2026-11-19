# Admin feature toggles

Supplify layers **subscription plan features** with **global** and **per-tenant** overrides so admins can turn capabilities on or off without editing plan JSON.

## Resolution order

For each feature key (e.g. `chat`, `smart_reorder`, `reports`):

1. **Tenant override** — row in `feature_flag_override` for that restaurant or supplier
2. **Global override** — `feature_flag.global_override` when not `NULL` (`true` = force on, `false` = force off)
3. **Plan** — `subscription_plan.features` JSON on the tenant’s active subscription
4. **Default** — disabled for plan-sold keys; **enabled** for default-on keys (see below)

Forcing a flag **on** keeps the plan’s tier string when that plan value is already enabled (`intelligence: "scale"`, `notifications: "email_whatsapp_webhook"`, `smart_reorder: "ai_forecast_seasonality"`). It becomes boolean `true` only when the plan had the feature off. Forcing **off** disables the feature. An explicit off on `fulfillment` or `driver_management` is not turned back on by the `fulfillment_tools` alias, including the `requireFeature` middleware.

Runtime checks use `requireFeature('feature_key')` on API routes, which calls `isFeatureEnabled()` in `subscription.js` (delegates to `feature-flags.js`).

## Database

Migration `0055_admin_feature_toggles.sql`:

| Table                   | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `feature_flag`          | Master list of feature keys + optional `global_override` |
| `feature_flag_override` | Per-tenant `is_enabled` + optional `reason`              |

Canonical keys live in `apps/api/src/lib/feature-keys.js`.

### Platform-only keys

| Key                  | Default | Notes                                                                                                                        |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `mobile_public_shop` | Off     | Gates Expo guest browse + CONSUMER public shop. Not on tenant plans. Clients poll `GET /api/public/features`. Inherit = off. |

### Default-on kill switches (every feature is toggleable)

Every feature area (each mounted API module and its major sub-features) now has an admin flag. Features that are not sold per plan tier use **default-on** keys: they resolve to **on** unless an admin forces them off globally or for one account (or a plan explicitly sets them `false`). They are **not** required in `subscription_plan.features`, so the tier verifier and plan JSON are unchanged. Lists: `RESTAURANT_DEFAULT_ON_FEATURE_KEYS` / `SUPPLIER_DEFAULT_ON_FEATURE_KEYS` in `feature-keys.js`; `getAllowedFeatureKeys()` returns plan-sold + default-on keys, `getPlanFeatureKeys()` returns plan-sold only.

| Key                        | Tenant     | What it switches off                                                                                     |
| -------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `ordering`                 | both       | Placing orders (`POST /api/orders`, `POST /api/orders/manual`); history stays readable                   |
| `product_catalog`          | both       | `/api/products`, `/api/prices`                                                                           |
| `global_search`            | both       | `/api/search`                                                                                            |
| `quote_requests`           | both       | `/api/quote-requests` (RFQ + supplier inbox)                                                             |
| `contract_pricing`         | both       | `/api/restaurant-pricing`                                                                                |
| `loyalty`                  | both       | `/api/loyalty`                                                                                           |
| `reservations`             | restaurant | `/api/reservations` + public booking/waitlist creation (manage links keep working)                       |
| `staff_management`         | restaurant | `/api/staff` + public staff portal (`/api/public/staff/*`)                                               |
| `consumer_storefront`      | restaurant | `/api/consumer/*` admin + every `/api/public/consumer/:restaurantSlug/*` route (404 when off)            |
| `consumer_reviews`         | restaurant | Public consumer reviews for that restaurant                                                              |
| `supplier_connections`     | restaurant | `/api/restaurant/growth` connection requests                                                             |
| `team_invitations`         | both       | `/api/org/invitations`, `/api/restaurants/invitations/members`                                           |
| `public_sales`             | supplier   | Public-sales settings + guest checkout `/api/public/suppliers/:idOrSlug/orders*`                         |
| `branch_management`        | both       | `/api/org`, `/api/restaurant-org`, `/api/branches` (creation additionally needs plan `multi_branch`)     |
| `supplier_directory`       | restaurant | `GET /api/suppliers` (signed-in restaurants), supplier statistics                                        |
| `supplier_following`       | restaurant | Follow / block suppliers                                                                                 |
| `price_comparison`         | restaurant | `GET /api/suppliers/price-comparison`                                                                    |
| `supplier_reviews_read`    | restaurant | Browsing supplier reviews (`/api/reviews`); writing still needs plan `supplier_reviews`                  |
| `delivery_locations`       | restaurant | `/api/restaurants/me/delivery-location(s)`, branch delivery locations                                    |
| `delivery_tracking`        | both       | `/api/orders/:id/tracking`, `/api/orders/:id/proof-of-delivery*`                                         |
| `packing_slips`            | both       | `/api/orders/:id/packing-slip*`                                                                          |
| `order_reminders`          | restaurant | `POST /api/orders/:id/remind`                                                                            |
| `notification_center`      | both       | `/api/notifications` inbox + preferences                                                                 |
| `ops_dashboard`            | supplier   | `/api/supplier/command-center`, `/api/supplier/run-sheet`                                                |
| `catalog_import`           | supplier   | `/api/supplier/products/import*`, `/api/supplier/products/images/import*`                                |
| `product_substitutes`      | supplier   | `/api/supplier/products/:id/substitutes*`, `/api/supplier/orders/:id/substitutions`                      |
| `fulfillment_issues`       | supplier   | `/api/supplier/orders/:id/fulfillment-issues*`                                                           |
| `stock_levels`             | supplier   | `/api/inventory` (mutations additionally need plan `inventory_management`)                               |
| `order_warehouse_dispatch` | supplier   | `/api/orders/:id/warehouses*` (transfer / dispatch)                                                      |
| `featured_placement`       | supplier   | `/api/suppliers/featured-placement/*` (supplier side)                                                    |
| `customer_directory`       | supplier   | `GET /api/restaurants`                                                                                   |
| `order_management`         | both       | All of `/api/orders` (list, detail, status updates, amendments); placement additionally needs `ordering` |
| `public_profile`           | both       | Public restaurant/supplier profile + catalog pages on `/api/public`, custom-domain `resolve-host`        |
| `self_serve_billing`       | both       | Billing mutations (checkout, payment methods, pay-now, auto-renew); billing reads stay available         |
| `restaurant_profile`       | restaurant | `/api/restaurant-onboarding` (profile & team setup)                                                      |

Platform default-on keys (global only — no tenant exists for these requests; on at inherit, off only when forced off):

| Key                      | What it switches off                                                           |
| ------------------------ | ------------------------------------------------------------------------------ |
| `demo_campaign`          | Public `/api/public/demo` lead capture                                         |
| `public_registration`    | `POST /api/register/complete` (new workspaces / consumer sign-up completion)   |
| `consumer_accounts`      | `/api/consumer` consumer profile, addresses, order history                     |
| `invitation_acceptance`  | `/api/public/invitations` (accept / reject team & branch invites)              |
| `referral_landing`       | `/api/growth/referral/:token`                                                  |
| `whatsapp_ordering`      | `/webhooks/whatsapp` inbound messages                                          |
| `web_push`               | `GET /api/push/vapid-public-key`, `DELETE /api/push/devices`                   |
| `organization_lifecycle` | `POST /api/account/transfer-ownership`, `POST /api/account/close-organization` |

Gate helpers live in `apps/api/src/lib/tenant-feature-gate.js`:

- `tenantFeatureGate(key)` for authenticated routes, mounted after `resolveTenantContext`. Platform ADMIN bypasses unless impersonating (then the tenant's flags apply); keys that do not apply to the caller's tenant type pass. Default-on keys deny with 403 `FEATURE_DISABLED` (no upgrade modal, no `BLOCKED_FEATURE` conversion event); plan-sold keys deny through `requireFeature` (403 `FEATURE_NOT_AVAILABLE`).
- `publicTenantFeatureGate(key, tenantType, resolveTenantId)` for public routes. Resolves the owning restaurant/supplier and returns 404 `FEATURE_DISABLED` when off.
- `platformFeatureGate(key)` for platform keys (global override only).

**Coverage guard:** `apps/api/src/lib/feature-route-coverage.test.js` parses every router mounted in `server.js` and fails unless it is listed as gated (and its source enforces each listed key) or exempt with a reason. Only infrastructure is exempt: auth/session (needed to reach any feature), file upload plumbing, the admin panel and Admin → Features itself (gating them could lock admins out), the subscriptions feature-map endpoint clients use to apply flags, the Stripe webhook (must always reconcile money), internal service auth and test-only e2e routes. A new router must be classified there.

**Within gated modules** every endpoint group is behind a flag. The only remaining always-on endpoints are `DELETE /api/account` / deletion status (account deletion is an app-store and privacy requirement) and admin-only moderation routes (admins bypass tenant flags). Scheduled quick-list auto-orders respect `ordering` (they downgrade to a reminder when it is off). Guest/consumer orders are governed by `public_sales` / `consumer_storefront`. Wiring tests: `orders-feature-gates.routes.test.js`, `supplier-ops-feature-gates.routes.test.js`; off-state resolution: `tenant-feature-gate.resolution.test.js`.

Platform keys appear in Admin → Features global list (`platformOnly: true` in the API payload) and accept the same inherit / on / off modes; they never appear in per-tenant override maps.

## Admin API

All routes require `ADMIN` role and `ADMIN_ACCESS` permission under `/api/admin-dashboard`.

| Method   | Path                                                     | Body / notes                                                                |
| -------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET`    | `/feature-flags`                                         | List global flags                                                           |
| `PATCH`  | `/feature-flags/:featureKey`                             | `{ "mode": "inherit" \| "on" \| "off" }`                                    |
| `GET`    | `/tenants/:tenantType/:id/feature-overrides`             | `tenantType`: `RESTAURANT` or `SUPPLIER`; returns overrides + effective map |
| `PUT`    | `/tenants/:tenantType/:id/feature-overrides/:featureKey` | `{ "enabled": true/false, "reason": "..." }`                                |
| `DELETE` | `/tenants/:tenantType/:id/feature-overrides/:featureKey` | Remove override                                                             |
| `GET`    | `/tenants/:tenantType/:id/entitlements`                  | Includes `effectiveFeatures` alongside plan entitlements                    |

## Examples

Force **smart_reorder** off globally:

```http
PATCH /api/admin-dashboard/feature-flags/smart_reorder
Content-Type: application/json

{ "mode": "off" }
```

Enable **chat** for one restaurant regardless of plan:

```http
PUT /api/admin-dashboard/tenants/RESTAURANT/{restaurantId}/feature-overrides/chat
Content-Type: application/json

{ "enabled": true, "reason": "Pilot" }
```

Revert to plan/global behavior:

```http
DELETE /api/admin-dashboard/tenants/RESTAURANT/{restaurantId}/feature-overrides/chat
```

## UI

**Admin Dashboard → Features** tab (`/app/admin`, select **Features** in the tab bar):

- **Global feature flags** — inherit / on / off per feature key
- **Per-tenant overrides** — pick restaurant or supplier, force on/off or clear override

## Canonical feature keys

**RESTAURANT** (29 plan-sold keys + 26 default-on): chat, order_calendar, reports, smart_reorder, multi_branch, receiving_quality, disputes_returns, finance_invoices, quick_lists, inventory_management, recipe_costing, waste_tracking, advanced_roles, notifications, api_integrations, support_sla, custom_branding, feature_flags_access, supplier_reviews, push_notifications, order_amendments, tenant_audit_log, waitlist_auto_promo, supplier_deals, supplier_deals_redeem, fulfillment_tools, **intelligence**, **ai_assistant**, **ai_platform**

**Current entitlement split (2026-09-22):** `intelligence` gates deterministic operational intelligence. `ai_assistant` gates the read-only conversational assistant and is enabled only for Restaurant Scale and Supplier Scale by default.
`ai_platform` gates only Smart Reorder LLM assistance; it does not grant the assistant. Both keys still require the normal environment, provider, quota, and override checks.

`ai_platform` enables genuine LLM for **Supplify Assistant** (`/api/assistant`) and Smart Reorder **explain / ask / ai-recommend** when `AI_ENABLED`, provider credentials, and AI quota are available. Forecast and heuristic paths never consume quota. Growth/Scale defaults come from tenant-specific plan feature JSON; the internal trial/free row follows `trial_target_plan_id` and the trial AI pool. Display name: **AI platform (assistant + reorder LLM)**.

`recipe_costing` — menu profitability and supplier price impact at `/app/recipes` (Gold+).

`fulfillment_tools` — dispatch board, pick lists, GPS tracking, driver management. Canonical key for `fulfillment` and `driver_management` aliases (see Feature aliases below).

`supplier_deals_redeem` — restaurants redeeming supplier deals. Shown with the other restaurant keys. Redemption requires both `supplier_deals` and `supplier_deals_redeem`.

`support_sla` — tenant support chat (`POST /api/chat/support/start` and `GET /api/chat/support/conversations`) requires both `chat` and `support_sla`. Paid plans use tier strings (`standard_72h`, `priority_24h`, `dedicated_same_day`); any enabled value opens the same support conversation. Response-time clocks are not a separate engine. Platform admin support tools stay on the admin role.

`api_integrations` — accounting file exports. Supplier invoice, payment, statement, QuickBooks, and AR-summary CSV downloads, and the restaurant invoice CSV download, require this flag in addition to `finance_invoices`. In-app invoice and payment screens stay on `finance_invoices`. Growth plans keep the flag off. There is no developer API-key or order/invoice webhook product; `api_key_access` and `full_api_webhooks` grant the same shipped export. Notification webhooks stay on `notifications: email_whatsapp_webhook`.

`feature_flags_access` — admin add-on grants. A positive add-on quantity requires an enabled value (`addon_toggles` or `all_experimental`) and a plan that prices that add-on. Setting the quantity to zero still cancels a historical add-on when the flag is off. Tenants do not self-serve feature flags.

**Removed:** `approvals_budgets` (not shown in admin UI)

**SUPPLIER** (28 plan-sold keys + 23 default-on): chat, order_calendar, reports, smart_reorder, ai_platform, multi_branch, warehouses, multi_warehouse, fulfillment_tools, fulfillment, driver_management, disputes_returns, finance_invoices, quick_lists, inventory_management, advanced_roles, notifications, api_integrations, support_sla, custom_branding, feature_flags_access, promotions, push_notifications, order_amendments, tenant_audit_log, supplier_growth, **intelligence**, **ai_assistant**

`smart_reorder` — reorder-assistance and AI features for supplier inventory.

`ai_platform` — same LLM gate as restaurant side; supplier Smart Reorder AI paths.

`finance_invoices` — supplier invoice management. Accounting CSV downloads also require `api_integrations`.

`supplier_growth` — customer import, referral invites, sponsored onboarding, growth dashboard.

## Feature aliases

`requireFeature` resolves aliases before checking plan JSON:

| Alias               | Resolves to         |
| ------------------- | ------------------- |
| `fulfillment`       | `fulfillment_tools` |
| `driver_management` | `fulfillment_tools` |

When the plan omits `fulfillment` or `driver_management`, `requireFeature` checks `fulfillment_tools` instead. An explicit admin off is not replaced by that alias. Alias logic lives in `FEATURE_ALIASES` in `feature-flags.js`.

## Real-time refresh

When a global override or per-tenant override is changed, the server emits an `entitlements_refresh` WebSocket event to all connected clients. Frontend apps should listen for this event and re-fetch entitlements to reflect changes immediately without requiring a page reload.

## Related

- Subscription plans and limits: admin dashboard plan editor
- Paywall responses: HTTP 403 with `FEATURE_NOT_AVAILABLE` from `requireFeature`
