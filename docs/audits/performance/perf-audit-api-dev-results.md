# API Performance Audit Results

**Generated:** 2026-07-08T16:17:08.737Z
**Base URL:** https://api-dev.supplifyerp.com
**Samples per endpoint:** 10 (after 3 warmup)

## Infrastructure

```json
{
  "status": "ok",
  "service": "supplify-api",
  "env": "dev",
  "ok": true,
  "timestamp": "2026-07-08T16:16:13.066Z",
  "storage": {
    "ok": true,
    "driver": "s3",
    "endpoint": "https://t3.storageapi.dev",
    "publicUrl": "https://t3.storageapi.dev",
    "bucket": "buffered-stand-ookrhuvq89",
    "buckets": ["buffered-stand-ookrhuvq89"]
  },
  "requestId": "df1c2337",
  "memory": {
    "rssMb": 178.6,
    "heapUsedMb": 66,
    "heapTotalMb": 91,
    "externalMb": 5.7,
    "arrayBuffersMb": 6.1,
    "activeHandles": 26,
    "activeRequests": 0
  },
  "dbPool": {
    "total": 19,
    "idle": 19,
    "waiting": 0,
    "max": 20
  },
  "redis": {
    "connected": true
  }
}
```

## Results

| Endpoint                                        | Role       | avg   | p50   | p95    | max    | Budget | Status | Over |
| ----------------------------------------------- | ---------- | ----- | ----- | ------ | ------ | ------ | ------ | ---- |
| `/health`                                       | -          | 139ms | 135ms | 167ms  | 167ms  | 500ms  | OK     | no   |
| `/ready`                                        | -          | 116ms | 113ms | 132ms  | 132ms  | 500ms  | OK     | no   |
| `/auth/me`                                      | restaurant | 126ms | 121ms | 151ms  | 151ms  | 800ms  | OK     | no   |
| `/api/orders?limit=20`                          | restaurant | 183ms | 169ms | 250ms  | 250ms  | 500ms  | OK     | no   |
| `/api/orders?limit=20&includeItems=false`       | restaurant | 179ms | 158ms | 376ms  | 376ms  | 500ms  | OK     | no   |
| `/api/products?limit=20`                        | supplier   | 234ms | 193ms | 418ms  | 418ms  | 500ms  | OK     | no   |
| `/api/products/categories`                      | supplier   | 175ms | 154ms | 369ms  | 369ms  | 500ms  | OK     | no   |
| `/api/inventory?limit=100`                      | supplier   | 139ms | 142ms | 154ms  | 154ms  | 500ms  | OK     | no   |
| `/api/orders?limit=20&includeItems=true`        | restaurant | 156ms | 156ms | 174ms  | 174ms  | 500ms  | OK     | no   |
| `/api/admin/dashboard`                          | restaurant | 145ms | 124ms | 247ms  | 247ms  | 500ms  | OK     | no   |
| `/api/billing/status`                           | restaurant | 145ms | 137ms | 194ms  | 194ms  | 500ms  | OK     | no   |
| `/api/promotions/active`                        | restaurant | 166ms | 166ms | 183ms  | 183ms  | 500ms  | OK     | no   |
| `/api/quote-requests`                           | restaurant | 171ms | 145ms | 360ms  | 360ms  | 500ms  | OK     | no   |
| `/api/supplier/deliveries/board`                | supplier   | 181ms | 166ms | 231ms  | 231ms  | 1500ms | OK     | no   |
| `/api/supplier/reorder-intelligence`            | supplier   | 172ms | 158ms | 251ms  | 251ms  | 500ms  | OK     | no   |
| `/api/restaurant-inventory?limit=100&offset=0`  | restaurant | 182ms | 158ms | 341ms  | 341ms  | 1500ms | OK     | no   |
| `/api/invoices?limit=50`                        | supplier   | 255ms | 161ms | 714ms  | 714ms  | 500ms  | OK     | YES  |
| `/api/fulfillment/dispatch`                     | supplier   | 290ms | 178ms | 1143ms | 1143ms | 1500ms | OK     | no   |
| `/api/fulfillment/board`                        | supplier   | 148ms | 138ms | 171ms  | 171ms  | 1500ms | OK     | no   |
| `/api/notifications/unread-count`               | restaurant | 120ms | 108ms | 199ms  | 199ms  | 500ms  | OK     | no   |
| `/api/subscriptions/entitlements`               | restaurant | 130ms | 127ms | 143ms  | 143ms  | 500ms  | OK     | no   |
| `/api/admin-dashboard/overview`                 | admin      | 128ms | 128ms | 135ms  | 135ms  | 1500ms | OK     | no   |
| `/api/supplier/command-center`                  | supplier   | 141ms | 138ms | 163ms  | 163ms  | 1500ms | OK     | no   |
| `/api/reports/restaurant/spend-by-supplier`     | restaurant | 145ms | 139ms | 167ms  | 167ms  | 1500ms | OK     | no   |
| `/api/restaurant-inventory/reorder-suggestions` | restaurant | 155ms | 150ms | 174ms  | 174ms  | 500ms  | OK     | no   |

## Over budget (p95)

- **invoices-supplier** p95=714ms (budget 500ms)
