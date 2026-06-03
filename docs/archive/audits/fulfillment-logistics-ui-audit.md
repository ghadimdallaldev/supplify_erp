# Fulfillment & Logistics UI Audit

**Date:** 2026-05-28  
**Scope:** Supplier Fulfillment & Logistics page — Driver Dispatch, Pick Lists, Routes, Delivery Tracking, Exceptions.

---

## Issues found (before fix)

| Issue                                                       | Root cause                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Status/Driver dropdowns showed all options as expanded text | `SelectItem` children were not wrapped in `SelectContent` in `DeliveryBoardFilters.tsx`                |
| Duplicate, broken mini-list above dispatch board            | `DeliveryBoardFilters` rendered a plain text list by area; `DriverDispatchBoard` rendered kanban below |
| Orders looked like repeated restaurant names only           | Minimal card layout; filters list only showed name + status on one line                                |
| Stats incomplete                                            | Only 4 columns; missing failed/rescheduled; delivery board stats not wired to dispatch                 |
| Pick Lists / Tracking reused generic order cards            | No table layout, weak empty/loading/error states                                                       |
| Routes tab was read-only empty list                         | No create route API/UI; only `GET /routes`                                                             |
| `FulfillmentPage.tsx` ~1000 lines                           | Unused DnD dispatch board code never mounted in UI                                                     |
| Driver name in assign modal sometimes blank                 | API returns `fullName`; UI read `full_name` only                                                       |

---

## Components changed

| File                              | Change                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `FulfillmentPage.tsx`             | Slim shell: tabs, warehouse filter, delegates to tab components               |
| `FulfillmentDispatchPanel.tsx`    | **New** — filters + dispatch query + delivery board filter merge              |
| `FulfillmentDispatchFilters.tsx`  | **New** — responsive filter bar with fixed `Select` usage                     |
| `DriverDispatchBoard.tsx`         | Rich order cards, 6-stat summary, permissions, skeleton/error/empty           |
| `DispatchOrderRow.tsx`            | **New** — order card with ref, area, schedule, status badge, actions          |
| `fulfillmentDispatchUtils.ts`     | **New** — filter/summary helpers                                              |
| `FulfillmentPickListsTab.tsx`     | **New** — table + search + states                                             |
| `FulfillmentRoutesTab.tsx`        | Route table, detail panel, empty state → Driver Dispatch                      |
| `FulfillmentRouteDetailPanel.tsx` | **New** — stop list, reorder, cancel, status updates                          |
| `CreateRouteDialog.tsx`           | **New** — create route from dispatch selection                                |
| `DriverDispatchBoard.tsx`         | Multi-select orders + “Create route” (FULFILLMENT_MANAGE)                     |
| `FulfillmentTrackingTab.tsx`      | **New** — active deliveries table via delivery board API                      |
| `FulfillmentExceptionsTab.tsx`    | **New** — exceptions table aligned with `openCount`                           |
| `DeliveryBoardFilters.tsx`        | **Removed** — replaced by dispatch panel                                      |
| `types/index.ts`                  | Optional `delivery_area`, `scheduled_at`, `delivery_status` on dispatch cards |

---

## API / data mapping

| UI field                          | Source                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Dispatch columns                  | `GET /api/fulfillment/dispatch`                                                                                         |
| Filtered order set                | `GET /api/supplier/deliveries/board` (date, status, driver, area)                                                       |
| Area, scheduled time (enrichment) | Delivery board `orders[].deliveryArea`, `scheduledAt` merged onto dispatch cards                                        |
| Tracking rows                     | Delivery board with `status=out_for_delivery`                                                                           |
| Routes list/detail                | `GET /api/fulfillment/routes`, `GET /routes/:id`                                                                        |
| Create route                      | `POST /api/fulfillment/routes` (from dispatch order IDs)                                                                |
| Route manage                      | `PATCH /routes/:id`, `DELETE /routes/:id` (cancel), `POST /routes/:id/stops/reorder`, `PATCH /routes/:id/stops/:stopId` |
| Driver active route               | `GET /api/fulfillment/routes/active`                                                                                    |
| Dispatch eligibility              | `active_route_id` on dispatch orders                                                                                    |
| Exceptions                        | `GET /api/fulfillment/exceptions` — `openCount` matches `status === 'open'`                                             |
| Driver dropdown labels            | `full_name` or `fullName` from drivers list                                                                             |

Migration `0127_delivery_route_planning.sql` adds `driver_id`, `route_label`, `area` on `delivery_route`. Route planning uses existing `delivery_route` + `route_stop` and syncs `driver_assignments` on create/stop updates.

---

## Responsive checks

| Width     | Behavior                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------- |
| 320–430px | Tab grid 2 columns; filters stack; dispatch columns stack (1 col); tables scroll horizontally inside card |
| 768px     | Filters 2-column grid; dispatch 2 columns                                                                 |
| Desktop   | Filters 4+action row; dispatch 4 kanban columns                                                           |

Page uses `max-w-full overflow-x-hidden` to avoid body horizontal scroll.

---

## Tests

| File                                    | Coverage                                                   |
| --------------------------------------- | ---------------------------------------------------------- |
| `fulfillmentDispatchUtils.test.ts`      | Filter helpers, summary, order ref, route selection rules  |
| `DriverDispatchBoard.test.tsx`          | Filter bar select, stats, cards, empty/error, RBAC actions |
| `delivery-routes.service.test.js` (API) | Create validation, list, cancel, reorder, driver scope     |

Run:

```bash
cd apps/web && npx vitest run src/components/fulfillment/fulfillmentDispatchUtils.test.ts src/components/fulfillment/DriverDispatchBoard.test.tsx
```

---

## Stabilization pass (2026-05-28)

| Check                                        | Result                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Migration `0127_delivery_route_planning.sql` | Applied (`driver_id`, `route_label`, `area`)                                                  |
| Create route from Driver Dispatch            | Works — multi-select, driver/date/label, creates `delivery_route` + stops                     |
| Routes tab list + detail                     | Table with progress; detail reorder/cancel/status                                             |
| Driver active route                          | `GET /routes/active`; stop updates sync `driver_assignments`                                  |
| Driver isolation                             | List scoped by `driver_id`; detail returns 403 for other drivers’ routes                      |
| Status sync                                  | Stop `DELIVERED`/`FAILED`/`OUT_FOR_DELIVERY` → `updateDeliveryStatus` on assignment           |
| UI states                                    | Loading/error on routes list, route detail, create-route drivers, driver route card           |
| Tests                                        | `fulfillment.routes.test.js` (3), `delivery-routes.service.test.js` (7), web fulfillment (11) |

**Bugs fixed in stabilization:** driver `failure_reason` not sent on failed stop (`FAILED` vs `failed`); driver-only user with unlinked profile could bypass route detail scope; unused dead code in `GET /routes`; missing detail/route loading-error UI.

## Remaining gaps (current limitations)

| Gap                                      | Notes                                                            |
| ---------------------------------------- | ---------------------------------------------------------------- |
| No maps / auto-optimization / route PDFs | Out of scope — manual stop order only                            |
| Dispatch API has no server-side filters  | Filters use delivery board IDs client-side                       |
| Route list N+1                           | Each route loads full stops in list API (OK for small fleets)    |
| Cancelled routes hidden by default       | Pass `include_cancelled=true` to list API if needed later        |
| Tier gate for route planning             | Not enforced — uses `FULFILLMENT_MANAGE` / driver delivery perms |
| Pick list warehouse column               | Only when `warehouse_name` on order API                          |
| Drag-and-drop dispatch                   | Removed (was demo-only)                                          |

---

## Manual QA checklist

- [ ] Driver Dispatch: status/driver dropdowns render as normal selects, not expanded lists
- [ ] Filter bar: date, status, driver, area, clear — stack on phone
- [ ] Summary shows total, pending, out, delivered, failed, rescheduled
- [ ] Order cards show restaurant, order #, area, schedule, driver, status badge, view/assign actions
- [ ] Empty filters → message + clear button
- [ ] API error → retry works
- [ ] Viewer role → no assign/status buttons
- [ ] Pick Lists table loads with loading skeleton
- [ ] Routes empty → “No routes planned yet” + link to Driver Dispatch
- [ ] Driver Dispatch: select orders → Create route → driver + date → save → appears in Routes tab
- [ ] Route detail: reorder stops, mark delivered/failed, cancel route
- [ ] Driver deliveries page shows active route stops in order
- [ ] Tracking shows only out-for-delivery orders
- [ ] Exceptions tab badge matches open exceptions count

---

## Suggested future tiering (not enforced)

| Tier     | Capability                                                              |
| -------- | ----------------------------------------------------------------------- |
| Silver   | Driver dispatch, assign/reassign, status updates                        |
| Gold     | Route planning (create route from dispatch, Routes tab, manual reorder) |
| Platinum | Map optimization, auto-sequencing, ETA (future)                         |

Today route planning uses existing fulfillment/driver permissions (`FULFILLMENT_MANAGE` for suppliers; `DRIVER_DELIVERIES_MANAGE` for stop updates). No new tier flags were added in this pass.
