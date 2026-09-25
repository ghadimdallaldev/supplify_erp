# AI Assistant (Supplify Assistant)

Conversational, **read-only** chatbot for restaurant, supplier, driver, and platform-admin users. Separate from human B2B Chat (`/app/chat`) and from Smart Reorder’s `explain` / `ask` / `ai-recommend` endpoints.

## Current entitlement policy (2026-09-22)

- The released conversational assistant is read-only and available only to Restaurant Scale, Supplier Scale, and platform admins with `ADMIN_ACCESS`.
- Tenant access requires `ai_assistant`; it is not granted by `ai_platform`. The latter remains the LLM gate for Smart Reorder.
- Drivers are denied assistant endpoints and use the existing guided delivery screens and status actions instead.
- Android and iOS gate restaurant and supplier assistant screens on `ai_assistant`; driver navigation intentionally has no assistant entry.
- The tool table below describes permitted read-only data domains. Driver-only tools are not exposed while the driver conversational surface is disabled.

## Behaviour

Users ask natural-language questions (e.g. “how many tomato kilos do we still have?”). The API:

1. Gates on `AI_ENABLED` + provider credentials + tenant feature `ai_platform` (admins: env + `ADMIN_ACCESS` only).
2. Reserves **one** `ai_requests_per_day` unit per user turn (tool hops do not extra-meter).
3. Runs an OpenAI tool-calling loop (max 8 rounds) against allowlisted **read-only** tools.
4. Answers using tool JSON only — quantities, ETAs, and totals must not be invented.
5. Refuses mutations (place order, adjust stock, assign driver) and points users to the right screen.

**Have vs need**

| Question                   | Tool / source                                                      |
| -------------------------- | ------------------------------------------------------------------ |
| How much do we still have? | `get_inventory` → `restaurant_inventory.quantity` + `product.unit` |
| How much do we need?       | `get_reorder_need` → `getReorderAssistance` suggested buy qty      |
| Recipes                    | Costing / ingredients only — not stock need                        |

## API

Mounted at `/api/assistant` (send rate limiter).

| Method | Path                          | Notes                                                                                   |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/capabilities`               | `{ enabled, quotaRemaining, tools[] }`                                                  |
| GET    | `/conversations`              | Current user + tenant only                                                              |
| POST   | `/conversations`              | Optional `{ title }`                                                                    |
| GET    | `/conversations/:id/messages` | User/assistant messages                                                                 |
| POST   | `/messages`                   | `{ conversationId?, message }` → `{ conversationId, reply, sources[], usedLlm, quota }` |

Middleware: `requireAuth` → `resolveTenantContext` → `resolveAdminContext` (admins). Domain permissions are enforced **inside each tool**.

## Tools

| Tool                       | Who                          | Gates                                                              |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `get_inventory`            | Restaurant                   | `INVENTORY_VIEW`, `inventory_management`                           |
| `get_account_overview`     | Restaurant                   | `INVENTORY_VIEW` (order figures also need `ORDERS_VIEW`)           |
| `get_reorder_need`         | Restaurant                   | `INVENTORY_VIEW`, `smart_reorder`                                  |
| `get_orders` / `get_order` | Restaurant, supplier         | `ORDERS_VIEW`                                                      |
| `get_deliveries`           | Restaurant, supplier, driver | `ORDERS_VIEW` or `DRIVER_DELIVERIES_VIEW`                          |
| `get_invoices`             | Restaurant, supplier         | `INVOICES_VIEW`, `finance_invoices`                                |
| `get_recipes`              | Restaurant                   | `RECIPES_VIEW`, `recipe_costing` (costs need `RECIPES_VIEW_COSTS`) |
| `get_waste`                | Restaurant                   | `waste_tracking` + `reports`                                       |
| `get_reports`              | Restaurant, supplier         | `ORDERS_VIEW`, `reports`                                           |
| `get_fulfillment_board`    | Supplier                     | `FULFILLMENT_VIEW`, `fulfillment_tools`                            |
| `get_warehouse_stock`      | Supplier                     | `INVENTORY_VIEW`, `inventory_management`                           |
| `get_my_stops`             | Driver                       | `DRIVER_DELIVERIES_VIEW` + linked driver profile                   |
| `get_admin_overview`       | Admin (not impersonating)    | `ADMIN_ACCESS`                                                     |

### Broad questions (2026-09-25)

`get_inventory` takes **no required arguments**. Called bare it lists current stock lowest-first; `search` filters by name or SKU and `lowStockOnly` returns only items at or below threshold. `get_account_overview` returns a whole-account snapshot (tracked products, low/out-of-stock counts, 30-day order count, spend, open orders).

The system prompt instructs the model to call a listing tool and answer from the result rather than asking the user which product they meant, and to combine several tools into one answer for broad questions. Before this, `get_inventory` **required** a `search` term, so questions like "what is running low?" had no callable tool and the model fell back to asking for a product name.

## Reorder Ask box

The inventory / reorder-assistance Ask box routes to this assistant (`POST /api/assistant/messages`) whenever the tenant holds `ai_assistant`, and renders the prose answer. Tenants with reorder seasonality but **without** `ai_assistant` keep the legacy `POST /api/restaurant-inventory/reorder-assistance/ask` product matcher, which maps a phrase onto products in the current suggestion list for "add to ordering list" — it answers no questions by design and returns `clarifyingQuestion` when nothing matches.

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
