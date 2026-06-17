# Driver onboarding guide

Operational guide for **supplier-linked drivers** using the web driver portal (PWA-friendly). Covers login, deliveries, routes, GPS, status updates, proof of delivery (POD), failures, privacy, and troubleshooting.

**Primary persona:** User with supplier **Driver** role (`DRIVER_DELIVERIES_VIEW` / `DRIVER_DELIVERIES_MANAGE`), linked to a `drivers` row.

**Home route:** `/app/driver-deliveries` (sidebar **My Deliveries** under DELIVERIES section — only nav item for driver role).

---

## Step 1 — Receive credentials and log in

| Field                    | Detail                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Access Supplify with a driver-linked account.                                                                                                             |
| **Who**                  | New driver (invited by supplier admin).                                                                                                                   |
| **Navigation path**      | `/login` (or invite flow `/invite?token=…` if email invite sent)                                                                                          |
| **Required data**        | Email and password (Keycloak); accept legal terms on invite if applicable.                                                                                |
| **Expected result**      | `GET /api/auth/me` returns supplier tenant context with driver permissions; sidebar shows only **My Deliveries**.                                         |
| **Possible errors**      | User not linked to `drivers` table — fulfillment APIs return `403`; wrong role shows full supplier nav (not driver).                                      |
| **Validation checklist** | [ ] Login succeeds. [ ] Redirect to `/app/driver-deliveries` or home with driver nav only. [ ] No access to `/app/fulfillment` without extra permissions. |

**API:** Standard auth session; driver linkage verified by `requireLinkedDriver` on order/fulfillment mutations.

---

## Step 2 — Open the driver deliveries board

| Field                    | Detail                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | See all assignments for today and standalone deliveries.                                                                                           |
| **Who**                  | Active driver.                                                                                                                                     |
| **Navigation path**      | Sidebar **My Deliveries** → `/app/driver-deliveries`                                                                                               |
| **Required data**        | None — board loads assigned orders from supplier dispatch.                                                                                         |
| **Expected result**      | `GET /api/supplier/deliveries/board` returns orders with `deliveryStatus`, restaurant name, delivery area, schedule; active vs completed sections. |
| **Possible errors**      | `403` if not linked driver; empty board if no assignments; feature `driver_management` off at supplier (no assignments created).                   |
| **Validation checklist** | [ ] Page loads without error. [ ] Assigned orders visible. [ ] Refresh button refetches board and route.                                           |

---

## Step 3 — Understand delivery statuses and allowed actions

| Field                    | Detail                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Know which buttons appear for each assignment state.                                                                                                                                                                                                                                                    |
| **Who**                  | Driver.                                                                                                                                                                                                                                                                                                 |
| **Navigation path**      | `/app/driver-deliveries` — each `DriverDeliveryCard`                                                                                                                                                                                                                                                    |
| **Required data**        | Current `deliveryStatus` on assignment.                                                                                                                                                                                                                                                                 |
| **Expected result**      | Status `assigned`/`pending` → actions: **I'm on the way** (`out_for_delivery`), **Problem** (`failed`), **Reschedule** (`rescheduled`). Status `picked_up`/`out_for_delivery` → **Delivered**, **Problem**, **Reschedule**. Terminal: `delivered`, `failed`, `rescheduled` — no further driver actions. |
| **Possible errors**      | Invalid transition rejected by API with message toast.                                                                                                                                                                                                                                                  |
| **Validation checklist** | [ ] Primary action label matches status. [ ] Completed orders move to completed section or route stop marked complete.                                                                                                                                                                                  |

**API:** `PATCH /api/orders/:id/delivery-status` with body `{ status, notes?, failure_reason? }` (canonical). Assignment statuses: `assigned` → `picked_up` → `out_for_delivery` → `delivered` | `failed` | `rescheduled`.

---

## Step 4 — Update status: “I'm on the way” and delivered

| Field                    | Detail                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Progress deliveries so restaurants get notifications and live tracking when entitled.                                                                                 |
| **Who**                  | Driver on assigned order.                                                                                                                                             |
| **Navigation path**      | `/app/driver-deliveries` → card action buttons or sticky action bar for next stop                                                                                     |
| **Required data**        | Order id; optional notes in textarea per card.                                                                                                                        |
| **Expected result**      | `out_for_delivery` starts restaurant-visible tracking window; `delivered` sets `customer_order.status = DELIVERED` and triggers `notifyOrderStatusChange(DELIVERED)`. |
| **Possible errors**      | Not assigned to order; supplier does not own order; concurrent update conflict.                                                                                       |
| **Validation checklist** | [ ] Toast “Delivery status updated”. [ ] Restaurant order shows updated status. [ ] GPS tracking becomes active on `out_for_delivery` (see Step 7).                   |

**API:** `PATCH /api/orders/:id/delivery-status` via `useUpdateOrderDeliveryStatusMutation`.

---

## Step 5 — Build a route from multiple standalone deliveries

| Field                    | Detail                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Group 2+ active assignments into one ordered route when supplier did not plan a route.                                                                                        |
| **Who**                  | Driver with 2+ eligible standalone deliveries and no active route today.                                                                                                      |
| **Navigation path**      | `/app/driver-deliveries` — **Build my route** card (shown when `standaloneEligibleCount >= 2` and no `activeRoute`)                                                           |
| **Required data**        | Optional `{ date: "YYYY-MM-DD" }` (defaults today).                                                                                                                           |
| **Expected result**      | `POST /api/fulfillment/routes/build-from-assignments` creates `IN_PROGRESS` route `{Driver name} — Today's route`; orders move into `DriverRoutePanel`; idempotent on repeat. |
| **Possible errors**      | Fewer than 2 eligible orders; orders already on another route; API error toast “Could not build route”.                                                                       |
| **Validation checklist** | [ ] Route panel appears with ordered stops. [ ] Standalone cards for routed orders hidden from active list. [ ] Supplier sees route on `/app/fulfillment` Routes tab.         |

---

## Step 6 — Navigate the route panel (stops, next stop, reorder)

| Field                    | Detail                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Follow stop sequence and adjust order manually in the field.                                                                                                                                                 |
| **Who**                  | Driver on active route (`IN_PROGRESS` or today's planned route).                                                                                                                                             |
| **Navigation path**      | `/app/driver-deliveries` → **Today's route** (`DriverRoutePanel`)                                                                                                                                            |
| **Required data**        | Active route from `GET /api/fulfillment/routes/active` (alias `GET /api/fulfillment/routes/today`).                                                                                                          |
| **Expected result**      | Next incomplete stop highlighted; **Set as next** via `PATCH /api/fulfillment/routes/:id/next-stop` `{ orderId }`; move up/down via `POST /api/fulfillment/routes/:id/stops/reorder` `{ stop_ids: uuid[] }`. |
| **Possible errors**      | Cannot reorder completed/failed stops; route not owned by driver.                                                                                                                                            |
| **Validation checklist** | [ ] Next stop badge on correct card. [ ] Reorder persists after refresh. [ ] Route stop status updates sync with order delivery status.                                                                      |

**API:** `GET /api/fulfillment/routes/active`, `PATCH .../next-stop`, `POST .../stops/reorder`, `PATCH .../routes/:routeId/stops/:stopId` for stop-level status.

---

## Step 7 — GPS permission and live location sharing

| Field                    | Detail                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Share live position during active deliveries for supplier maps and restaurant ETA.                                                                                                                            |
| **Who**                  | Driver on trackable assignment (`assigned`, `picked_up`, `out_for_delivery` per `isTrackableDeliveryStatus`).                                                                                                 |
| **Navigation path**      | `/app/driver-deliveries` — header GPS banner (`DriverDeliveriesHeader` + `useDriverLocationTracking`)                                                                                                         |
| **Required data**        | Browser location permission; `VITE_GPS_TRACKING_ENABLED` not `false`; device GPS on.                                                                                                                          |
| **Expected result**      | `navigator.geolocation.watchPosition` sends pings every `VITE_GPS_UPDATE_INTERVAL_SECONDS` (default 15s) via `POST /api/orders/:id/location` with lat/lng/accuracy; banner shows **Location active**.         |
| **Possible errors**      | Permission denied → banner **Location permission needed**; unsupported browser; server `GPS_TRACKING_ENABLED=false`; send failure → **Location not updating**.                                                |
| **Validation checklist** | [ ] Browser prompts for location on first visit. [ ] Banner green/active during delivery. [ ] Supplier **View tracking** drawer shows live/stale marker. [ ] `driver_location_ping` rows created server-side. |

**API:** `POST /api/orders/:id/location` — body: `latitude`, `longitude`, `accuracyMeters`, optional `speedMps`, `headingDegrees`, `recordedAt`.

**Client env:** `VITE_GPS_TRACKING_ENABLED`, `VITE_GPS_UPDATE_INTERVAL_SECONDS`.

---

## Step 8 — Open Maps for turn-by-turn navigation

| Field                    | Detail                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Navigate to restaurant delivery area using external maps (Supplify does not provide turn-by-turn in-app).  |
| **Who**                  | Driver.                                                                                                    |
| **Navigation path**      | Each delivery card → **Open Maps** link                                                                    |
| **Required data**        | `deliveryArea` text or restaurant name for query string.                                                   |
| **Expected result**      | Opens `https://maps.google.com/?q={encoded destination}` in new tab; min 48px touch target for mobile.     |
| **Possible errors**      | “Delivery area not set” if supplier/restaurant omitted address text (coords still help supplier-side ETA). |
| **Validation checklist** | [ ] Link opens maps app/site. [ ] Works on mobile Safari/Chrome.                                           |

---

## Step 9 — Proof of delivery (POD)

| Field                    | Detail                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Attach delivery evidence (photo, recipient name, GPS at delivery).                                                                                                             |
| **Who**                  | Driver or supplier fulfillment manager on assigned order.                                                                                                                      |
| **Navigation path**      | Order actions on driver card after delivery; supplier may upload on `/app/fulfillment` dispatch board (“POD on file” / “No POD”)                                               |
| **Required data**        | `file_key` (uploaded asset), optional `recipient_name`, `notes`, `latitude`/`longitude`, `driver_assignment_id`.                                                               |
| **Expected result**      | `POST /api/orders/:id/proof-of-delivery` creates `proof_of_delivery` row; `delivery_gps_lat/lng` stored when coordinates sent; `hasPod` true on board.                         |
| **Possible errors**      | Upload/storage failure; order not in delivered state for auto-assignment lookup.                                                                                               |
| **Validation checklist** | [ ] POD submits after photo upload. [ ] Supplier dispatch shows “POD on file”. [ ] Restaurant can confirm POD where receiving workflow supports it (`confirmProofOfDelivery`). |

**API:** `POST /api/orders/:id/proof-of-delivery`, `GET /api/orders/:id/proof-of-delivery`.

---

## Step 10 — Failed delivery and reschedule

| Field                    | Detail                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Record exceptions when delivery cannot complete.                                                                                                                                                                             |
| **Who**                  | Driver.                                                                                                                                                                                                                      |
| **Navigation path**      | `/app/driver-deliveries` → **Problem** (failed) or **Reschedule**                                                                                                                                                            |
| **Required data**        | Notes strongly recommended — used as `failure_reason` when status is `failed` (defaults to “Delivery failed” if empty).                                                                                                      |
| **Expected result**      | `failed` notifies supplier via `notifyDriverDeliveryMilestone`; order remains visible in supplier exceptions; `rescheduled` sets warning state for replanning. Route stop updated when on route via `handleRouteStopStatus`. |
| **Possible errors**      | Missing permission; cannot fail already terminal stop.                                                                                                                                                                       |
| **Validation checklist** | [ ] Failed stop shows danger badge. [ ] Supplier fulfillment exceptions list includes issue. [ ] Notes visible on order timeline.                                                                                            |

**API:** `PATCH /api/orders/:id/delivery-status` with `status: "failed"` and `failure_reason`; route stop `PATCH` with `status: "FAILED"`.

---

## Step 11 — Privacy rules (driver, restaurant, supplier)

| Field                    | Detail                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Understand what each party can see about location and identity.                                                                                                                                                                                                                                                                                                                                               |
| **Who**                  | Driver (read); compliance-aware ops.                                                                                                                                                                                                                                                                                                                                                                          |
| **Navigation path**      | N/A — behavior enforced server-side                                                                                                                                                                                                                                                                                                                                                                           |
| **Required data**        | N/A                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Expected result**      | **Restaurant:** live map only after `picked_up` / `out_for_delivery`; driver pin only (no destination coordinates on restaurant map); driver phone hidden unless `GPS_RESTAURANT_SHOW_DRIVER_PHONE=true`; no route stop list or ping history. **Supplier:** full tracking drawer with destination pin and GPS stale/live states. **Driver:** shares pings only for assigned active orders; no email per ping. |
| **Possible errors**      | N/A                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Validation checklist** | [ ] Restaurant cannot see map before dispatch. [ ] Driver name visibility follows `GPS_RESTAURANT_SHOW_DRIVER_NAME`. [ ] Pings stop when no trackable deliveries.                                                                                                                                                                                                                                             |

**Reference:** `docs/features/drivers-and-gps-tracking.md` — Privacy section; `restaurant-tracking-payload.js`.

---

## Step 12 — Sticky action bar and mobile UX

| Field                    | Detail                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Complete deliveries one-handed on phone.                                                                                   |
| **Who**                  | Driver on mobile viewport.                                                                                                 |
| **Navigation path**      | `/app/driver-deliveries` — `DriverStickyActionBar` at bottom                                                               |
| **Required data**        | Next standalone order or next route stop computed client-side.                                                             |
| **Expected result**      | Primary action for next delivery always visible; large touch targets (48px min height on buttons).                         |
| **Possible errors**      | Bar hidden when no active deliveries.                                                                                      |
| **Validation checklist** | [ ] Sticky bar shows correct next stop. [ ] Action matches card primary button. [ ] Scroll does not hide critical actions. |

---

## Step 13 — Show completed deliveries

| Field                    | Detail                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Review finished work for the day.                                                                              |
| **Who**                  | Driver.                                                                                                        |
| **Navigation path**      | `/app/driver-deliveries` → toggle **Show completed**                                                           |
| **Required data**        | None.                                                                                                          |
| **Expected result**      | Terminal orders (`delivered`, `failed`, `rescheduled`) listed; counts in header (`activeCount` / `doneCount`). |
| **Possible errors**      | None.                                                                                                          |
| **Validation checklist** | [ ] Completed section expands. [ ] Done count matches deliveries finished.                                     |

---

## Step 14 — PWA installation and home-screen use

| Field                    | Detail                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goal**                 | Install Supplify as home-screen app for faster daily access.                                                                               |
| **Who**                  | Driver on supported mobile browser.                                                                                                        |
| **Navigation path**      | Browser menu → **Add to Home Screen** / **Install app** (after visiting `https://{your-host}/login` and logging in)                        |
| **Required data**        | HTTPS origin; valid service worker if configured in web build.                                                                             |
| **Expected result**      | Standalone window opens to last session; driver lands on deliveries after auth.                                                            |
| **Possible errors**      | iOS requires Safari for add-to-homescreen; third-party cookies/session may expire — re-login needed.                                       |
| **Validation checklist** | [ ] Icon on home screen launches app shell. [ ] Login session persists reasonable duration. [ ] GPS permission survives per browser rules. |

---

## Step 15 — PWA and field troubleshooting

| Field                    | Detail                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Goal**                 | Resolve common driver-side failures without supplier IT.                                                               |
| **Who**                  | Driver or dispatcher coaching driver.                                                                                  |
| **Navigation path**      | `/app/driver-deliveries` + device settings                                                                             |
| **Required data**        | Symptom, order id, browser, OS version.                                                                                |
| **Expected result**      | Issue classified and fixed per table below.                                                                            |
| **Possible errors**      | N/A                                                                                                                    |
| **Validation checklist** | [ ] Hard refresh retried. [ ] Location permission re-granted. [ ] Supplier notified if server-side assignment missing. |

### Troubleshooting matrix

| Symptom                        | Cause                                                    | Fix                                                                 |
| ------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Blank deliveries page          | No assignments                                           | Confirm supplier assigned you on `/app/fulfillment`                 |
| `403` on status update         | Not linked driver                                        | Supplier **Settings → Drivers** link user                           |
| GPS banner “permission needed” | Browser blocked location                                 | Site settings → Allow location; iOS: Settings → Safari → Location   |
| GPS “not updating”             | Network/API error                                        | Check mobile data; retry; verify `POST .../location` in network tab |
| Tracking stale on supplier map | Ping older than `GPS_STALE_AFTER_SECONDS` (300s default) | Keep app foreground; check interval env                             |
| Build route missing            | &lt;2 standalone deliveries                              | Wait for more assignments or use supplier-planned route             |
| Actions disabled               | `updating` in flight                                     | Wait for prior request; refresh page                                |
| Logged out unexpectedly        | Session timeout                                          | `/login` again; use PWA add-to-homescreen after login               |
| Wrong nav (full supplier menu) | User has non-driver roles                                | Use driver-only account or supplier adjusts roles                   |
| Maps opens wrong place         | Missing delivery area text                               | Use restaurant name; ask supplier to fix address                    |

### Escalation to supplier dispatch

Provide: driver name, order uuid (`formatOrderRef` on card), current status shown in UI, screenshot of GPS banner, and time of failure. Supplier verifies on `/app/fulfillment` → **View tracking** and `GET /api/orders/:id/tracking`.

**Server env (supplier ops):** `GPS_TRACKING_ENABLED`, `GPS_STALE_AFTER_SECONDS`, `GPS_MIN_ACCURACY_METERS`, `GPS_ALLOW_RESTAURANT_LIVE_TRACKING`.

---

## API quick reference (driver)

| Method | Path                                             | Purpose                         |
| ------ | ------------------------------------------------ | ------------------------------- |
| GET    | `/api/supplier/deliveries/board`                 | Driver delivery list            |
| GET    | `/api/fulfillment/routes/active`                 | Today's route + stops           |
| POST   | `/api/fulfillment/routes/build-from-assignments` | Build route from assignments    |
| PATCH  | `/api/orders/:id/delivery-status`                | Status updates                  |
| POST   | `/api/orders/:id/location`                       | GPS ping                        |
| GET    | `/api/orders/:id/tracking`                       | Tracking read (driver assigned) |
| POST   | `/api/orders/:id/proof-of-delivery`              | Submit POD                      |
| PATCH  | `/api/fulfillment/routes/:id/stops/reorder`      | Reorder stops                   |
| PATCH  | `/api/fulfillment/routes/:id/next-stop`          | Set next stop                   |

**Plan requirement:** Supplier must be on plan with `driver_management` (Gold+) for driver CRUD and assignments; driver portal itself requires linked driver user regardless of driver device.
