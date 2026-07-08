# API Performance Audit Results

**Generated:** 2026-07-08T17:34:05.453Z
**Base URL:** https://api-dev.supplifyerp.com
**Samples per endpoint:** 5 (after 3 warmup)

## Infrastructure

```json
{
  "status": "ok",
  "service": "supplify-api",
  "env": "dev",
  "ok": true,
  "timestamp": "2026-07-08T17:33:36.136Z",
  "storage": {
    "ok": true,
    "driver": "s3",
    "endpoint": "https://t3.storageapi.dev",
    "publicUrl": "https://t3.storageapi.dev",
    "bucket": "buffered-stand-ookrhuvq89",
    "buckets": ["buffered-stand-ookrhuvq89"]
  },
  "requestId": "b2b0b215",
  "memory": {
    "rssMb": 165.8,
    "heapUsedMb": 58.2,
    "heapTotalMb": 62,
    "externalMb": 5,
    "arrayBuffersMb": 5.3,
    "activeHandles": 26,
    "activeRequests": 0
  },
  "dbPool": {
    "total": 18,
    "idle": 18,
    "waiting": 0,
    "max": 20
  },
  "redis": {
    "connected": true
  }
}
```

## Results

| Endpoint                                        | Role       | avg   | p50   | p95   | max   | Budget | Status | Over |
| ----------------------------------------------- | ---------- | ----- | ----- | ----- | ----- | ------ | ------ | ---- |
| `/health`                                       | -          | 222ms | 148ms | 527ms | 527ms | 500ms  | OK     | YES  |
| `/ready`                                        | -          | 123ms | 115ms | 160ms | 160ms | 500ms  | OK     | no   |
| `/auth/me`                                      | restaurant | 145ms | 141ms | 159ms | 159ms | 800ms  | OK     | no   |
| `/api/orders?limit=20`                          | restaurant | 120ms | 120ms | 136ms | 136ms | 500ms  | OK     | no   |
| `/api/orders?limit=20&includeItems=false`       | restaurant | 116ms | 113ms | 125ms | 125ms | 500ms  | OK     | no   |
| `/api/products?limit=20`                        | supplier   | 138ms | 125ms | 176ms | 176ms | 500ms  | OK     | no   |
| `/api/products/categories`                      | supplier   | 139ms | 126ms | 207ms | 207ms | 500ms  | OK     | no   |
| `/api/inventory?limit=100`                      | supplier   | 118ms | 115ms | 149ms | 149ms | 500ms  | OK     | no   |
| `/api/orders?limit=20&includeItems=true`        | restaurant | 135ms | 123ms | 190ms | 190ms | 500ms  | OK     | no   |
| `/api/admin/dashboard`                          | restaurant | 186ms | 207ms | 249ms | 249ms | 500ms  | OK     | no   |
| `/api/billing/status`                           | restaurant | 125ms | 121ms | 142ms | 142ms | 500ms  | OK     | no   |
| `/api/promotions/active`                        | restaurant | 118ms | 116ms | 134ms | 134ms | 500ms  | OK     | no   |
| `/api/quote-requests`                           | restaurant | 119ms | 116ms | 136ms | 136ms | 500ms  | OK     | no   |
| `/api/supplier/deliveries/board`                | supplier   | 138ms | 132ms | 162ms | 162ms | 1500ms | OK     | no   |
| `/api/supplier/reorder-intelligence`            | supplier   | 118ms | 116ms | 128ms | 128ms | 500ms  | OK     | no   |
| `/api/restaurant-inventory?limit=100&offset=0`  | restaurant | 123ms | 124ms | 131ms | 131ms | 1500ms | OK     | no   |
| `/api/invoices?limit=50`                        | supplier   | 191ms | 134ms | 452ms | 452ms | 500ms  | OK     | no   |
| `/api/fulfillment/dispatch`                     | supplier   | 120ms | 121ms | 124ms | 124ms | 1500ms | OK     | no   |
| `/api/fulfillment/board`                        | supplier   | 127ms | 119ms | 144ms | 144ms | 1500ms | OK     | no   |
| `/api/notifications/unread-count`               | restaurant | 122ms | 123ms | 133ms | 133ms | 500ms  | OK     | no   |
| `/api/subscriptions/entitlements`               | restaurant | 128ms | 128ms | 138ms | 138ms | 500ms  | OK     | no   |
| `/api/admin-dashboard/overview`                 | admin      | 118ms | 118ms | 124ms | 124ms | 1500ms | OK     | no   |
| `/api/supplier/command-center`                  | supplier   | 116ms | 112ms | 126ms | 126ms | 1500ms | OK     | no   |
| `/api/reports/restaurant/spend-by-supplier`     | restaurant | 117ms | 115ms | 126ms | 126ms | 1500ms | OK     | no   |
| `/api/restaurant-inventory/reorder-suggestions` | restaurant | 130ms | 118ms | 176ms | 176ms | 500ms  | OK     | no   |

## Over budget (p95)

- **health** p95=527ms (budget 500ms)
