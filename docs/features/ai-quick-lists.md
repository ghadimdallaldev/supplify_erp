# Smart Quick Lists

Smart Quick Lists add forecast-based quantity adjustment and reorder-assistance suggestions on top of scheduled quick lists. The quantity automation is deterministic forecasting from the same stack as [AI Smart Reorder](./ai-smart-reorder.md); it is not automatically a separate LLM product.

## Commercial Positioning

Use public tenant-specific plan names in customer-facing copy:

| Public plan             | Quick List behavior                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Restaurant Growth       | Manual and scheduled Quick Lists where enabled by plan features                             |
| Restaurant Scale        | Full schedule automation plus smart forecast quantities and item suggestions where enabled  |
| 30-day restaurant trial | Mirrors the selected paid target plan, subject to the trial AI pool for genuine model calls |

Internal feature values may still use legacy strings. Resolve capability through `resolveQuickListCapabilities()` and entitlements rather than display names.

## Capabilities By Feature Value

| `quick_lists` value           | Capability tier  | Scheduling                  | Smart quantities on auto-order | Suggest items               |
| ----------------------------- | ---------------- | --------------------------- | ------------------------------ | --------------------------- |
| `false` / `basic_manual_only` | off              | -                           | -                              | -                           |
| `automated_weekly`            | weekly_schedule  | Weekly                      | -                              | -                           |
| `full_schedule` / `true`      | full_schedule    | Full schedule + auto-create | -                              | -                           |
| `ai_smart_automation`         | smart_automation | Full schedule + auto-create | Yes, forecast based            | Yes, via reorder assistance |

## API

| Method | Path                                    | Notes                                                                       |
| ------ | --------------------------------------- | --------------------------------------------------------------------------- |
| POST   | `/api/quick-lists/:id/schedule`         | Body may include `useAiQuantities: true` when smart automation is available |
| POST   | `/api/quick-lists/:id/ai-suggest`       | Returns add/update proposals from reorder assistance                        |
| POST   | `/api/quick-lists/:id/ai-suggest/apply` | Body `{ proposals: [...] }`                                                 |

Scheduled cron (`scheduled-orders.service`) applies smart quantities when `quick_list.use_ai_quantities = true`, writing an audit payload to `quick_list_execution.ai_adjustments`. Locked or expired tenants must not create operational writes through scheduled execution.

## 5-minute Buyer Test

1. Sign in as a Restaurant Scale tenant with products on a quick list.
2. Open **Quick Lists** -> schedule a list with **Smart quantities from usage forecast** enabled and auto-create on.
3. Click **Suggest items** on a list and confirm items are added/updated from reorder recommendations.
4. Optionally run scheduled execution or wait for cron, then inspect `quick_list_execution.ai_adjustments` for before/after quantities.
5. Repeat on a plan without smart automation; the smart toggle and suggest button must be absent, and `POST .../ai-suggest` returns 403.

## Honest Labeling

UI copy uses **Smart quantities from usage forecast** rather than generic AI copy. Optional LLM copy is only available when `ai_platform` is enabled and the reorder-assist family makes a genuine provider/model call. Forecast and rule-based fallbacks must stay labeled as forecast/rule-based output.
