# Disputes & Returns

Plan feature key: `disputes_returns` (included in the selected trial target and paid Growth/Scale plans for both restaurants and suppliers; expired trials remain subject to account-lock rules).

## Overview

Restaurants can open formal disputes on **delivered / received / invoiced / completed** orders when deliveries are wrong, damaged, or billed incorrectly. Disputes can include **per line-item** quantities (e.g. received 1 of 3 SKUs). Each line must be an item on that order for that supplier, and stored quantities and prices come from the order line. The disputed amount, and any credit or refund, cannot exceed that supplier's line total (or the linked invoice total when it is lower). Suppliers see incoming disputes under **Disputes** (Operations nav) and on the **order timeline**; both sides get notifications. Suppliers review, resolve (optionally issuing a credit note), or reject. Credit notes link to the existing `credit_note` finance table.

## Workflow

1. Restaurant opens a dispute from a completed order (optionally linked to a receiving report or invoice).
2. Supplier **team** receives an in-app notification (`notifyTenantUsers`).
3. Supplier marks **under review**, then **resolves** (credit note, replacement, refund, or no action) or **rejects** with notes.
4. Restaurant is notified on resolution or rejection.
5. Credit notes can be listed and marked **applied** via the credit-notes API.
6. **Replacement** resolution automatically creates a new `PLACED` follow-up order (`placement_source = DISPUTE_REPLACEMENT`) for disputed short quantities at **$0** unit price, linked on `disputes.replacement_order_id` and `customer_order.source_*` fields. Repeated lines for the same order item are combined and capped at that line's ordered quantity.

**Rules:**

- Only one active dispute per order (`open`, `under_review`, or `escalated`). Opening a dispute locks the order and checks again, so two requests cannot both create an active dispute.
- Each order item appears once on a dispute. A replacement sums short quantities for that line and never ships more than the original ordered quantity.
- Order status must be one of: `DELIVERED`, `RECEIVED_PARTIAL`, `RECEIVED_FULL`, `INVOICED`, `COMPLETED`.
- When a dispute is opened after receiving, order status becomes **`RECEIVED_WITH_DISPUTE`** (visible on order list and timeline for restaurant and supplier). When the dispute is resolved, rejected, or cancelled, status returns to `RECEIVED_PARTIAL` or `RECEIVED_FULL` based on the receiving report.
- During receiving, the API automatically opens (or extends) **one active dispute** when any line is short or has non-accepted quality. Dispute creation is part of the same transaction as receiving, inventory, invoice, and order state, so a retry cannot leave a partial receipt.
- Optional `items[]` on create for partial-line disputes (`quantityOrdered` vs `quantityReceived`).
- Restaurant can **cancel** while status is `open`.

## API reference

Requires auth, `disputes_returns` feature, and appropriate RBAC permissions.

### Restaurant

| Method | Path                            | Permission    | Description                                  |
| ------ | ------------------------------- | ------------- | -------------------------------------------- |
| POST   | `/api/disputes`                 | ORDERS_CREATE | Open dispute                                 |
| GET    | `/api/disputes`                 | ORDERS_VIEW   | List disputes (`?status=`)                   |
| GET    | `/api/disputes/:id`             | ORDERS_VIEW   | Detail with items, attachments, credit notes |
| POST   | `/api/disputes/:id/attachments` | ORDERS_CREATE | Add evidence (`fileKey` from presign)        |
| POST   | `/api/disputes/:id/cancel`      | ORDERS_CREATE | Cancel open dispute                          |

### Supplier

| Method | Path                        | Permission    | Description                    |
| ------ | --------------------------- | ------------- | ------------------------------ |
| GET    | `/api/disputes/incoming`    | ORDERS_VIEW   | Incoming disputes              |
| GET    | `/api/disputes/:id`         | ORDERS_VIEW   | Dispute detail                 |
| POST   | `/api/disputes/:id/review`  | ORDERS_MANAGE | Mark under review              |
| POST   | `/api/disputes/:id/resolve` | ORDERS_MANAGE | Resolve (optional credit note) |
| POST   | `/api/disputes/:id/reject`  | ORDERS_MANAGE | Reject with `resolutionNotes`  |

### Credit notes

| Method | Path                          | Permission      | Description              |
| ------ | ----------------------------- | --------------- | ------------------------ |
| GET    | `/api/credit-notes`           | INVOICES_VIEW   | List tenant credit notes |
| POST   | `/api/credit-notes/:id/apply` | INVOICES_MANAGE | Mark credit note applied |

**Resolve body (credit note):**

```json
{
  "resolutionType": "credit_note",
  "creditNoteAmount": 125.5,
  "resolutionNotes": "Approved partial credit",
  "creditNoteNotes": "Damaged produce"
}
```

**Resolve body (refund):**

```json
{
  "resolutionType": "refund",
  "refundAmount": 125.5,
  "refundReference": "CASH-ADJ-2026-001",
  "resolutionNotes": "Cash adjustment recorded"
}
```

## Database

Migrations: `0072_disputes.sql`, `0209_dispute_resolution_effects.sql`

- `disputes`, `dispute_items`, `dispute_attachments`
- `disputes.replacement_order_id` — follow-up order when resolved with replacement
- `customer_order.source_order_id`, `source_dispute_id`, `placement_source` — trace replacement shipments
- `order_item.source_order_item_id`, `original_unit_price` — line-level replacement audit
- `credit_note.dispute_id` — links dispute resolutions to finance credit notes

## Notifications

| Event          | Recipient  | Category           |
| -------------- | ---------- | ------------------ |
| Dispute opened | Supplier   | `dispute_opened`   |
| Resolved       | Restaurant | `dispute_resolved` |
| Rejected       | Restaurant | `dispute_rejected` |

## Resolution effects and idempotency (2026-09-15)

Resolution runs in a transaction while locking the dispute row. A dispute can have one immutable dispute_resolution_effects record. Repeating the same request returns the existing result; a different resolution type, amount, or refund reference returns 409.

- credit_note creates one credit note and attempts to apply it to the linked outstanding invoice when parties and balance permit.
- replacement creates one linked PLACED replacement order and reserves its inventory.
- refund requires refundAmount and refundReference. It records an auditable invoice adjustment/credit-note effect; it does not claim that an external PSP refund occurred.
- no_action and reject close the dispute without financial or fulfillment mutation.

The detail response includes resolutionEffect so web, Android, and iOS can show the resulting credit, refund reference, or replacement order.
