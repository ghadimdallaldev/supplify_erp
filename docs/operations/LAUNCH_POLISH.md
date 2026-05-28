# Launch Polish – Manual Test Notes

Quick checks to verify the “Launch Polish Micro” tweaks (Recommended badge, nav Upgrade CTA, plan value copy).

---

## 1) Recommended badge

**Where it appears**

- **SubscriptionInfo** (Settings / Subscription): Next to current plan name. Shows “Recommended” when current plan matches recommendation API; if `reasonCode === 'CURRENT_BEST'` the badge is subtle (amber).
- **UpgradeModal** comparison table: “Recommended” badge next to the Recommended column header when that column’s plan matches the recommendation.

**How to verify**

1. As **Restaurant** on Free: Open Settings → Subscription. You should see plan name (e.g. “Free”) and, if recommendation is Gold, no badge on “Free” (badge would be on the recommended plan when shown elsewhere). On the same page, the “Recommended: Gold” CTA section reflects the API.
2. As **Restaurant** on Gold: If API returns `CURRENT_BEST`, the current plan in SubscriptionInfo should show a subtle “Recommended” badge.
3. Open **UpgradeModal** (e.g. from a near-limit banner or nav Upgrade): In the comparison table, the column that is the recommended plan should show the “Recommended” badge in the header; subtitles (e.g. “Most Popular”) appear under plan names.
4. As **Supplier**: Repeat with a Supplier account (Free and a paid plan) to confirm badge and subtitles for both tenant types.

**Data source**

- `/api/subscriptions/recommendation` (existing query/cache). No extra recommendation calls when using the badge.

---

## 2) Top-nav Upgrade CTA

**Visibility**

- Shown only when at least one is true:
  - Current plan is **Free**, or
  - Any usage **≥ 80%** (near-limit), or
  - **Blocked events in last 7 days** (from `monetization.blockedCountLast7d`).
- Hidden for admins (no tenant entitlements in header).

**Behavior**

- Click opens **UpgradeModal**.
- Context passed:
  - If any usage ≥ 80%: modal opened with limit context for the first near-limit key (`blocked=limit:<key>`).
  - Else if Free: modal opened with `feature:upgrade_prompt` context.
  - Else (blocked in last 7d): modal opened with upgrade-prompt context.
- Conversion event: **OPEN_UPGRADE** with `metadata: { source: "nav_upgrade_cta", trigger: "free" | "near_limit" | "blocked" }`.

**UI**

- Label: **“Upgrade”**.
- Optional dot indicator when `near_limit` or `blocked` (urgency).

**How to verify**

1. **Free plan**: Log in as Restaurant/Supplier on Free. Header should show “Upgrade”. Click → modal opens. Check network or backend that OPEN_UPGRADE is sent with `source: "nav_upgrade_cta"` and `trigger: "free"`.
2. **Near-limit**: Use an account with at least one limit ≥ 80%. Header shows “Upgrade” (and dot if implemented). Click → modal opens with that limit context; event has `trigger: "near_limit"`.
3. **Blocked in last 7d**: Trigger a block (e.g. hit a limit or feature block), then go to app. Header shows “Upgrade”. Click → modal opens; event has `trigger: "blocked"`.
4. **Paid, under limits, no recent blocks**: Header should **not** show “Upgrade”.
5. **Admin**: Log in as Admin (no impersonation). Header should not show “Upgrade” (skip entitlements). When impersonating, tenant entitlements/banners apply — see [admin-impersonation.md](../features/admin-impersonation.md).

---

## 3) Plan value copy (subtitles)

**Mapping** (single source: `apps/web/src/lib/planComparison.ts` → `PLAN_SUBTITLES` / `getPlanSubtitle()`)

- Free: “Setup & Testing”
- Silver: “Starter”
- Gold: “Most Popular”
- Platinum: “Unlimited Ops”
- Enterprise: “Custom Contract” (e.g. admin only)

**Where used**

- **UpgradeModal** comparison table: Subtitle under each plan column header (Current, Recommended, Top).
- **SubscriptionInfo**: Subtitle under current plan name when present.
- **Admin Plans** (if present): Subtitle on plan cards (e.g. “· Most Popular”).

**How to verify**

1. Open UpgradeModal: Each of the three plan columns should show plan name and, below, the correct subtitle (e.g. Gold → “Most Popular”).
2. Settings → Subscription: Under current plan name, subtitle appears if defined (e.g. “Setup & Testing” for Free).
3. Admin → Plans: Plan cards show “· &lt;subtitle&gt;” where applicable (e.g. Gold “· Most Popular”).

---

## Regression

- No new recommendation API calls: badge and nav use existing `useGetRecommendationQuery` / `useGetEntitlementsQuery` (cached).
- Layout and navigation unchanged except for the single Upgrade button and badge/subtitle placement.
- Plan names and codes are unchanged; only display subtitles were added.

---

_Last updated: Launch Polish Micro (Recommended badge, nav Upgrade, plan subtitles)._
