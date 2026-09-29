# Supplier public sales

Supplier public sales extends the existing public supplier catalog and the existing
`customer_order` fulfillment pipeline to personal consumers and guests. It does not
replace restaurant B2B ordering and it does not reuse the restaurant-specific diner
`consumer_member` or `consumer_order` tables.

## Scope and defaults

- Public catalog visibility remains controlled by the existing supplier catalog toggle.
- Public orderability is controlled independently by supplier public-sales configuration.
- Public sales defaults to disabled for every supplier.
- Public checkout exposes only the existing default catalog price, currency, MOQ, and
  order multiple. Contract prices, negotiated prices, promotions, and loyalty pricing
  remain private to restaurant workflows.
- The initial payment methods are offline only: cash on delivery, cash on pickup, and
  bank transfer. Stripe platform billing is not merchandise checkout.
- Product-level public visibility and consumer favorites are not part of this release.

## Identity and ownership

Keycloak contains a `consumer` realm role, mapped to the application `CONSUMER`
role. Consumer registration requires a name, optional phone, and the platform Terms
and Privacy Policy. It creates a `consumer_profile` only: no tenant, workspace,
branch, warehouse, subscription, or business role is created.

`customer_order.customer_type` identifies one of:

| Type         | Required owner            |
| ------------ | ------------------------- |
| `RESTAURANT` | `restaurant_id`           |
| `CONSUMER`   | `consumer_user_id`        |
| `GUEST`      | neither account reference |

The database constraint enforces these combinations. Contact and delivery details are
snapshotted at placement. A database trigger prevents later mutation of the contact
snapshot.

Consumers have no tenant context and cannot use restaurant, supplier, ERP, or admin
APIs. Supplier settings continue to use `SETTINGS_VIEW` / `SETTINGS_EDIT`; public
order operations use `ORDERS_VIEW` / `ORDERS_MANAGE`. No permission or feature
key was added.

## Supplier configuration

`GET /api/supplier/public-sales` returns the storefront URL, eligible active
warehouses, selected delivery warehouses, selected pickup warehouse, offline payment
methods, bank-transfer instructions, and validation errors.

`PATCH /api/supplier/public-sales` applies the same validation server-side:

- at least one fulfillment method and one compatible payment method are required to
  enable sales;
- cash on delivery requires delivery;
- cash on pickup requires an active pickup warehouse;
- bank transfer requires instructions;
- every public delivery warehouse must be active and have an active delivery zone.

## Public and consumer APIs

| Method and path                                       | Purpose                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/public/suppliers`                           | Paginated/searchable sales-enabled supplier discovery                                      |
| `GET /api/public/suppliers/:idOrSlug`                 | Existing profile plus safe public-sales metadata                                           |
| `GET /api/public/suppliers/:idOrSlug/products`        | Existing catalog plus safe public price and quantity rules when enabled                    |
| `POST /api/public/suppliers/:idOrSlug/orders/preview` | Authoritative price, stock, rules, fulfillment, zone, fee, address, and payment validation |
| `POST /api/public/suppliers/:idOrSlug/orders`         | Transactional guest or consumer placement; requires `Idempotency-Key`                      |
| `GET /api/public/orders/:trackingToken`               | Restricted guest receipt/tracking projection                                               |
| `GET/PATCH /api/consumer/profile`                     | Personal consumer profile                                                                  |
| `GET/POST/PATCH/DELETE /api/consumer/addresses`       | Owner-scoped address CRUD                                                                  |
| `GET /api/consumer/orders`                            | Owner-scoped order history                                                                 |
| `GET /api/consumer/orders/:id`                        | Owner-scoped order detail                                                                  |
| `POST /api/consumer/orders/:id/reorder-preview`       | Rebuild candidates using current public price, rules, configured warehouses, and stock     |

An authenticated `CONSUMER` and an unauthenticated guest send the same checkout
payload to the same placement endpoint. Other authenticated platform roles are
rejected and must use their existing workflow.

## Placement, stock, and fulfillment

Preview and create derive the supplier tenant from the submitted product IDs within
the resolved storefront scope. A cart must contain exactly one underlying supplier
tenant even when the public storefront represents an organization with branches.

Create repeats validation inside a database transaction, snapshots default prices,
inserts the order and lines, reserves the selected warehouse stock, creates the
warehouse assignment, and commits the idempotency result atomically. A successful
idempotency replay is returned before stock is rechecked, so the original reservation
does not make its own retry fail. Public actor scopes are `PUBLIC:<supplierId>` and
`CONSUMER:<userId>`; restaurant scopes remain backward compatible.

Delivery is limited to explicitly selected public-delivery warehouses and fails closed
unless an active zone matches. Pickup uses the explicitly selected active pickup
warehouse. Pickup never receives a driver assignment or delivery route. Stored order
statuses remain unchanged; clients display `PLACED` as “Pending confirmation,”
pickup `SHIPPED` as “Ready for pickup,” and pickup `DELIVERED` as “Picked up.”

Restaurant-only receiving, inventory intake, B2B invoices, disputes, supplier reviews,
contracts, promotions, loyalty, and restaurant dashboards remain restricted to
restaurant orders.

## Notifications and security

- Supplier users receive the existing placed-order notification.
- Registered consumers receive in-app, push, and email order status notifications
  against their `app_user` identity. Notification links use `/shop/orders/:id`.
- Guests receive the initial secure receipt page, optional email, and WhatsApp only
  when the provider is configured and checkout consent is true. No SMS provider was
  added.
- Guest tracking tokens are 32 random bytes. Only their SHA-256 hashes are stored.
  Raw tokens are not logged, stored in notification metadata, or returned by an
  idempotent replay. Native clients may keep the first returned token in SecureStore.
- Because the raw token is intentionally unrecoverable, only the initial guest
  confirmation can contain its tracking link. Later guest status messages contain the
  status but cannot re-embed that link. If the first successful HTTP response is lost,
  an idempotent replay returns the receipt without reissuing the token.
- Public limits are 30 previews per minute per IP, 5 creates per 10 minutes per
  IP/storefront, and 30 tracking reads per minute per IP.
- Preview and placement reject public checkout bodies larger than 64 KiB before
  business validation.

## Clients

The web extends `PublicSupplierCatalogPage` and retains custom-domain browsing and
the separate restaurant B2B cart. Guests and consumers use a local public cart keyed
to the underlying supplier tenant, authoritative preview, final summary, idempotent
placement, receipt/tracking, and post-checkout account creation. Registered consumers
have a separate `/shop` shell with discovery, orders, notifications, saved addresses,
profile, and cart rebuilding.

Both Expo repositories contain the same reusable `features/publicShop` module.
Logged-out users enter `PublicShopNavigator`; registered consumers enter
`ConsumerNavigator`. Guest public calls explicitly disable authentication and
therefore never refresh or clear a business session. Guest tokens and minimal receipt
metadata are stored in SecureStore; contact and address fields are cleared after
placement.

See [Guest public shopping on mobile](../mobile/GUEST_PUBLIC_SHOPPING.md) for native
navigation, secure storage, and app-link provisioning.

## Rollout

1. Apply migration `0223_supplier_public_sales.sql`.
2. Provision the Keycloak `consumer` realm role and refresh/import the matching realm
   configuration.
3. Deploy API, then web, Android, and iOS.
4. Publish the Apple associated-domain file and Android Digital Asset Links file for
   `app.supplifyerp.com`.
5. Suppliers explicitly configure valid fulfillment/payment settings and enable public
   sales.

No new environment variable is required.
