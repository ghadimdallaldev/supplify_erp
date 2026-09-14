# Order fulfillment routing map

Updated 2026-09-14.

## Repository model

| Concept                          | Current repository meaning and owner                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supplier organization            | `supplier_organizations`; the customer-facing parent for linked supplier tenant accounts. It does not itself own tenant-scoped products, catalogs, prices, contracts, or stock. |
| Supplier tenant / branch account | `supplier`; a sellable tenant linked by `organization_id`. Products, catalog visibility, pricing, contract prices, staff, and legacy order lines are scoped here.               |
| Restaurant tenant                | `restaurant`; the buyer tenant.                                                                                                                                                 |
| Restaurant delivery branch       | `branch` with `tenant_id` pointing to the restaurant. It is an operational destination, not a supplier fulfillment site.                                                        |
| Warehouse                        | `warehouse`; a supplier fulfillment location owned by one supplier tenant (`tenant_id` on current schemas, with runtime compatibility for legacy `supplier_id`).                |
| Fulfillment assignment           | `order_warehouse_assignment`; historical rows may be line-level, while new non-split orders use one order-level row with `order_item_id IS NULL`.                               |
| Availability and stock           | Catalog/product relationships and `warehouse_inventory` remain the sources of truth. No second warehouse-product availability table was introduced.                             |
| Delivery zones                   | `delivery_zone`; supplier warehouse zones use supplier/warehouse ownership. Restaurant branch zones are a separate existing use of the shared table.                            |

## New-order route

Restaurant discovery exposes one supplier organization card. Product rows remain tenant-specific when no canonical master product identity exists; products are never merged by name, description, SKU guesses, package size, or fuzzy matching. The restaurant therefore sees:

`Supplier Organization → Catalog → Cart → Checkout → Order`

Server-side fulfillment resolution is:

`Supplier Organization → eligible supplier tenant → eligible warehouse`

The selected tenant must own every product in the basket, and the warehouse must belong to that same tenant. A sibling tenant in the same organization cannot fulfill the basket unless the repository later gains an explicit shared catalog/product ownership model. New orders require one warehouse for the complete basket; split fulfillment remains a legacy-read concern only.

Candidate warehouses are evaluated in this order: service-zone eligibility, product/routing capability, catalog availability as represented by existing tenant product/catalog relationships, stock where `warehouse_inventory` tracks it, operational schedule/cutoff, delivery method/time, MOQ/business rules, contract compatibility, supplier-configured routing priority, then distance only when reliable coordinates already exist. Missing coordinates do not block routing; deterministic configured priority and ID tie-breaking do.

Restaurant delivery location resolution is conservative. An explicit active restaurant branch is honored. If omitted, exactly one active operational branch is selected automatically. Multiple active branches require an explicit branch unless existing business logic supplies an unambiguous default; no such default field was found in this repository. With no operational branches, the legacy restaurant address is retained as the destination fallback. The resolved address and branch context are snapshotted on the order.

## Orders and compatibility

`order_item.supplier_id` remains required for historical reads, reporting, pricing, and legacy orders. For new single-tenant orders, `customer_order.supplier_organization_id` is the canonical customer-facing owner and the order-level warehouse assignment is canonical fulfillment. Legacy line assignments remain readable and pick-list queries prefer a line assignment, falling back to the order assignment.

Placed financial values are immutable snapshots on the order and lines: quantities, unit prices, discounts, contract price references, promotions, tax, fees, and totals. A transfer releases and reserves stock only when the target warehouse is owned by the same supplier tenant, is service-zone eligible, has the required stock, and can honor the existing committed order. Transfer never recalculates pricing; incompatible transfers are rejected.

## Placement idempotency

`order_placement_idempotency` enforces a unique `(restaurant_id, idempotency_key)` at the database level. The request hash is normalized over the payload (including canonical delivery branch and item identity) and successful responses are replayed. Reusing a key with another payload returns a conflict. The claim is created in the same transaction as order creation, so a rolled-back transaction does not poison the key. Successful keys are retained for 180 days and cleaned opportunistically during placement.

## Authorization and events

Fulfillment reassignment requires the existing supplier RBAC context plus `FULFILLMENT_TRANSFER`. Supplier-tenant users can transfer only orders containing their tenant's lines and only to warehouses owned by that tenant. Organization-scoped users are still bounded by their existing branch access; no new role hierarchy was added. Reassignment is limited to pending/picking assignments and order statuses `PLACED`, `CONFIRMED`, or `FULFILLING`, uses row locks, records reason/source/version, writes `fulfillment.transfer`, and emits a supplier fulfillment-transfer notification. Driver dispatch and delivery status transitions continue to require their existing assignment and proof/status rules.

## Ownership map used by the implementation

- Order ownership: `customer_order.restaurant_id`, `supplier_organization_id` for new rows, and `order_item.supplier_id` for tenant/history compatibility.
- Catalog ownership: supplier tenant product/catalog rows; organization views aggregate child tenants without merging tenant-specific products.
- Inventory ownership: legacy tenant inventory when no warehouse exists; `warehouse_inventory` when active warehouses exist.
- Pricing and contract scope: supplier tenant/product relationships and existing quote/contract price resolution; transfers preserve the committed snapshots.
- Permissions: `permission`, `role_permission`, named tenant roles, and supplier organization roles; `FULFILLMENT_TRANSFER` follows those conventions.
