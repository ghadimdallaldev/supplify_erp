# Order Amendments & Change Requests

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

## Overview

After an order is placed, restaurants and suppliers can request structured changes (quantity, substitution, removal, delivery date, other). The counter-party accepts, rejects, or the requester cancels a pending request.

**Plan gate:** `order_amendments` — **Silver+** (on in migration `0117` for Silver restaurant and supplier).

## Mutable order statuses

Amendments are allowed while status is one of: `PLACED`, `PENDING_APPROVAL`, `ACKNOWLEDGED`, `PROCESSING`. Not allowed after `SHIPPED`, `DELIVERED`, etc.

Only one **pending** amendment per order at a time.

The mutable-status rule is checked again under the order lock when a response is accepted, and it is also enforced for supplier shortage/substitution endpoints. A request created earlier cannot be applied after the order has shipped. Requesters cannot accept or reject their own request.

## API

Mounted at `/api/orders/:orderId/amendments` (requires `ORDERS_VIEW` / `ORDERS_MANAGE`).

| Method | Path                   | Description                                                 |
| ------ | ---------------------- | ----------------------------------------------------------- |
| GET    | `/`                    | List amendments with line items                             |
| POST   | `/`                    | Create request                                              |
| POST   | `/:amendmentId/accept` | Counter-party accepts; updates lines and recalculates total |
| POST   | `/:amendmentId/reject` | Reject with `responseNotes`                                 |
| POST   | `/:amendmentId/cancel` | Requester cancels pending request                           |

## Accept behavior

- `quantity_change` — updates `order_item` quantity and `line_total`
- `item_removal` — deletes line
- `item_substitution` — replaces product on line
- `delivery_date_change` / `other` — status only (no line changes unless items provided)
- Stock is released and reserved again for the new lines. Warehouse legs released by that accept are marked `superseded`, not left `failed`, so they do not block a later delivery.

Notifications are sent to the **counterparty tenant team** via `notifyTenantUsers` (not only the primary contact email).

Supplier fulfillment issues may report a shortage alone or suggest a configured replacement. A replacement suggestion creates an `item_substitution` amendment and the fulfillment issue in one transaction, then notifies the restaurant. A failure rolls both back, so a restaurant never sees an amendment without its issue. The suggestion waits for restaurant approval before changing the order line. The line's supplier owns the substitution; the order is not limited to the first line's supplier. Android and iOS render amendment history defensively even when optional product information is absent.

## Database

Migration: `0076_order_amendments.sql` — `order_amendments`, `order_amendment_items`.
