# Full Dev Audit — Performance Findings

Date: 2026-06-07  
Scope: API + web (dev); Railway dev thresholds noted where relevant

## Summary

Recent migrations (`0138`–`0143`) and API patterns show deliberate hot-path optimization. Critical fulfillment/GPS/order paths have automated test coverage. Main residual risks are **polling overlap on tracking UIs** and **pre-existing test/mock drift** (not production regressions).

| Endpoint / Page                 | Problem                                          | Fix (if any)                                                                                      | Expected impact                                       | Risk                       | Rollback          |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------- | ----------------- |
| `POST /api/orders`              | Historically slow on Railway                     | Indexes in `0142_order_create_hot_path_indexes.sql`                                               | Faster order insert + line items                      | Low                        | Drop indexes      |
| `GET /auth/me`                  | Called on bootstrap; heavy permission resolution | Redis permission cache (120s TTL), singleflight, tenant context cache                             | Fewer DB round-trips per session                      | Low                        | Disable cache env |
| `GET /api/orders` list          | Large tenant order history                       | `0038`, `0103`, `0141` list indexes                                                               | Faster filters/sorts                                  | Low                        | Drop indexes      |
| `GET /api/orders/:id/tracking`  | Polls every 15–30s from multiple UIs             | Conditional polling + `skipPollingIfUnfocused: true` on RTK Query                                 | Reduced load when tab unfocused                       | None (already implemented) | Remove skip flags |
| Supplier order tracking panel   | 15s poll when delivery active                    | Same as above                                                                                     | Moderate reduction vs always-on                       | None                       | Increase interval |
| Restaurant tracking panel       | 30s poll when active                             | Same                                                                                              | Lower than supplier (privacy-safe payload is smaller) | None                       | Increase interval |
| `GET /api/fulfillment/dispatch` | Heavy join for dispatch board                    | Batch queries in service layer; indexes on `driver_assignment`, `delivery_route` (`0127`, `0138`) | Board load &lt; 500ms local on seeded data            | Medium if indexes dropped  | Revert migration  |
| `GET /api/fulfillment/routes`   | Route list + detail N+1 risk                     | Route tests cover SQL shape; `0141` query-driven indexes                                          | Stable route tab                                      | Low                        | —                 |
| Driver deliveries page          | GPS `watchPosition` + throttle via `VITE_GPS_*`  | Only active assignment statuses send pings                                                        | Battery/network savings on mobile web                 | None                       | Widen throttle    |
| Admin tenant list               | Large cross-tenant query                         | `admin-dashboard` uses batched billing resolution (`resolveActiveBillingSubscriptionsBatch`)      | Faster tenant tab                                     | Low                        | —                 |
| Notifications badge             | Socket primary; 60s poll fallback                | `useNotificationBadge`                                                                            | Avoids storm when socket up                           | None                       | —                 |
| Frontend bundles                | Many lazy routes in `App.tsx`                    | `LazyPage` + route-based code splitting                                                           | Smaller first paint                                   | None                       | —                 |
| Keycloak / Railway memory       | Cold start pressure                              | Documented in deploy configs; `0140_railway_cold_path_indexes`                                    | Faster cold queries                                   | Ops                        | —                 |

## Polling matrix (frontend)

| Component                      | Interval | Stops when                   |
| ------------------------------ | -------- | ---------------------------- |
| `RestaurantOrderTrackingPanel` | 30s      | Terminal / inactive delivery |
| `OrderDeliveryTrackingPanel`   | 15s      | Assignment not live          |
| `DeliveryTrackingDrawer`       | 15s      | Drawer closed or terminal    |
| `FulfillmentTrackingTab`       | 30s      | Tab unfocused (skip)         |
| `OrdersPage`                   | 60s      | Unfocused                    |

**Recommendation (deferred):** Align supplier tracking to 20–30s unless ops requires 15s; measure on Railway dev before mobile ships.

## Database hot indexes (verified in migrations)

- `customer_order` — placed_at, restaurant/supplier filters (`0103`, `0141`, `0142`)
- `order_item` — supplier order aggregates
- `driver_assignment` — active delivery lookups (`0137`, `0138`)
- `delivery_route` / `route_stop` — planned route activation (`0127`)
- `driver_latest_location` / `driver_location_ping` — GPS reads (`0137`)
- `notifications` — user inbox (`0138`)
- `tenant_subscription` / billing — admin dashboard batch (`0132`)

## Not measured in this pass

- Lighthouse scores on Railway dev URL (no live profiling session against deployed dev)
- Exact p95 latencies per endpoint on Railway

Use `pnpm memory:measure` and Railway logs for ongoing monitoring before mobile launch.
