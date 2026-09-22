# Operational intelligence

Migration `0212_final_intelligence_subscription_matrix.sql` separates deterministic operational intelligence from the conversational assistant. It does not change checkout, payment provider, stored prices, fees, or billing calculations.

## Entitlement matrix

| Tenant     | Plan                  | Intelligence                                                                                   | Conversational assistant |
| ---------- | --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| Restaurant | Growth (`silver`)     | Basic, deterministic inventory, receiving, reorder, and supplier signals                       | No                       |
| Restaurant | Intelligence (`gold`) | Advanced deterministic forecasting, recipe-cost/price-impact, waste, and supplier intelligence | No                       |
| Restaurant | Scale (`platinum`)    | Scale-level and multi-branch insight where the underlying data model supports it               | Yes, read-only           |
| Supplier   | Growth (`gold`)       | Deterministic customer reorder, stock, receivables, and command-center signals                 | No                       |
| Supplier   | Scale (`platinum`)    | Advanced customer, inventory, fulfillment, and operational signals                             | Yes, read-only           |

## Enforcing the tier

`apps/api/src/lib/intelligence-tier.js` is the single place that turns the `intelligence` plan value into capability flags:

| Tier     | Plan value                               | `basicSignals` | `advancedSignals` | `crossLocation` |
| -------- | ---------------------------------------- | -------------- | ----------------- | --------------- |
| none     | absent, `false`, `'false'`, `'disabled'` | no             | no                | no              |
| basic    | `'basic'` (or a bare `true`)             | yes            | no                | no              |
| advanced | `'advanced'`                             | yes            | yes               | no              |
| scale    | `'scale'`                                | yes            | yes               | yes             |

- `resolveIntelligenceCapabilities(value)` — pure mapping, used wherever a plan value is already in hand.
- `getIntelligenceTierForTenant(tenantId, tenantType)` — resolves through `resolveAllFeaturesForTenant`, so admin tenant overrides and global kill-switches apply and a plan tier string can never resurrect a key an admin switched off.
- `requireIntelligenceTier(minTier)` — Express guard for deterministic intelligence endpoints.

The guard is **additive**: entitlement is not authorization. Routes keep their own `requirePermission`, tenant-context, and domain feature middleware. A bare `true` resolves to `basic`, never `scale`, so a plan row that enables the key without naming a tier cannot leak cross-location insight.

Existing routes continue to enforce their domain feature and RBAC checks; the tier is not a bypass for inventory, finance, recipe, fulfillment, or reporting permissions.

## Deterministic sources

Restaurant intelligence composes existing, reproducible calculations: `reorder_forecast`, stock/expiry signals, receiving history, recipe cost snapshots, `supplier_price_events`, recipe price impacts, and waste movements. Supplier intelligence composes the command center, reorder cadence and at-risk customers, warehouse/legacy stock display, receivables, delivery state, and fulfillment exceptions. Results must name their source and never fabricate a prediction, price, supplier, or quantity.

## Supplify AI Assistant

`ai_assistant` gates `/api/assistant`; `ai_platform` separately gates LLM-enhanced Smart Reorder endpoints. Both also require `AI_ENABLED`, configured provider credentials, quota, and the tool's own authorization. The assistant only receives allowlisted read-only tools, resolves every tool call in the active tenant context, and refuses mutations. Platform admins additionally require `ADMIN_ACCESS`; driver users have no assistant navigation.

## Scope boundaries

Restaurant Scale enables multi-branch insight, not centralized purchasing. `/api/restaurant-org/central-purchasing/*` deliberately returns `410 Gone` until a separately designed, authorized cross-branch workflow exists. Inventory remains restaurant-scoped; cross-branch stock transfers and central buying are not inferred from plan entitlement.

## Integrity guarantees

Receiving uses the ordered line's product, unit, and unit price rather than client-supplied values. Recipe receiving hooks capture the prior received cost before upsert so genuine price changes produce a price event. Failed recipe recalculations remain queued for retry. Inventory deductions reject insufficient stock instead of silently clamping quantity.
