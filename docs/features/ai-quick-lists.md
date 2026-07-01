# Smart quick lists (Platinum)

Platinum `quick_lists: ai_smart_automation` adds **forecast-based quantity adjustment** and **reorder-assistance suggestions** on top of Gold `full_schedule`. This is deterministic forecasting (same stack as [smart reorder](./ai-smart-reorder.md)), not a separate LLM product.

## Capabilities by tier

Resolved via `resolveQuickListCapabilities()` — not hard-coded plan names.

| `quick_lists` value           | Tier     | Scheduling                  | Smart quantities on auto-order | Suggest items |
| ----------------------------- | -------- | --------------------------- | ------------------------------ | ------------- |
| `false` / `basic_manual_only` | off      | —                           | —                              | —             |
| `automated_weekly`            | Silver   | Weekly                      | —                              | —             |
| `full_schedule` / `true`      | Gold     | Full schedule + auto-create | —                              | —             |
| `ai_smart_automation`         | Platinum | Full schedule + auto-create | ✓                              | ✓             |

## API

| Method | Path                                    | Notes                                                    |
| ------ | --------------------------------------- | -------------------------------------------------------- |
| POST   | `/api/quick-lists/:id/schedule`         | Body may include `useAiQuantities: true` (Platinum only) |
| POST   | `/api/quick-lists/:id/ai-suggest`       | Returns add/update proposals from reorder assistance     |
| POST   | `/api/quick-lists/:id/ai-suggest/apply` | Body `{ proposals: [...] }`                              |

Scheduled cron (`scheduled-orders.service`) applies smart quantities when `quick_list.use_ai_quantities = true`, writing an audit payload to `quick_list_execution.ai_adjustments`.

## 5-minute buyer test

1. Sign in as a **Platinum** restaurant with products on a quick list.
2. Open **Quick Lists** → schedule a list with **Smart quantities from usage forecast** enabled and auto-create on.
3. Click **Suggest items** on a list — confirm items are added/updated from reorder recommendations.
4. (Optional) Run scheduled execution or wait for cron — inspect `quick_list_execution.ai_adjustments` for before/after quantities.
5. Repeat on **Gold** — smart toggle and suggest button must be absent; `POST .../ai-suggest` returns 403.

## Honest positioning

UI copy uses **“Smart quantities from usage forecast”** rather than generic “AI magic.” Optional LLM copy is only available when `ai_platform` is enabled (reorder assist family).
