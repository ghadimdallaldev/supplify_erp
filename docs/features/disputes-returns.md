# Disputes & Returns

Plan feature key: `disputes_returns` (included on **Free** and paid plans for both restaurants and suppliers; free tiers remain subject to usual order/product/chat limits).

## Overview

Restaurants can open formal disputes on **delivered / received / invoiced / completed** orders when deliveries are wrong, damaged, or billed incorrectly. Disputes can include **per line-item** quantities (e.g. received 1 of 3 SKUs). Suppliers see incoming disputes under **Disputes** (Operations nav) and on the **order timeline**; both sides get notifications. Suppliers review, resolve (optionally issuing a credit note), or reject. Credit notes link to the existing `credit_note` finance table.

## Workflow

1. Restaurant opens a dispute from a completed order (optionally linked to a receiving report or invoice).
2. Supplier **team** receives an in-app notification (`notifyTenantUsers`).
3. Supplier marks **under review**, then **resolves** (credit note, replacement, refund, or no action) or **rejects** with notes.
4. Restaurant is notified on resolution or rejection.
5. Credit notes can be listed and marked **applied** via the credit-notes API.
6. **Replacement** resolution automatically creates a new `PLACED` follow-up order (`placement_source = DISPUTE_REPLACEMENT`) for disputed short quantities at **$0** unit price, linked on `disputes.replacement_order_id` and `customer_order.source_*` fields.

**Rules:**

- Only one active dispute per order (`open`, `under_review`, or `escalated`).
- Order status must be one of: `DELIVERED`, `RECEIVED_PARTIAL`, `RECEIVED_FULL`, `INVOICED`, `COMPLETED`.
- When a dispute is opened after receiving, order status becomes **`RECEIVED_WITH_DISPUTE`** (visible on order list and timeline for restaurant and supplier). When the dispute is resolved, rejected, or cancelled, status returns to `RECEIVED_PARTIAL` or `RECEIVED_FULL` based on the receiving report.
- During receiving, disputes are prompted **once** when the user taps **Complete receiving** and any line had a short quantity or non-accepted quality (not one dialog per line).
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

## Database

Migration: `0072_disputes.sql`

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
