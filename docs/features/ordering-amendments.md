# Order Amendments & Change Requests

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

## Overview

After an order is placed, restaurants and suppliers can request structured changes (quantity, substitution, removal, delivery date, other). The counter-party accepts, rejects, or the requester cancels a pending request.

**Plan gate:** `order_amendments` — **Silver+** (on in migration `0117` for Silver restaurant and supplier).

## Mutable order statuses

Amendments are allowed while status is one of: `PLACED`, `PENDING_APPROVAL`, `ACKNOWLEDGED`, `PROCESSING`. Not allowed after `SHIPPED`, `DELIVERED`, etc.

Only one **pending** amendment per order at a time.

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

Notifications are sent to the **counterparty tenant team** via `notifyTenantUsers` (not only the primary contact email).

## Database

Migration: `0076_order_amendments.sql` — `order_amendments`, `order_amendment_items`.
