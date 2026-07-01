# Platinum catalog-only features

Platinum plan JSON includes feature **strings** that describe the top self-serve tier. Several remain **catalog/marketing** until engineering ships tier-differentiated behavior.

**Source of truth:** `0120_platinum_tier_limits_features.sql`. Verify with `pnpm run log:tier-limits`.

## Recently enforced (see feature docs)

| Feature key       | Platinum value            | Enforcement                                                                                                                      |
| ----------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `quick_lists`     | `ai_smart_automation`     | **Enforced** — `resolveQuickListCapabilities()`; smart quantities + suggest ([ai-quick-lists.md](../features/ai-quick-lists.md)) |
| `notifications`   | `email_whatsapp_webhook`  | **Enforced** — outbound notification webhooks (migration `0182`, Settings UI)                                                    |
| `custom_branding` | `white_label_domain`      | **Enforced** — `resolveBrandingCapabilities()` + verified custom hostname ([custom-domains.md](../operations/custom-domains.md)) |
| `smart_reorder`   | `ai_forecast_seasonality` | **Enforced** — [ai-smart-reorder.md](../features/ai-smart-reorder.md)                                                            |

## Still catalog-only (not differentiated in code yet)

| Feature key            | Platinum value                        | Notes                                                                              |
| ---------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| `reports`              | `advanced_forecasting_custom_reports` | Same `reports` route gate as Gold                                                  |
| `api_integrations`     | `full_api_webhooks`                   | No read API + order/invoice webhook platform (distinct from notification webhooks) |
| `chat`                 | `real_time_media_read_receipts`       | Chat not tier-string aware                                                         |
| `multi_branch`         | `central_purchasing`                  | Same multi-branch gate as Gold                                                     |
| `finance_invoices`     | `advanced_finance_dashboard`          | Same finance route gate as Gold                                                    |
| `receiving_quality`    | `supplier_performance_reports`        | Same receiving gate as Gold                                                        |
| `inventory_management` | `lot_expiry_tracking`                 | Not gated separately from Gold                                                     |
| `fulfillment_tools`    | `routing_full_suite` (supplier)       | Fulfillment alias; same family as Gold                                             |

## Enforced differentiation vs Gold (operational)

| Area               | Gold                 | Platinum                                           |
| ------------------ | -------------------- | -------------------------------------------------- |
| Operational limits | Finite caps (`0119`) | **Unlimited** (`-1`) on canonical meters           |
| Storage            | 10 GB                | **30 GB**                                          |
| Quick lists        | `full_schedule`      | `ai_smart_automation` (smart quantities + suggest) |
| Notifications      | email + WhatsApp     | + outbound webhook channel                         |
| Branding           | `logo_colors`        | + custom catalog domain                            |

## Enterprise

Custom contracts, **100 GB** storage in catalog, admin assignment — see [ENTERPRISE.md](./ENTERPRISE.md).
