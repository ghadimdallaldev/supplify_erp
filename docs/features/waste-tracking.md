# Waste & spoilage tracking (restaurants)

Plan feature key: `waste_tracking`

| Tier       | Value                                    | Capability                                              |
| ---------- | ---------------------------------------- | ------------------------------------------------------- |
| Free Trial | off or sandbox                           | Per `0094` / trial seeds                                |
| **Silver** | `manual_entry`                           | Log waste & spoilage; basic tab; no analytics dashboard |
| **Gold+**  | `analytics_dashboard` (or richer string) | Waste analytics + reports integration                   |

Requires `inventory_management` for stock routes.

## Product surface

Integrated into **Inventory** (`/app/restaurant-inventory`), not a separate nav item:

| UI                                | Description                                                          |
| --------------------------------- | -------------------------------------------------------------------- |
| **Waste & spoilage** tab          | Summary cost, incidents, 7-day trend, top wasted products            |
| **Log waste** (tab or row action) | Record prep wastage or spoilage with category and optional unit cost |
| **Movement history**              | Rows show **Wastage** / **Spoilage** types                           |

## API

| Method | Path                                        | Notes                                                                                     |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST` | `/api/restaurant-inventory/adjust`          | `adjustmentType`: `WASTAGE` \| `SPOILAGE`; optional `wasteCategory`, `unitCost`, `reason` |
| `GET`  | `/api/restaurant-inventory/waste-analytics` | `?period=7\|14\|30\|90` — summary, per-product breakdown, trend                           |

Requires `inventory_management` for inventory routes and `waste_tracking` for waste types and analytics.

## Waste categories

`OVER_PRODUCTION`, `SPOILAGE`, `BREAKAGE`, `EXPIRED`, `OVERPORTIONING`, `OTHER`

## Reports

`/api/reports/restaurant/waste` (also requires `waste_tracking` + `reports`) — time-series by category for the Reports module.

## Verify

1. Restaurant on a plan with `waste_tracking` → Inventory → **Waste & spoilage** tab visible.
2. Log waste on a stocked SKU → on-hand quantity decreases; analytics update.
3. Movement history shows Wastage/Spoilage label.
