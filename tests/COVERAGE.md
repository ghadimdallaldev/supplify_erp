# Test coverage map

| Feature / module                                     | Smoke                               | Critical E2E                                                 | Nightly                | API                  |
| ---------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------ | ---------------------- | -------------------- |
| **Auth**                                             | Login; unauth redirect              | Session; logout                                              | —                      | —                    |
| **Tenant registration**                              | Registration CTA / activate         | —                                                            | —                      | Register 401         |
| **Billing activation**                               | —                                   | —                                                            | —                      | Billing checkout 401 |
| **RBAC**                                             | —                                   | Tenant blocked from admin UI                                 | —                      | Admin 401            |
| **Orders**                                           | —                                   | Orders→cart; place-order; detail; fulfill/decline; delivered | —                      | —                    |
| **Receiving**                                        | —                                   | Receiving page                                               | —                      | receiving-delivered  |
| **Fulfillment**                                      | —                                   | Supplier fulfillment                                         | —                      | —                    |
| **Catalog**                                          | —                                   | Products open; add to cart                                   | —                      | —                    |
| **Subscription limits**                              | —                                   | Subscription context                                         | —                      | —                    |
| **Settings**                                         | —                                   | Restaurant + supplier settings                               | —                      | —                    |
| **Invoices / Deals / Quotes / Contract pricing**     | —                                   | Page-load E2E                                                | —                      | promotions gates     |
| **Inventory / Chat / Reservations / Staff / Driver** | —                                   | Page-load E2E                                                | —                      | —                    |
| **Admin platform**                                   | —                                   | Shell/nav; impersonation soft                                | —                      | admin impersonation  |
| **Consumer B2C**                                     | Storefront / menu / track / account | —                                                            | —                      | —                    |
| **Navigation**                                       | —                                   | Quick lists                                                  | Dashboard; Quick Lists | —                    |

## Test locations

- **Smoke**: `e2e/suites/smoke/` — `smoke.spec.ts`, `consumer-ordering.spec.ts`, `registration.spec.ts`
- **Critical E2E**: `e2e/suites/critical_e2e/` — auth, rbac, orders, place-order, order-detail, catalog, receiving, fulfillment, settings, invoices, deals-promotions, quotes, contract-pricing, inventory, chat, reservations, staff, driver, quick-lists, subscription-limits, admin-platform, admin-impersonation
- **Nightly**: `e2e/suites/nightly/nightly.spec.ts`
- **API**: `api/*.spec.ts`

## Hosted app-dev notes

```powershell
$env:PLAYWRIGHT_BASE_URL="https://app-dev.supplifyerp.com"
$env:PLAYWRIGHT_API_URL="https://api-dev.supplifyerp.com"
$env:E2E_KEYCLOAK_BASE_URL="https://keycloak-dev.supplifyerp.com"
$env:E2E_SECRET="e2e-secret-local"
$env:E2E_RESTAURANT_ORG_ID="84ab6e4c-af0a-49dd-b75f-55c2ee4bd7c5"
$env:E2E_SUPPLIER_ORG_ID="0ea8d7f9-bfdf-4f75-9acf-3b1d74623329"
pnpm e2e:playwright
```

See also [docs/qa/app-dev-e2e-report-2026-07-28.md](../docs/qa/app-dev-e2e-report-2026-07-28.md).
