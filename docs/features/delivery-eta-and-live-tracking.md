# Delivery ETA and live tracking

Companion to [drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md). Covers ETA **readiness** (not the ETA calculation itself).

## Prerequisites for ETA

| Input                   | Source                                       | Required for ETA                |
| ----------------------- | -------------------------------------------- | ------------------------------- |
| Driver latest GPS       | `driver_latest_location` / order-scoped ping | Yes                             |
| Destination coordinates | Restaurant / branch delivery location        | Yes                             |
| Text address alone      | `address_json`, delivery area name           | No (not geocoded automatically) |

If destination latitude/longitude are missing, live maps can still show the **driver** position, but **ETA stays unavailable**.

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

### Tracking payload

`GET /api/orders/:id/tracking` includes:

| Field                             | Restaurant view | Supplier view                        |
| --------------------------------- | --------------- | ------------------------------------ |
| `destinationCoordinatesAvailable` | ✓               | ✓                                    |
| `destinationLabel`                | ✓ (safe label)  | ✓                                    |
| `destination.latitude/longitude`  | omitted         | ✓ (for fulfillment map / future ETA) |
| `etaAvailable`                    | ✓               | ✓                                    |

`etaAvailable` is **true** when live driver GPS **and** destination coordinates are both present. Actual minute-level ETA is a follow-up feature.

### Fallback when missing

UI shows:

> ETA unavailable — restaurant delivery location is not set.

Order creation is **not** blocked when coordinates are missing.

---

## Next step: ETA calculation

Once both sides are available, a future service can compute ETA from haversine or routing without schema changes. Do not geocode `address_json` in the API for this MVP.
