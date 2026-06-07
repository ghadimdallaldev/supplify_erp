# Delivery ETA and live tracking

Companion to [drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md). Covers destination coordinates, ETA calculation, and tracking payload fields.

## Prerequisites for ETA

| Input                   | Source                                       | Required for ETA                |
| ----------------------- | -------------------------------------------- | ------------------------------- |
| Driver latest GPS       | `driver_latest_location` / order-scoped ping | Yes                             |
| Destination coordinates | Restaurant / branch delivery location        | Yes                             |
| Active delivery status  | Assignment `picked_up` or `out_for_delivery` | Yes                             |
| Text address alone      | `address_json`, delivery area name           | No (not geocoded automatically) |

If destination latitude/longitude are missing, live maps can still show the **driver** position, but **ETA stays unavailable**.

---

## ETA calculation

Service: [`delivery-eta.service.js`](../../apps/api/src/services/delivery-eta.service.js)

### Formula

1. **Distance** — haversine great-circle distance between driver GPS and destination (rounded to **1 decimal km**).
2. **Base time** — `(distanceKm / speedKmh) × 60` minutes.
3. **Range** — `etaMinutesMin = max(1, round(base × minMultiplier))`, `etaMinutesMax = max(min, round(base × maxMultiplier))`.

Default speed and multipliers are configurable (see below). This is a **straight-line city estimate**, not turn-by-turn routing.

### Environment (API)

| Variable                            | Default | Purpose                                   |
| ----------------------------------- | ------- | ----------------------------------------- |
| `DELIVERY_ETA_CITY_SPEED_KMH`       | `20`    | Assumed average city speed                |
| `DELIVERY_ETA_MIN_MULTIPLIER`       | `1.0`   | Lower bound on ETA range                  |
| `DELIVERY_ETA_MAX_MULTIPLIER`       | `1.5`   | Upper bound on ETA range                  |
| `DELIVERY_ETA_SERVICE_TIME_MINUTES` | `5`     | Minutes added per prior stop on the route |

Configured in dev via [`deploy/railway/development/api.env`](../../deploy/railway/development/api.env).

### Route-aware ETA (manual stop order)

When an order is on a `PLANNED` or `IN_PROGRESS` route with a known stop sequence:

1. **Next active stop** — ETA = driver GPS → that order’s destination (same as direct ETA).
2. **Later stops** — ETA = driver → each prior active stop → target stop, using haversine legs plus `DELIVERY_ETA_SERVICE_TIME_MINUTES` per prior stop.

If no route order exists (standalone delivery), behavior is unchanged (direct ETA).

Extra payload fields:

| Field                | Restaurant | Supplier |
| -------------------- | ---------- | -------- |
| `stopsBefore`        | ✓          | ✓        |
| `nextStop`           | ✓          | ✓        |
| `routePosition`      | omitted    | ✓        |
| `routePositionTotal` | omitted    | ✓        |

Restaurant copy examples:

- Next stop: “Arriving in about 12–18 minutes”
- Later on route: “Your delivery is planned after 2 stops” + “Estimated arrival: 35–50 minutes”

Supplier copy examples:

- “ETA 35–50 min”
- “2 stops before this order · Route position 3 of 10”

Limitation: straight-line distance only — no paid routing API yet.

### Driver-built routes and ETA

When a driver uses **Build my route** (see [drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md)), standalone assignments are grouped into a `delivery_route`. ETA then uses the same route-aware logic as supplier-planned routes — later stops include prior legs and service time.

### Map display (ETA unchanged)

Maps are separate from ETA math:

- **Supplier** single-order maps show driver + destination pins with a **Recenter** control.
- **Restaurant** maps show driver pin only (destination coordinates are not exposed in the API).
- **Fulfillment → Delivery Tracking → Map** shows all active deliveries for the supplier.

---

| Condition                                            | Supplier `unavailableReason` |
| ---------------------------------------------------- | ---------------------------- |
| Order `CANCELLED` or delivery `delivered` / `failed` | `order_terminal`             |
| Assignment not `picked_up` or `out_for_delivery`     | `assignment_not_active`      |
| No destination coordinates                           | `destination_missing`        |
| No driver `latestLocation`                           | `driver_location_missing`    |

Restaurant payloads omit `unavailableReason`; UI shows friendly copy instead.

### When ETA is available

**Supplier payload** (full):

```json
{
  "etaAvailable": true,
  "etaMinutesMin": 12,
  "etaMinutesMax": 18,
  "distanceKm": 4.2,
  "confidence": "MEDIUM",
  "calculatedAt": "2026-06-07T12:00:00.000Z"
}
```

**Restaurant payload** (sanitized — no `unavailableReason`, no `confidence`, no destination lat/lng):

```json
{
  "etaAvailable": true,
  "etaMinutesMin": 12,
  "etaMinutesMax": 18,
  "distanceKm": 4.2,
  "calculatedAt": "2026-06-07T12:00:00.000Z",
  "destinationCoordinatesAvailable": true,
  "destinationLabel": "Loading dock"
}
```

### Stale GPS

When driver GPS is stale (`tracking.isStale === true`), ETA **remains available** with `confidence: "LOW"`. Supplier UI shows a subtle “Low confidence” badge; restaurant UI does not expose confidence.

### Visibility matrix

| Field                                  | Restaurant view | Supplier view       |
| -------------------------------------- | --------------- | ------------------- |
| `destinationCoordinatesAvailable`      | ✓               | ✓                   |
| `destinationLabel`                     | ✓ (safe label)  | ✓                   |
| `destination.latitude/longitude`       | omitted         | ✓ (fulfillment map) |
| `etaAvailable`                         | ✓               | ✓                   |
| `etaMinutesMin` / `etaMinutesMax`      | ✓               | ✓                   |
| `distanceKm`                           | ✓               | ✓                   |
| `calculatedAt`                         | ✓               | ✓                   |
| `stopsBefore` / `nextStop`             | ✓               | ✓                   |
| `routePosition` / `routePositionTotal` | omitted         | ✓                   |
| `confidence`                           | omitted         | ✓                   |
| `unavailableReason`                    | omitted         | ✓ (when blocked)    |

### Frontend display

Helpers: [`deliveryEtaDisplay.ts`](../../apps/web/src/lib/deliveryEtaDisplay.ts)

| Audience   | ETA available copy                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Restaurant | Next stop: “Arriving in about 12–18 minutes”. Later: “planned after N stops” + estimated range |
| Supplier   | “ETA 12–18 min” + stops before / route position + distance + LOW badge                         |

Panels: `RestaurantOrderTrackingPanel`, `OrderDeliveryTrackingPanel`, `DeliveryTrackingDrawer`.

---

## Restaurant delivery location coordinates

### Why coordinates are needed

ETA and turn-by-turn navigation need a numeric destination. Supplify stores **GPS coordinates** separately from the textual business address so drivers and suppliers can compute distance/time without geocoding on every request.

### Branch-level location

Each operational **`branch`** row (linked from `customer_order.branch_id`) can have its own delivery coordinates. When an order has a `branch_id` and that branch has coordinates set, those values are used as the destination.

When branch coordinates are missing, the system falls back to the **`restaurant`** tenant row for the same order (`restaurant_id`).

Org-level “branch accounts” (separate `restaurant` rows under an organization) set coordinates on **that restaurant tenant** via the same delivery-location APIs.

### Database (`0143_restaurant_delivery_coordinates.sql`)

Columns on **`branch`** and **`restaurant`**:

| Column                    | Type            | Purpose                                             |
| ------------------------- | --------------- | --------------------------------------------------- |
| `delivery_latitude`       | `DECIMAL(10,7)` | Destination latitude                                |
| `delivery_longitude`      | `DECIMAL(10,7)` | Destination longitude                               |
| `delivery_location_label` | `TEXT`          | Short label shown in tracking (e.g. “Loading dock”) |
| `delivery_address_notes`  | `TEXT`          | Optional driver notes                               |

All nullable — orders and tracking continue to work when unset.

### How restaurants set coordinates

**Settings → Profile → Delivery location** (`RestaurantDeliveryLocationCard`):

- Latitude / longitude (manual entry; paste from Google Maps)
- Location label and address notes
- Helper text: “This location is used for delivery ETA and driver navigation.”

When a tenant has multiple operational branches, each branch can be edited separately.

### APIs

| Method | Path                                                    | Access                                                               |
| ------ | ------------------------------------------------------- | -------------------------------------------------------------------- |
| GET    | `/api/restaurants/me/delivery-locations`                | Restaurant admin                                                     |
| PATCH  | `/api/restaurants/me/delivery-location`                 | Restaurant admin — default tenant location                           |
| PATCH  | `/api/restaurants/branches/:branchId/delivery-location` | Restaurant admin — operational branch                                |
| PATCH  | `/api/restaurant-org/branches/:restaurantId`            | Org owner / regional manager — also accepts delivery location fields |

Validation:

- Latitude ∈ [-90, 90], longitude ∈ [-180, 180]
- Both null clears the location
- Partial lat/lng rejected

Suppliers read destination coordinates only through **`GET /api/orders/:id/tracking`** for orders they fulfill (not full restaurant profile).

### Fallback when missing

UI shows:

> ETA unavailable — restaurant delivery location is not set.

Order creation is **not** blocked when coordinates are missing.

Do not geocode `address_json` in the API for this MVP.
