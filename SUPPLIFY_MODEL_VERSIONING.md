# Supplify business model versioning (V1 / V2)

This experiment lets stakeholders compare two operating models without changing production defaults.

## Models

### V1 (default)

- Marketplace positioning: restaurants and suppliers both onboard as full workspaces.
- Existing subscription tiers, billing locks, RBAC, and onboarding unchanged.
- No supplier→restaurant buyer invites.

### V2 (supplier-first)

- **Suppliers** pay for the platform (existing supplier plans).
- **Restaurants** can join free as **buyer-only** accounts when a supplier invites them.
- Buyer-only restaurants can order from **linked** supplier stores only.
- **Full restaurant workspace** (multi-supplier ops, staff, reservations, analytics, etc.) requires upgrade + paid/trial plans as today.

## Environment variables

| Variable                      | Where                  | Values     | Default |
| ----------------------------- | ---------------------- | ---------- | ------- |
| `SUPPLIFY_MODEL_VERSION`      | API (`apps/api`)       | `v1`, `v2` | `v1`    |
| `VITE_SUPPLIFY_MODEL_VERSION` | Web build (`apps/web`) | `v1`, `v2` | `v1`    |

Invalid or missing values fall back to **v1**.

**Important:** For hosted deploys, set both API and web to the same value. Web reads the flag at **build time**.

### Local examples

```bash
# V1 (current behavior)
SUPPLIFY_MODEL_VERSION=v1
VITE_SUPPLIFY_MODEL_VERSION=v1

# V2 experiment
SUPPLIFY_MODEL_VERSION=v2
VITE_SUPPLIFY_MODEL_VERSION=v2
```

Restart the API after changing. Rebuild or restart the Vite dev server for web.

## What changes in V2

| Area                         | V2 behavior                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| Supplier invites             | `POST /api/supplier/restaurant-invitations` creates link invites (`type=sr`)             |
| Restaurant signup via invite | Creates `restaurant.workspace_mode = buyer_only`, role **Restaurant Buyer**              |
| Supplier list (restaurant)   | Buyer-only tenants only see linked suppliers                                             |
| Billing lock                 | Buyer-only: ordering/catalog/chat paths bypass 402 lock; premium ops still gated         |
| Entitlements API             | Adds `workspaceMode`, `supplifyModelVersion`, `isBuyerOnlyWorkspace`                     |
| Upgrade                      | `POST /api/restaurants/workspace/upgrade-workspace` → `full` + free plan activation path |

## What stays paid

- **Suppliers:** all existing subscription tiers (Silver/Gold/Platinum, etc.).
- **Restaurants (full workspace):** existing plans after upgrade from buyer-only.
- **Buyer-only:** internal `buyer_free` plan (no paid subscription required to order from invited suppliers).

## Admin comparison metrics

`GET /api/admin-dashboard/model-comparison-metrics` (admin only):

- Supplier invites sent / accepted / acceptance rate
- Buyer-only restaurant count
- Workspace upgrades
- Buyer → paid conversion rate (%)
- Supplier-store orders (buyer-only + active link)
- Paid restaurants after upgrade

Shown on Admin → Overview. Future analytics (time-series, cohorts, per-supplier funnels) are documented as TODOs in the admin panel.

## Testing both modes

1. Checkout branch `dev-v2`.
2. Run migrations: `pnpm db:migrate`.
3. Set env to `v1`, run `pnpm test:api` and `pnpm test:web` — confirm defaults.
4. Set env to `v2`, restart API, rebuild web.
5. As supplier: Supplier Settings → **Supplier Store** → create restaurant invite, share link.
6. Accept invite (`/invite?token=…&type=sr`) → buyer-only restaurant.
7. Verify: can order from inviting supplier; cannot access reservations/staff (403).
8. Upgrade workspace → full mode; normal plan activation applies.

## Business rationale

Compare whether a **supplier-paid, restaurant-free-buyer** model improves supplier acquisition and order volume versus the **dual-sided marketplace** (V1), without risking production behavior when `SUPPLIFY_MODEL_VERSION` is unset.

## Code references

- Config: [`apps/api/src/config/supplifyModel.js`](apps/api/src/config/supplifyModel.js), [`apps/web/src/config/supplifyModel.ts`](apps/web/src/config/supplifyModel.ts)
- Shared copy: [`config/supplify-business-model.json`](config/supplify-business-model.json)
- Migration: [`apps/api/db/migrations/0133_supplify_v2_buyer_workspace.sql`](apps/api/db/migrations/0133_supplify_v2_buyer_workspace.sql)

## Known limitations (POC)

- Link-only invites (no email delivery).
- Ordering link is in-app (`/app/suppliers/:id`), not a public slug storefront.
- One workspace per user unchanged.
- V2 restaurant self-signup still creates a **full** workspace unless using supplier invite.
