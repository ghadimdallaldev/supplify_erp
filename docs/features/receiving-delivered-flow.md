# Receiving after supplier delivery

Plan feature key: `receiving_quality` (Bronze+ for restaurants).

## Flow

1. Supplier marks order **Delivered** (`DELIVERED`) from Orders list or order detail (**Mark Delivered**).
2. Restaurant opens **Receiving** (`/app/receiving`) — pending list includes orders with status `DELIVERED` or legacy `COMPLETED`, without an accepted receiving report.
3. Restaurant taps **Receive Now**, confirms quantities/quality, submits.
4. API creates `receiving_report` + line items, updates inventory, sets order to `RECEIVED_PARTIAL` or `RECEIVED_FULL`.
5. **Receiving history** tab lists past reports (not orders without a report).

Deep link: `/app/receiving?order={orderId}` opens the receive dialog when the order is in the pending list.

## API

| Method | Path                            | Notes                                       |
| ------ | ------------------------------- | ------------------------------------------- |
| GET    | `/api/receiving/pending-orders` | `DELIVERED` or `COMPLETED`, no final report |
| GET    | `/api/receiving/history`        | Last 50 `receiving_report` rows             |
| POST   | `/api/receiving/receive`        | Requires receivable status                  |

Restaurant tenant resolution uses active branch context (`getRestaurantIdForRequest`) with `contact_email` fallback.

## Frontend

- `apps/web/src/lib/orderReceiving.ts` — `isOrderReadyForReceiving()` for `DELIVERED` / `COMPLETED`.
- `ReceivingPage.tsx` — enables **Receive Now** when delivered; no “waiting for supplier to complete” for `DELIVERED`.

## Order timeline

`buildOrderTimeline()` treats `DELIVERED` as completed delivery step; **Confirm receipt** is the active restaurant step until receiving is recorded. See `apps/web/src/lib/orderTimeline.ts`.
