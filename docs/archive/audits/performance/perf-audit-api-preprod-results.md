# API Performance Audit Results

**Generated:** 2026-07-08T16:19:32.227Z
**Base URL:** https://api-preprod.supplifyerp.com
**Samples per endpoint:** 10 (after 3 warmup)

## Infrastructure

```json
{
  "status": "ok",
  "service": "supplify-api",
  "env": "preprod"
}
```

## Results

| Endpoint                                        | Role       | avg   | p50   | p95   | max   | Budget | Status | Over |
| ----------------------------------------------- | ---------- | ----- | ----- | ----- | ----- | ------ | ------ | ---- |
| `/health`                                       | -          | 294ms | 250ms | 561ms | 561ms | 500ms  | OK     | YES  |
| `/ready`                                        | -          | 265ms | 248ms | 376ms | 376ms | 500ms  | OK     | no   |
| `/auth/me`                                      | restaurant | 308ms | 273ms | 455ms | 455ms | 800ms  | FAIL   | no   |
| `/api/orders?limit=20`                          | restaurant | 282ms | 260ms | 390ms | 390ms | 500ms  | FAIL   | no   |
| `/api/orders?limit=20&includeItems=false`       | restaurant | 269ms | 261ms | 353ms | 353ms | 500ms  | FAIL   | no   |
| `/api/products?limit=20`                        | supplier   | 270ms | 258ms | 366ms | 366ms | 500ms  | FAIL   | no   |
| `/api/products/categories`                      | supplier   | 258ms | 255ms | 287ms | 287ms | 500ms  | FAIL   | no   |
| `/api/inventory?limit=100`                      | supplier   | 267ms | 263ms | 288ms | 288ms | 500ms  | FAIL   | no   |
| `/api/orders?limit=20&includeItems=true`        | restaurant | 289ms | 271ms | 397ms | 397ms | 500ms  | FAIL   | no   |
| `/api/admin/dashboard`                          | restaurant | 267ms | 262ms | 322ms | 322ms | 500ms  | FAIL   | no   |
| `/api/billing/status`                           | restaurant | 285ms | 257ms | 460ms | 460ms | 500ms  | FAIL   | no   |
| `/api/promotions/active`                        | restaurant | 309ms | 264ms | 534ms | 534ms | 500ms  | FAIL   | YES  |
| `/api/quote-requests`                           | restaurant | 307ms | 256ms | 641ms | 641ms | 500ms  | FAIL   | YES  |
| `/api/supplier/deliveries/board`                | supplier   | 280ms | 275ms | 340ms | 340ms | 1500ms | FAIL   | no   |
| `/api/supplier/reorder-intelligence`            | supplier   | 294ms | 274ms | 437ms | 437ms | 500ms  | FAIL   | no   |
| `/api/restaurant-inventory?limit=100&offset=0`  | restaurant | 280ms | 264ms | 333ms | 333ms | 1500ms | FAIL   | no   |
| `/api/invoices?limit=50`                        | supplier   | 285ms | 271ms | 369ms | 369ms | 500ms  | FAIL   | no   |
| `/api/fulfillment/dispatch`                     | supplier   | 277ms | 266ms | 314ms | 314ms | 1500ms | FAIL   | no   |
| `/api/fulfillment/board`                        | supplier   | 259ms | 256ms | 287ms | 287ms | 1500ms | FAIL   | no   |
| `/api/notifications/unread-count`               | restaurant | 270ms | 265ms | 296ms | 296ms | 500ms  | FAIL   | no   |
| `/api/subscriptions/entitlements`               | restaurant | 292ms | 271ms | 440ms | 440ms | 500ms  | FAIL   | no   |
| `/api/admin-dashboard/overview`                 | admin      | 260ms | 252ms | 293ms | 293ms | 1500ms | FAIL   | no   |
| `/api/supplier/command-center`                  | supplier   | 275ms | 272ms | 337ms | 337ms | 1500ms | FAIL   | no   |
| `/api/reports/restaurant/spend-by-supplier`     | restaurant | 263ms | 255ms | 349ms | 349ms | 1500ms | FAIL   | no   |
| `/api/restaurant-inventory/reorder-suggestions` | restaurant | 259ms | 260ms | 270ms | 270ms | 500ms  | FAIL   | no   |

## Over budget (p95)

- **health** p95=561ms (budget 500ms)
- **promotions-active** p95=534ms (budget 500ms)
- **quote-requests** p95=641ms (budget 500ms)
