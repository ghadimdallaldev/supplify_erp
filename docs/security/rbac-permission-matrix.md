# Phase 1 RBAC permission matrix

Source of truth: [`role-matrix.js`](../../apps/api/src/lib/role-matrix.js) and [`permission-keys.js`](../../apps/api/src/lib/permission-keys.js). Backend checks are authoritative; UI checks are advisory.

| Workspace role                | Read permissions                                                   | Mutation boundary                                              |
| ----------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Owner                         | Full workspace permission set                                      | Full workspace management; owner-protection guards still apply |
| Restaurant Manager            | Orders, receiving, catalog, inventory, settings view, reservations | No settings or subscription management                         |
| Purchaser                     | Orders create/edit/view, catalog/inventory view                    | Cannot manage team, settings, or billing                       |
| Supplier Manager              | Orders, catalog, inventory, fulfillment, warehouses, settings view | No team/settings/billing administration                        |
| Warehouse / fulfillment staff | Orders view/edit, fulfillment, warehouse/inventory view            | No catalog, billing, or team administration                    |
| Driver                        | Delivery permissions only                                          | Delivery/POD actions only                                      |
| Viewer                        | Workspace `*_VIEW` permissions                                     | No create/edit/manage permissions                              |

Phase 1 route-specific controls:

| Surface                                     | Read                                                                                 | Mutation                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Supplier quote inbox                        | `ORDERS_VIEW`                                                                        | `ORDERS_MANAGE` to submit a response                   |
| Restaurant connection and sponsorship views | `SETTINGS_VIEW`                                                                      | `SETTINGS_MANAGE` to accept, decline, or select a plan |
| Legacy admin audit                          | `ADMIN_ACCESS`                                                                       | Read-only                                              |
| Legacy admin dashboard                      | `ADMIN_ACCESS`, `CATALOG_VIEW`, or `ORDERS_VIEW`                                     | Read-only                                              |
| Warehouse/driver tenant override            | Impersonation-bound tenant, or admin `ADMIN_TENANTS`/`ADMIN_ACCESS` with audit event | Override is never trusted from query/body alone        |

Owner, self-escalation, last-owner, and impersonation mutation guards remain enforced in the existing RBAC guard modules.
