# Monetization UX (Phase B)

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [four-plan-pricing-model.md](./four-plan-pricing-model.md) and [plans-and-limits.md](./plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

Soft walls, upgrade nudges, and standardized API error payloads for plan/limit blocks.

## B1) Standardized API error payloads

When the API blocks a request due to plan or limits, it returns a consistent shape so the frontend can show upgrade modals and links.

### FEATURE_NOT_AVAILABLE (403)

- **details:** `featureKey`, `currentPlan`, `requiredPlan` (or null), `recommendedPlans` (string[]), `upgradeUrl` (or front-route).

### LIMIT_EXCEEDED (403)

- **details:** `limitKey`, `limitValue`, `currentUsage`, `currentPlan`, `recommendedPlans`, `upgradeUrl`; optionally `requested` for bulk operations.

### ACCOUNT_LOCKED (402) — billing / Free Trial expiry

- **Middleware:** `billingAccessMiddleware` when `billing.access.isLocked`.
- **Free Trial expired:** `lock_reason === 'free_sandbox_expired'` — message: _Your Free Trial has expired. Upgrade your plan to continue using Supplify._; **GET** tenant routes still allowed (read-only).
- **Pending activation / payment overdue:** Different copy and upgrade URLs (see `buildAccountLockedError` in `billing-service.js`).
- **Web:** `BillingOverdueBanner` (amber trial banner vs red overdue).

Backend helpers: `buildLimitExceededPayload`, `buildFeatureNotAvailablePayload` in `lib/subscription.js`. Routes (orders, chat, products, quick-lists, and middleware `requireWithinLimit` / `requireFeature`) use these so all 403s for plan/limit include the above fields.

## B2) Frontend soft-wall components

- **UpgradeModal** (`components/UpgradeModal.tsx`): Shown when the API returns `LIMIT_EXCEEDED` or `FEATURE_NOT_AVAILABLE`. Displays current plan, what’s blocked (limit or feature), recommended plans, and CTA “View plans & upgrade” (navigates to `upgradeUrl`, default `/app/settings`).
- **LimitExceededBanner** (`components/LimitExceededBanner.tsx`): Inline banner for limit-reached messaging; can be used on specific pages.
- **FeatureLockedCard** (`components/FeatureLockedCard.tsx`): Card with lock icon and “View plans” for feature-gated content.

The global **UpgradeModal** is opened via Redux: when `baseQueryWithUnwrap` in `services/api.ts` sees `error.name === 'LIMIT_EXCEEDED' | 'FEATURE_NOT_AVAILABLE'`, it dispatches `showMonetizationBlock`; `Layout` renders `<UpgradeModal />`, which reads from `state.monetization`.

**80% usage warning:** In `Layout`, when `useGetEntitlementsQuery` returns entitlements, any meter with usage ≥ 80% and &lt; 100% is computed; up to three are shown in a small amber “Usage near limit” banner with a “View usage” link to settings.

## B3) Upgrade nudges and Usage card

- **Blocked-event tracking:** When a limit or feature block occurs, the frontend stores a timestamp in `localStorage` under `supplify_monetization_blocked`. The `monetization` slice keeps a rolling count of blocks in the last 7 days.
- **Proactive nudge:** If `blockedCountLast7d >= 3`, `Layout` shows a blue banner: “You’ve hit plan limits several times recently. Upgrade for higher limits and more features” with “View plans” to settings.
- **Usage card in Settings:** In **SubscriptionInfo** (Settings / subscription tab), a “Near limit (top 3)” section lists the top three meters by usage percentage (≥ 50%, &lt; 100%) so users see the most at-risk limits first.

## Files touched (Phase B)

**API:** `lib/subscription.js` (buildLimitExceededPayload, buildFeatureNotAvailablePayload, getRecommendedPlanNames; requireWithinLimit/requireFeature use them); `routes/orders.routes.js`, `routes/chat.routes.js`, `routes/products.routes.js`, `routes/quick-lists.routes.js` (standardized error payloads).

**Web:** `store/index.ts` (monetization reducer); `services/api.ts` (dispatch showMonetizationBlock on limit/feature error); `features/monetization/monetizationSlice.ts`; `components/UpgradeModal.tsx`, `components/LimitExceededBanner.tsx`, `components/FeatureLockedCard.tsx`; `components/Layout.tsx` (UpgradeModal, 80% banner, proactive nudge, refreshBlockedCount); `components/SubscriptionInfo.tsx` (top 3 near-limit usage card).

## Launch Polish (micro)

- **Recommended badge:** `RecommendedBadge` component shows “Recommended” on the plan that matches GET /api/subscriptions/recommendation. Used in SubscriptionInfo (current plan) and UpgradeModal (comparison table header). Subtle style when reasonCode is CURRENT_BEST.
- **Nav Upgrade CTA:** Single “Upgrade” button in Header; visible when plan is Free, or any usage ≥ 80%, or blocked events in last 7 days. Click opens UpgradeModal and records OPEN_UPGRADE with `metadata: { source: "nav_upgrade_cta", trigger: "free"|"near_limit"|"blocked" }`. Dot indicator when near-limit or blocked.
- **Plan value copy:** `PLAN_SUBTITLES` in `lib/planComparison.ts` (Free: “Time-limited trial”, Silver: “Starter”, …). Display name for code `free`: **Free Trial** via `formatPlanDisplayName()`. Shown in UpgradeModal, SubscriptionInfo, sidebar.
- **Free Trial expiry:** See [free-trial-expiry.md](../features/free-trial-expiry.md); manual QA **BIL-FT-\*** in [regression-checklist.md](../qa/regression-checklist.md).
- **Manual test notes:** [LAUNCH_POLISH.md](../operations/LAUNCH_POLISH.md).
