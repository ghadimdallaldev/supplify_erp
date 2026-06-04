# Platinum catalog-only features

Platinum plan JSON includes feature **strings** that describe the top self-serve tier. Several are **catalog and marketing** until separate engineering ships tier-differentiated behavior.

**Enforcement today:** `requireFeature(key)` treats any non-empty string (except `false` / `disabled`) as **enabled** — the same binary access as Gold for most keys. Route handlers do **not** compare tier strings (e.g. `basic_kpis` vs `advanced_forecasting_custom_reports`).

**Source of truth after migration:** `0120_platinum_tier_limits_features.sql`. Verify with `pnpm run log:tier-limits`.

## Catalog-only (not differentiated in code yet)

| Feature key            | Platinum value                        | What buyers expect                 | Current behavior                                                                      |
| ---------------------- | ------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| `quick_lists`          | `ai_smart_automation`                 | AI-driven list scheduling          | Same automation gate as Gold `full_schedule`                                          |
| `smart_reorder`        | `ai_forecast_seasonality`             | Forecasting beyond 90-day trends   | Same reorder route as Gold `full_90day_trends`                                        |
| `reports`              | `advanced_forecasting_custom_reports` | Custom / forecast reports          | Same `reports` route gate as Gold                                                     |
| `api_integrations`     | `full_api_webhooks`                   | Full API + outbound webhooks       | No tenant webhook/API product gate beyond plan boolean                                |
| `notifications`        | `email_whatsapp_webhook`              | Webhook notifications              | `resolveAllowedChannels` allows in-app, email, WhatsApp only — **no webhook channel** |
| `custom_branding`      | `white_label_domain`                  | Custom domain / white-label        | Branding UI enabled (boolean); no separate domain hosting product                     |
| `chat`                 | `real_time_media_read_receipts`       | Read receipts & rich media         | Chat not tier-string aware                                                            |
| `multi_branch`         | `central_purchasing`                  | Central purchasing across branches | Same multi-branch gate as Gold (`true`)                                               |
| `finance_invoices`     | `advanced_finance_dashboard`          | Advanced finance analytics         | Same finance route gate as Gold                                                       |
| `receiving_quality`    | `supplier_performance_reports`        | Supplier performance in receiving  | Same receiving gate as Gold                                                           |
| `inventory_management` | `lot_expiry_tracking`                 | Lot / expiry tracking              | Not gated separately from Gold                                                        |
| `fulfillment_tools`    | `routing_full_suite` (supplier)       | Full routing suite                 | Fulfillment alias; same family as Gold pick/pack                                      |

## Enforced differentiation vs Gold (today)

| Area                          | Gold                  | Platinum                                                      |
| ----------------------------- | --------------------- | ------------------------------------------------------------- |
| Operational limits            | Finite caps (`0119`)  | **Unlimited** (`-1`) on canonical meters                      |
| Storage                       | 10 GB (`10240` MB)    | **30 GB** (`30720` MB)                                        |
| `waste_tracking` (restaurant) | `analytics_dashboard` | **`cost_percentage_vs_sales`** (catalog; route still boolean) |
| Branding string               | `logo_colors`         | `white_label_domain` (UI caption only)                        |

## What Platinum buyers get immediately

- No daily order, user, SKU, supplier, chat, list, or deal/promotion **caps** (unlimited meters).
- **30 GB** storage vs **10 GB** on Gold.
- Same **feature gates** as Gold for most workflows until rows above are implemented.

## Enterprise

Custom contracts, **100 GB** storage in catalog, admin assignment — see [ENTERPRISE.md](./ENTERPRISE.md). Do not fold Enterprise-only needs into Platinum.
