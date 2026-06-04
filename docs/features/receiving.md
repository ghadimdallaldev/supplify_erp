# Receiving after supplier delivery

Plan feature key: `receiving_quality` (Silver+ for restaurants).

## Flow

1. Supplier assigns driver and advances delivery (`assigned` → `picked_up` → `out_for_delivery`) or driver marks **Delivered** on the driver portal — order status becomes **`DELIVERED`** (not `COMPLETED`).
2. Optional: driver sends GPS pings during active assignment; restaurant may see **sanitized** live tracking on order detail (`RestaurantOrderTrackingPanel`) — see [drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md). GPS does **not** auto-complete receiving.
3. Supplier may also mark **Delivered** from Orders list or order detail (**Mark Delivered**).
4. Restaurant opens **Receiving** (`/app/receiving`) — pending list includes orders with status `DELIVERED` or legacy `COMPLETED`, without an accepted receiving report.
5. Restaurant taps **Receive Now** (or **Receive order** on order detail tracking panel / Quick Actions), confirms quantities/quality, submits.
6. API creates `receiving_report` + line items, updates inventory, sets order to `RECEIVED_PARTIAL` or `RECEIVED_FULL`.
7. **Receiving history** tab lists past reports (not orders without a report).

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
- `RestaurantOrderTrackingPanel.tsx` — restaurant order detail; **Receive order** CTA when delivered (links to `/app/receiving?order={id}`).

## Order timeline

`buildOrderTimeline()` treats `DELIVERED` as completed delivery step; driver milestones (`driver-assigned`, `driver-picked-up`, etc.) appear when tracking API returns assignment data. **Confirm receipt** is the active restaurant step until receiving is recorded. See `apps/web/src/lib/orderTimeline.ts`.

## Related

- GPS / tracking spec: [drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md)
- Manual QA: `GPS-*` and `RECV-*` rows in [regression-checklist.md](../qa/regression-checklist.md)
