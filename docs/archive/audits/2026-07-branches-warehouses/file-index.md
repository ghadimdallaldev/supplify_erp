# Branches and Warehouses — File Index

**Generated:** 2026-07-17  
**Companion docs:** `docs/branches-and-warehouses-audit.md`, `docs/branches-and-warehouses-data.json`

Status values: `active` · `legacy` · `test` · `migration` · `docs` · `unclear`

Relevance columns use `Y` (yes), `P` (partial), `-` (no).

---

## Migrations

| Path                                                              | Purpose                                           | Status    | Rest. branch | Supp. branch | Warehouse | Perms | Billing |
| ----------------------------------------------------------------- | ------------------------------------------------- | --------- | ------------ | ------------ | --------- | ----- | ------- |
| `apps/api/db/migrations/0001_init.sql`                            | Creates `supplier`, `restaurant`, `app_user`      | migration | Y            | Y            | -         | -     | -       |
| `apps/api/db/migrations/0002_inventory_enhancements.sql`          | First `warehouse` (`supplier_id`), inventory      | migration | -            | -            | Y         | -     | -       |
| `apps/api/db/migrations/0015_restaurant_onboarding.sql`           | First `branch` (`restaurant_id`), team            | migration | Y            | -            | -         | P     | -       |
| `apps/api/db/migrations/0022_subscription_system.sql`             | Polymorphic `subscription`                        | migration | P            | P            | -         | -     | Y       |
| `apps/api/db/migrations/0023_branches_warehouses.sql`             | Normalizes `branch`/`warehouse` tenant_id, usage  | migration | Y            | -            | Y         | -     | Y       |
| `apps/api/db/migrations/0024_admin_overrides_chat_updates.sql`    | `tenant_limit_override`                           | migration | P            | P            | P         | -     | Y       |
| `apps/api/db/migrations/0041_rbac_tenant_roles.sql`               | Legacy `user_role` with optional branch/warehouse | migration | P            | P            | P         | Y     | -       |
| `apps/api/db/migrations/0044_plan_catalog_by_tenant_type.sql`     | Plans by tenant type                              | migration | -            | -            | -         | -     | Y       |
| `apps/api/db/migrations/0059_tenant_account_links.sql`            | Legacy linked branch accounts                     | migration | Y            | Y            | -         | P     | P       |
| `apps/api/db/migrations/0078_tenant_named_roles.sql`              | `tenant_roles`, `tenant_user_roles`               | migration | Y            | Y            | -         | Y     | -       |
| `apps/api/db/migrations/0080_supplier_branch_limits.sql`          | `multi_branch` feature seeds                      | migration | P            | Y            | -         | -     | Y       |
| `apps/api/db/migrations/0081_warehouse_fulfillment.sql`           | Warehouse inventory, routing, multi_warehouse     | migration | -            | P            | Y         | P     | Y       |
| `apps/api/db/migrations/0082_supplier_branch_accounts.sql`        | `supplier_organizations` + org RBAC               | migration | -            | Y            | -         | Y     | Y       |
| `apps/api/db/migrations/0083_warehouse_contact_columns.sql`       | Warehouse contact columns                         | migration | -            | -            | Y         | -     | -       |
| `apps/api/db/migrations/0085_branch_invitations.sql`              | Supplier `branch_invitations`                     | migration | -            | Y            | -         | Y     | -       |
| `apps/api/db/migrations/0086_restaurant_branch_accounts.sql`      | `restaurant_organizations` + org RBAC             | migration | Y            | -            | -         | Y     | Y       |
| `apps/api/db/migrations/0087_restaurant_invitations.sql`          | Restaurant invitations                            | migration | Y            | -            | -         | Y     | -       |
| `apps/api/db/migrations/0104_user_workspace_membership.sql`       | One workspace per user                            | migration | Y            | Y            | -         | Y     | -       |
| `apps/api/db/migrations/0121_branch_warehouse_plan_limits.sql`    | Plan limit updates                                | migration | Y            | Y            | Y         | -     | Y       |
| `apps/api/db/migrations/0122_tenant_subscription_addons.sql`      | Branch/warehouse add-ons                          | migration | Y            | Y            | Y         | -     | Y       |
| `apps/api/db/migrations/0137_driver_location_tracking.sql`        | Driver GPS (supplier-scoped)                      | migration | -            | P            | P         | -     | -       |
| `apps/api/db/migrations/0143_restaurant_delivery_coordinates.sql` | Branch/restaurant GPS                             | migration | Y            | -            | -         | -     | -       |
| `apps/api/db/migrations/0161_consumer_ordering.sql`               | B2C uses legacy `branch`                          | migration | Y            | -            | -         | -     | -       |
| `apps/api/db/migrations/0171_audit_integrity_fixes.sql`           | Active subscription unique index                  | migration | P            | P            | -         | -     | Y       |
| `apps/api/db/migrations/0186_recipe_costing.sql`                  | `recipe_branches` → legacy `branch`               | migration | Y            | -            | -         | -     | -       |
| `apps/api/db/migrations/0190_four_plan_pricing_model.sql`         | Current four-plan limits/features                 | migration | Y            | Y            | Y         | -     | Y       |

---

## API libraries

| Path                                         | Purpose                                              | Status | Rest. branch | Supp. branch | Warehouse | Perms | Billing |
| -------------------------------------------- | ---------------------------------------------------- | ------ | ------------ | ------------ | --------- | ----- | ------- |
| `apps/api/src/lib/restaurant-org.js`         | Restaurant org CRUD, roles, create/deactivate branch | active | Y            | -            | -         | Y     | P       |
| `apps/api/src/lib/supplier-org.js`           | Supplier org CRUD, roles, create/deactivate branch   | active | -            | Y            | -         | Y     | P       |
| `apps/api/src/lib/linked-accounts.js`        | Legacy create/list/unlink linked tenants             | legacy | Y            | Y            | -         | P     | P       |
| `apps/api/src/lib/branch-invitations.js`     | Supplier branch staff invitations                    | active | -            | Y            | -         | Y     | -       |
| `apps/api/src/lib/restaurant-invitations.js` | Restaurant member/branch_manager invites             | active | Y            | -            | -         | Y     | -       |
| `apps/api/src/lib/tenant-switch.js`          | Access checks + active tenant token                  | active | Y            | Y            | -         | Y     | -       |
| `apps/api/src/lib/workspace-membership.js`   | Workspace join/conflict rules                        | active | Y            | Y            | -         | Y     | -       |
| `apps/api/src/lib/workspace-tenant.js`       | User → tenant assignment helpers                     | active | Y            | Y            | -         | Y     | -       |
| `apps/api/src/lib/org-billing-tenant.js`     | Resolve main-branch billing tenant                   | active | Y            | Y            | P         | -     | Y       |
| `apps/api/src/lib/plan-enforcement.js`       | Branch/warehouse count and limit checks              | active | Y            | Y            | Y         | -     | Y       |
| `apps/api/src/lib/subscription-addons.js`    | Extra branch/warehouse add-ons                       | active | Y            | Y            | Y         | -     | Y       |
| `apps/api/src/lib/limit-resolution.js`       | Applicable limit keys by tenant type                 | active | Y            | Y            | Y         | -     | Y       |
| `apps/api/src/lib/route-permissions.js`      | `settingsMutationGuard`, `orgStructureGuard`         | active | Y            | Y            | -         | Y     | -       |
| `apps/api/src/lib/permissions.js`            | Merges org + tenant permissions                      | active | Y            | Y            | -         | Y     | -       |
| `apps/api/src/lib/org-role-permissions.js`   | Org permission seeding helpers                       | active | Y            | Y            | -         | Y     | -       |
| `apps/api/src/lib/rbac.js`                   | `getRequestTenant`, `x-branch-id` header             | active | Y            | Y            | -         | Y     | -       |
| `apps/api/src/lib/register-account.js`       | Signup creates org + main branch                     | active | Y            | Y            | P         | Y     | Y       |
| `apps/api/src/lib/warehouse-helpers.js`      | Warehouse columns, default warehouse                 | active | -            | P            | Y         | -     | P       |
| `apps/api/src/lib/tenant-roles.js`           | Tenant named roles                                   | active | Y            | Y            | -         | Y     | -       |

---

## API routes

| Path                                                      | Purpose                                  | Status | Rest. branch | Supp. branch | Warehouse | Perms | Billing |
| --------------------------------------------------------- | ---------------------------------------- | ------ | ------------ | ------------ | --------- | ----- | ------- |
| `apps/api/src/routes/branches.routes.js`                  | Legacy linked branch accounts            | legacy | Y            | Y            | -         | Y     | Y       |
| `apps/api/src/routes/org.routes.js`                       | Supplier org branches + switch + users   | active | -            | Y            | -         | Y     | Y       |
| `apps/api/src/routes/restaurant-org.routes.js`            | Restaurant org branches + switch + users | active | Y            | -            | -         | Y     | Y       |
| `apps/api/src/routes/branch-invitations.routes.js`        | `/api/org/invitations`                   | active | -            | Y            | -         | Y     | -       |
| `apps/api/src/routes/restaurant-invitations.routes.js`    | Member + branch invites                  | active | Y            | -            | -         | Y     | -       |
| `apps/api/src/routes/branch-invitations-public.routes.js` | Public accept                            | active | Y            | Y            | -         | Y     | -       |
| `apps/api/src/routes/warehouses.routes.js`                | Warehouse CRUD, inventory, zones, rules  | active | -            | P            | Y         | Y     | Y       |
| `apps/api/src/routes/fulfillment/`                        | Pick/pack board; warehouse filters       | active | -            | P            | Y         | P     | -       |
| `apps/api/src/routes/drivers.routes.js`                   | Drivers; warehouse-aware when multi      | active | -            | P            | Y         | P     | -       |
| `apps/api/src/routes/reports.routes.js`                   | Single-tenant reports                    | active | P            | P            | P         | P     | -       |
| `apps/api/src/routes/inventory.routes.js`                 | Supplier inventory UI joins warehouse    | active | -            | -            | Y         | P     | -       |
| `apps/api/src/server.js`                                  | Mounts branch/org/warehouse routes       | active | Y            | Y            | Y         | -     | -       |

---

## API services

| Path                                                       | Purpose                                  | Status | Rest. branch | Supp. branch | Warehouse | Perms | Billing |
| ---------------------------------------------------------- | ---------------------------------------- | ------ | ------------ | ------------ | --------- | ----- | ------- |
| `apps/api/src/services/warehouseRouting.js`                | Assign order/items to warehouses         | active | -            | P            | Y         | -     | -       |
| `apps/api/src/services/warehouseInventory.js`              | Reserve/release/commit warehouse stock   | active | -            | -            | Y         | -     | -       |
| `apps/api/src/services/supplier-inventory.service.js`      | Authoritative checkout stock deduct      | active | -            | Y            | P         | -     | -       |
| `apps/api/src/services/restaurant-order-create.service.js` | Order create + routing hook              | active | Y            | Y            | Y         | -     | -       |
| `apps/api/src/services/pick-lists.service.js`              | Pick waves by warehouse                  | active | -            | -            | Y         | -     | -       |
| `apps/api/src/services/driver-fulfillment.service.js`      | Driver fulfillment + warehouse sync      | active | -            | P            | Y         | -     | -       |
| `apps/api/src/services/delivery-routes.service.js`         | Routes; warehouse filter                 | active | -            | P            | Y         | -     | -       |
| `apps/api/src/services/public-supplier-catalog.service.js` | Public catalog by supplier id/slug       | active | -            | Y            | -         | -     | -       |
| `apps/api/src/services/reports.service.js`                 | Report queries; legacy `branchId` filter | active | P            | P            | -         | -     | -       |
| `apps/api/src/services/invitationTokens.js`                | Invite token types                       | active | Y            | Y            | -         | Y     | -       |

---

## Scripts

| Path                                              | Purpose                          | Status  | Rest. branch | Supp. branch | Warehouse | Perms | Billing |
| ------------------------------------------------- | -------------------------------- | ------- | ------------ | ------------ | --------- | ----- | ------- |
| `apps/api/scripts/migrate-restaurants-to-orgs.js` | Backfill restaurants → org model | active  | Y            | -            | -         | Y     | P       |
| `apps/api/scripts/migrate-suppliers-to-orgs.js`   | Backfill suppliers → org model   | active  | -            | Y            | -         | Y     | P       |
| `apps/api/scripts/reduce-to-single-tenant.js`     | Ops utility                      | unclear | P            | P            | -         | -     | -       |

---

## Frontend

| Path                                                                      | Purpose                    | Status | Rest. branch | Supp. branch | Warehouse | Perms | Billing |
| ------------------------------------------------------------------------- | -------------------------- | ------ | ------------ | ------------ | --------- | ----- | ------- |
| `apps/web/src/contexts/BranchContext.tsx`                                 | Org vs linked branch state | active | Y            | Y            | -         | P     | P       |
| `apps/web/src/components/BranchSwitcher.tsx`                              | Header switcher            | active | Y            | Y            | -         | P     | -       |
| `apps/web/src/pages/OrgOverviewPage.tsx`                                  | Supplier org overview      | active | -            | Y            | -         | P     | P       |
| `apps/web/src/pages/RestaurantOrgOverviewPage.tsx`                        | Restaurant org overview    | active | Y            | -            | -         | P     | P       |
| `apps/web/src/pages/BranchDetailPage.tsx`                                 | Supplier branch detail     | active | -            | Y            | -         | Y     | -       |
| `apps/web/src/components/org/AddBranchModal.tsx`                          | Supplier add branch        | active | -            | Y            | -         | P     | Y       |
| `apps/web/src/components/org/RestaurantAddBranchModal.tsx`                | Restaurant add branch      | active | Y            | -            | -         | P     | Y       |
| `apps/web/src/components/org/BranchInvitationsPanel.tsx`                  | Supplier invites UI        | active | -            | Y            | -         | Y     | -       |
| `apps/web/src/components/org/BranchInviteModal.tsx`                       | Supplier invite modal      | active | -            | Y            | -         | Y     | -       |
| `apps/web/src/components/BranchAccountsPanel.tsx`                         | Settings branches panel    | active | Y            | Y            | -         | P     | Y       |
| `apps/web/src/components/supplier/settings/tabs/SupplierBranchesTab.tsx`  | Wraps branch panel         | active | -            | Y            | -         | -     | -       |
| `apps/web/src/components/restaurant/onboarding/OnboardingBranchesTab.tsx` | Onboarding branches        | active | Y            | -            | -         | P     | Y       |
| `apps/web/src/components/settings/WarehouseFulfillmentSettings.tsx`       | Multi-warehouse settings   | active | -            | -            | Y         | P     | Y       |
| `apps/web/src/pages/BranchInviteAcceptPage.tsx`                           | Legacy `/invite/branch`    | legacy | -            | Y            | -         | Y     | -       |
| `apps/web/src/pages/InviteAcceptPage.tsx`                                 | Unified invite accept      | active | Y            | Y            | -         | Y     | -       |
| `apps/web/src/services/api/endpoints/branches.ts`                         | RTK branch/org endpoints   | active | Y            | Y            | -         | -     | -       |
| `apps/web/src/services/api/endpoints/warehouses.ts`                       | RTK warehouse endpoints    | active | -            | -            | Y         | -     | -       |
| `apps/web/src/lib/planLimits.ts`                                          | Frontend limit gates       | active | Y            | Y            | Y         | -     | Y       |
| `apps/web/src/i18n/locales/en/branches.json`                              | Branch copy                | active | Y            | Y            | -         | -     | -       |
| `apps/web/src/App.tsx`                                                    | Routes `/app/org`, invites | active | Y            | Y            | -         | -     | -       |

---

## Tests

| Path                                                           | Purpose                | Status | Rest. branch | Supp. branch | Warehouse | Perms | Billing |
| -------------------------------------------------------------- | ---------------------- | ------ | ------------ | ------------ | --------- | ----- | ------- |
| `apps/api/src/routes/org.routes.test.js`                       | Supplier org routes    | test   | -            | Y            | -         | Y     | P       |
| `apps/api/src/routes/branches.routes.test.js`                  | Linked accounts        | test   | Y            | Y            | -         | P     | P       |
| `apps/api/src/routes/branch-invitations.routes.test.js`        | Supplier invites       | test   | -            | Y            | -         | Y     | -       |
| `apps/api/src/routes/branch-invitations-public.routes.test.js` | Public accept          | test   | Y            | Y            | -         | Y     | -       |
| `apps/api/src/routes/restaurant-invitations.routes.test.js`    | Restaurant invites     | test   | Y            | -            | -         | Y     | -       |
| `apps/api/src/lib/branch-invitations.test.js`                  | Invite lib             | test   | -            | Y            | -         | Y     | -       |
| `apps/api/src/lib/restaurant-invitations.test.js`              | Restaurant invite lib  | test   | Y            | -            | -         | Y     | -       |
| `apps/api/src/lib/plan-enforcement.test.js`                    | Limits                 | test   | Y            | Y            | Y         | -     | Y       |
| `apps/api/src/lib/org-billing-tenant.test.js`                  | Billing tenant resolve | test   | Y            | Y            | -         | -     | Y       |
| `apps/api/src/lib/org-billing-entitlements.test.js`            | Child inherits plan    | test   | Y            | Y            | -         | -     | Y       |
| `apps/api/src/lib/workspace-membership.test.js`                | Workspace rules        | test   | Y            | Y            | -         | Y     | -       |
| `apps/api/src/lib/permissions.test.js`                         | Org/tenant perm merge  | test   | Y            | Y            | -         | Y     | -       |
| `apps/api/src/lib/org-role-permissions.test.js`                | Org role perms         | test   | Y            | Y            | -         | Y     | -       |
| `apps/api/src/lib/subscription-addons.test.js`                 | Add-ons                | test   | Y            | Y            | Y         | -     | Y       |
| `apps/api/src/routes/warehouses.routes.test.js`                | Warehouse routes       | test   | -            | -            | Y         | P     | P       |
| `apps/api/src/services/warehouseRouting.test.js`               | Routing                | test   | -            | -            | Y         | -     | -       |
| `apps/api/src/services/warehouseInventory.test.js`             | Warehouse stock        | test   | -            | -            | Y         | -     | -       |
| `apps/web/src/contexts/BranchContext.test.tsx`                 | Branch context         | test   | Y            | Y            | -         | -     | -       |
| `apps/web/src/lib/planLimits.test.ts`                          | Frontend gates         | test   | Y            | Y            | Y         | -     | Y       |
| `apps/api/src/lib/register-account.test.js`                    | No default WH on free  | test   | P            | P            | Y         | -     | Y       |

**Missing:** `apps/api/src/routes/restaurant-org.routes.test.js` (no dedicated file found).

---

## Documentation (pre-existing)

| Path                                                     | Purpose                                | Status | Rest. branch | Supp. branch | Warehouse | Perms | Billing |
| -------------------------------------------------------- | -------------------------------------- | ------ | ------------ | ------------ | --------- | ----- | ------- |
| `docs/archive/audits/branches-warehouses-audit.md`       | Prior audit 2026-05-28                 | docs   | Y            | Y            | Y         | Y     | Y       |
| `docs/architecture/tenancy.md`                           | Tenancy overview (**partially stale**) | docs   | Y            | Y            | P         | Y     | Y       |
| `docs/features/restaurant-branches.md`                   | Restaurant org branches feature        | docs   | Y            | -            | -         | Y     | P       |
| `docs/features/supplier-branches.md`                     | Supplier org branches feature          | docs   | -            | Y            | -         | Y     | P       |
| `docs/features/branch-invitations.md`                    | Invitation flows                       | docs   | Y            | Y            | -         | Y     | -       |
| `docs/operations/branching.md`                           | Ops branching notes                    | docs   | Y            | Y            | -         | -     | -       |
| `docs/diagrams/restaurant/branch-creation-org-model.mmd` | Branch creation diagram                | docs   | Y            | -            | -         | -     | -       |
| `docs/diagrams/billing/branch-addon-flow.mmd`            | Branch add-on flow                     | docs   | Y            | Y            | -         | -     | Y       |
| `docs/pricing-and-limits-audit.md`                       | Related pricing audit                  | docs   | Y            | Y            | Y         | -     | Y       |

---

## This audit output

| Path                                         | Purpose                             | Status |
| -------------------------------------------- | ----------------------------------- | ------ |
| `docs/branches-and-warehouses-audit.md`      | Full narrative audit                | docs   |
| `docs/branches-and-warehouses-data.json`     | Structured machine-readable extract | docs   |
| `docs/branches-and-warehouses-file-index.md` | This file index                     | docs   |
