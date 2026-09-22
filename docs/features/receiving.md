# Receiving after supplier delivery

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

Plan feature key: `receiving_quality` (Silver+ for restaurants).

## Flow

1. Supplier assigns a driver and advances the exact assignment (`assigned` -> `picked_up` -> `out_for_delivery`). Physical departure is dispatch: `out_for_delivery` atomically promotes the parent `PROCESSING` order to `SHIPPED`. The driver confirms a photo-backed POD with `POST /api/orders/:id/complete-delivery`, which saves the proof and completes that assignment atomically; the order becomes **`DELIVERED`** (not `COMPLETED`) when its delivery legs are complete.
2. Optional: driver sends GPS pings during active assignment; restaurant may see **sanitized** live tracking on order detail (`RestaurantOrderTrackingPanel`) — see [drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md). GPS does **not** auto-complete receiving.
3. Supplier may also mark **Delivered** from Orders list or order detail (**Mark Delivered**).
4. Restaurant opens **Receiving** (`/app/receiving`) — pending list includes orders with status `DELIVERED` or legacy `COMPLETED`, without an accepted receiving report.
5. Restaurant taps **Receive Now** (or **Receive order** on order detail tracking panel / Quick Actions), confirms quantities/quality, submits.
6. API validates that every order line appears exactly once, normalizes the mobile/web payload, and creates the report, line items, accepted inventory, invoice, order status, and any automatic dispute in one transaction.
7. A short quantity or any non-`ACCEPTED` quality creates or extends the order's single active dispute and sets the order to `RECEIVED_WITH_DISPUTE`. A discrepancy-free receipt becomes `RECEIVED_FULL`.
8. Suppliers are notified of receiving completion (`RECEIVED_*` status) and of any automatically opened dispute.
9. **Receiving history** tab lists past reports (not orders without a report).

**Line-item authority:** the server resolves product identity, unit, and expected/actual unit pricing from the persisted order item. Web and mobile may submit received quantity, quality, notes, and lot data, but cannot override ordered product or financial facts.

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

Android and iOS expose an actual-quantity, quality-status, and notes field for every line and submit every line. They do not offer receiving while an order is merely `SHIPPED`.

`buildOrderTimeline()` treats `DELIVERED` as completed delivery step; driver milestones (`driver-assigned`, `driver-picked-up`, etc.) appear when tracking API returns assignment data. **Confirm receipt** is the active restaurant step until receiving is recorded. See `apps/web/src/lib/orderTimeline.ts`.

## Related

- GPS / tracking spec: [drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md)
- Manual QA: `GPS-*` and `RECV-*` rows in [regression-checklist.md](../qa/regression-checklist.md)
