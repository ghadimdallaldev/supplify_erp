# Disputes & Returns

Plan feature key: `disputes_returns` (Bronze+ on restaurant and supplier plans).

## Overview

Restaurants can open formal disputes on **completed (delivered)** orders when deliveries are wrong, damaged, or billed incorrectly. Suppliers review, resolve (optionally issuing a credit note), or reject. Credit notes link to the existing `credit_note` finance table.

## Workflow

1. Restaurant opens a dispute from a completed order (optionally linked to a receiving report or invoice).
2. Supplier receives an in-app notification.
3. Supplier marks **under review**, then **resolves** (credit note, replacement, refund, or no action) or **rejects** with notes.
4. Restaurant is notified on resolution or rejection.
5. Credit notes can be listed and marked **applied** via the credit-notes API.

**Rules:**

- Only one active dispute per order (`open`, `under_review`, or `escalated`).
- Only `COMPLETED` orders qualify.
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
- `credit_note.dispute_id` — links dispute resolutions to finance credit notes

## Notifications

| Event          | Recipient  | Category           |
| -------------- | ---------- | ------------------ |
| Dispute opened | Supplier   | `dispute_opened`   |
| Resolved       | Restaurant | `dispute_resolved` |
| Rejected       | Restaurant | `dispute_rejected` |
