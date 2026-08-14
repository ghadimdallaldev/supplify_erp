# AI Assistant (Supplify Assistant)

Conversational, **read-only** chatbot for restaurant, supplier, driver, and platform-admin users. Separate from human B2B Chat (`/app/chat`) and from Smart Reorder’s `explain` / `ask` / `ai-recommend` endpoints.

## Behaviour

Users ask natural-language questions (e.g. “how many tomato kilos do we still have?”). The API:

1. Gates on `AI_ENABLED` + provider credentials + tenant feature `ai_platform` (admins: env + `ADMIN_ACCESS` only).
2. Reserves **one** `ai_requests_per_day` unit per user turn (tool hops do not extra-meter).
3. Runs an OpenAI tool-calling loop (max 4 rounds) against allowlisted **read-only** tools.
4. Answers using tool JSON only — quantities, ETAs, and totals must not be invented.
5. Refuses mutations (place order, adjust stock, assign driver) and points users to the right screen.

**Have vs need**

| Question | Tool / source |
| --- | --- |
| How much do we still have? | `get_inventory` → `restaurant_inventory.quantity` + `product.unit` |
| How much do we need? | `get_reorder_need` → `getReorderAssistance` suggested buy qty |
| Recipes | Costing / ingredients only — not stock need |

## API

Mounted at `/api/assistant` (send rate limiter).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/capabilities` | `{ enabled, quotaRemaining, tools[] }` |
| GET | `/conversations` | Current user + tenant only |
| POST | `/conversations` | Optional `{ title }` |
| GET | `/conversations/:id/messages` | User/assistant messages |
| POST | `/messages` | `{ conversationId?, message }` → `{ conversationId, reply, sources[], usedLlm, quota }` |

Middleware: `requireAuth` → `resolveTenantContext` → `resolveAdminContext` (admins). Domain permissions are enforced **inside each tool**.

## Tools

| Tool | Who | Gates |
| --- | --- | --- |
| `get_inventory` | Restaurant | `INVENTORY_VIEW`, `inventory_management` |
| `get_reorder_need` | Restaurant | `INVENTORY_VIEW`, `smart_reorder` |
| `get_orders` / `get_order` | Restaurant, supplier | `ORDERS_VIEW` |
| `get_deliveries` | Restaurant, supplier, driver | `ORDERS_VIEW` or `DRIVER_DELIVERIES_VIEW` |
| `get_invoices` | Restaurant, supplier | `INVOICES_VIEW`, `finance_invoices` |
| `get_recipes` | Restaurant | `RECIPES_VIEW`, `recipe_costing` (costs need `RECIPES_VIEW_COSTS`) |
| `get_waste` | Restaurant | `waste_tracking` + `reports` |
| `get_reports` | Restaurant, supplier | `ORDERS_VIEW`, `reports` |
| `get_fulfillment_board` | Supplier | `FULFILLMENT_VIEW`, `fulfillment_tools` |
| `get_warehouse_stock` | Supplier | `INVENTORY_VIEW`, `inventory_management` |
| `get_my_stops` | Driver | `DRIVER_DELIVERIES_VIEW` + linked driver profile |
| `get_admin_overview` | Admin (not impersonating) | `ADMIN_ACCESS` |

## Storage

Migration `0195_assistant_conversations.sql`:

- `assistant_conversation` — per user + tenant
- `assistant_message` — `user` \| `assistant` \| `tool`

## UI

- **Web:** floating FAB + Sheet in `Layout` (covers tenant shell and `AdminShell`). i18n namespace `assistant` (en/ar).
- **Mobile (Android + iOS):** `Assistant` screen gated by `ai_platform`, linked from More / driver Tools. Admin mobile remains deferred — admin tools are web-only.

## Honest labeling

UI shows **From live data** when tools ran. Quota exhaustion returns a clear message, never heuristic text labeled as AI.

## Env

Reuses existing AI vars: `AI_ENABLED`, `AI_PROVIDER`, `OPENAI_API_KEY`, `AI_MODEL`, `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_REQUESTS_PER_TENANT_PER_DAY`. See [../operations/environment-variables.md](../operations/environment-variables.md).

## Related

- [ai-smart-reorder.md](./ai-smart-reorder.md) — reorder LLM (not this chatbot)
- Feature flag `ai_platform` — “AI platform (assistant + reorder LLM)”
