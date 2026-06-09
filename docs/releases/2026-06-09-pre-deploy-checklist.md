# Pre-deploy checklist — 2026-06-09

Use this document before pushing the current branch to **dev → preprod → prod** on Railway. It covers three coordinated changes shipped together:

1. **Plan / tier catalog audit** (migrations + backend gates + admin plans UI)
2. **Deals & Boosts UI wording cleanup** (presentation only)
3. **Legal pack `2026-06-09` + login re-acceptance gate**

---

## 1. Summary

| Area                   | Business logic changed?       | DB migration?          | User impact                                         |
| ---------------------- | ----------------------------- | ---------------------- | --------------------------------------------------- |
| Plan tier audit        | Yes — gates, catalog sync     | **Yes** `0144`, `0145` | Plan limits/features match spec; Free chats = **3** |
| Deals/Boosts wording   | **No** — labels/copy only     | No                     | Clearer “Deals” vs “Boosts” vs coupons              |
| Legal pack + re-accept | **No** — acceptance flow only | No                     | Existing users see `/legal/reaccept` once           |

**Do not skip migrations on any environment.** API runs migrations on startup when `RUN_MIGRATIONS_ON_START=true`.

---

## 2. Migrations to apply

| Migration                                          | Purpose                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `0144_supplier_finance_invoices_plan_features.sql` | Restore `finance_invoices` on supplier Silver/Gold/Platinum                       |
| `0145_plan_catalog_audit_sync.sql`                 | Free=Gold features sync; Gold/Platinum branch limits; **Free `chats_per_day: 3`** |

### Verify after deploy (each env)

```bash
pnpm run log:tier-limits
pnpm verify:tier-matrix   # if available in repo scripts
```

Confirm in DB or logs:

- Free restaurant + supplier: `chats_per_day` = **3** (not 10)
- Gold supplier/restaurant: `branches` = **3**
- Platinum: `branches` = **-1** (unlimited)

Full audit report: [../audits/PLAN_TIER_FUNCTIONALITY_AUDIT.md](../audits/PLAN_TIER_FUNCTIONALITY_AUDIT.md)

---

## 3. Deals & Boosts UI wording (no logic change)

**User-facing terminology** (internal keys unchanged):

| Internal                | UI label                             |
| ----------------------- | ------------------------------------ |
| `promotions` (supplier) | **Deals**                            |
| `promotions` limit      | **Active deals**                     |
| `deal_promotions`       | **Boosts** / **Sponsored placement** |
| `promotion_usages`      | **Deal redemptions**                 |
| `coupon_code`           | **Coupon code**                      |

- Supplier nav: **Deals** → route stays `/app/promotions`
- Restaurant: **Deals** → `/app/deals`
- Admin tab: **Deals & Boosts**

Full detail: [../ui/DEALS_BOOSTS_WORDING_CLEANUP.md](../ui/DEALS_BOOSTS_WORDING_CLEANUP.md)

Feature reference (API/DB unchanged): [../features/deals-and-promotions.md](../features/deals-and-promotions.md)

---

## 4. Legal pack `2026-06-09`

### Pack version (must match in both places)

| File                                  | Constant                            |
| ------------------------------------- | ----------------------------------- |
| `apps/web/src/lib/legalDocuments.ts`  | `LEGAL_PACK_VERSION = '2026-06-09'` |
| `apps/api/src/lib/legal-documents.js` | `LEGAL_PACK_VERSION = '2026-06-09'` |

If these diverge, registration and re-acceptance validation will fail.

### Static documents updated

- `TERMS_AND_CONDITIONS.md` — Deal / Boost / Coupon code definitions; §13 **Deals and Boosts**
- `DEALS_BOOST_TERMS.md` — Coupon §3; deals vs boosts scope
- `ACCEPTABLE_USE_POLICY.md`, `SUBSCRIPTION_ADDON_TERMS.md`, `SUPPLIER_AGREEMENT.md`, `PRIVACY_POLICY.md`
- `LEGAL_REVIEW_NOTES.md` (internal counsel notes)

Index: [../../apps/web/static/legal/README.md](../../apps/web/static/legal/README.md)

### Login re-acceptance gate

Existing users whose stored `legal_acceptance.document_version` ≠ `2026-06-09` are redirected to **`/legal/reaccept`** before using `/app/*` or `/staff/dashboard`.

| Endpoint                      | Purpose                                                             |
| ----------------------------- | ------------------------------------------------------------------- |
| `GET /auth/me`                | Returns `legalStatus` (`needsReacceptance`, `requiredDocuments`, …) |
| `POST /auth/legal-acceptance` | Records `login_refresh` acceptances                                 |

Full flow: [../ui/LEGAL_PACK_REACCEPTANCE.md](../ui/LEGAL_PACK_REACCEPTANCE.md)

**Ops note:** Expect a one-time spike in support questions (“Updated legal agreements”) after prod deploy. Users with no prior `legal_acceptance` rows (legacy) will also be prompted.

---

## 5. Deploy order (all environments)

Apply the same sequence on **dev**, then **preprod**, then **prod**:

1. **Merge / push** branch to target git branch (`dev` → `preprod` → `prod`).
2. **Railway redeploy** API + Web (migrations run on API start).
3. **Verify migrations** in API logs: `0144`, `0145` applied without error.
4. **Health:** `GET /health`, `GET /ready` (`redis.connected` if Redis wired).
5. **Smoke login** as admin, supplier, restaurant (see §6).
6. **Legal re-accept** smoke: log in as a user on old pack → should land on `/legal/reaccept` → accept → reach app.
7. **Plan catalog:** Admin → Plans → edit limit → save → refresh (persisted).
8. **Deals UI:** Supplier `/app/promotions` shows “Deals”; restaurant `/app/deals` unchanged behavior.

Railway reference: [../operations/railway-environments.md](../operations/railway-environments.md)

---

## 6. Smoke tests (minimum per env)

### Plan / billing

```bash
cd apps/api && npm run test:billing
cd apps/web && pnpm exec vitest run src/lib/planLimits.test.ts src/lib/planComparison.test.ts src/lib/planFeatureGates.test.ts
```

### Deals wording

```bash
cd apps/web && pnpm exec vitest run src/lib/dealDisplayLabels.test.ts
```

### Legal

```bash
cd apps/api && npx vitest run legal-acceptance auth.routes
cd apps/web && pnpm exec vitest run src/lib/legalReacceptanceGate.test.ts src/lib/legalDocuments.test.ts
```

### Manual (5 min)

- [ ] Supplier sidebar: **Deals** (not “Promotions”)
- [ ] Create deal form: helper text for deal type + CTA + coupon
- [ ] Restaurant deal card: coupon toast + **Order with deal**
- [ ] Admin: **Deals & Boosts** tab
- [ ] Settings → subscription: limit **Active deals** (supplier), **Deal redemptions per day** (restaurant)
- [ ] `/legal/reaccept` for user on stale pack
- [ ] Free tier: **3 chats/day** (not 10) when hitting chat limit message

Extended QA: [../qa/regression-checklist.md](../qa/regression-checklist.md) — §6.14, §7.11, §Legal re-acceptance

---

## 7. What did NOT change

- Deals/discount checkout math, coupon validation, boost billing
- API field names (`promotionId`, `coupon_code`, RTK `useGetPromotionsQuery`, etc.)
- Route URLs (`/app/promotions`, `/app/deals`)
- Plan limit **keys** (`promotions`, `deal_redemptions_per_day`, `supplier_deals`)

---

## 8. Rollback notes

| Change                   | Rollback                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Migrations `0144`/`0145` | Restore DB backup taken **before** deploy; redeploy prior API image                                              |
| UI wording               | Redeploy prior Web image (no DB impact)                                                                          |
| Legal pack `2026-06-09`  | Revert `LEGAL_PACK_VERSION` in web + API **together**; redeploy both; users on new acceptances keep history rows |

Do not revert only one of web/API legal pack version.

---

## 9. Related documentation

| Doc                                                                                      | Topic                    |
| ---------------------------------------------------------------------------------------- | ------------------------ |
| [../audits/PLAN_TIER_FUNCTIONALITY_AUDIT.md](../audits/PLAN_TIER_FUNCTIONALITY_AUDIT.md) | Plan tier audit          |
| [../ui/DEALS_BOOSTS_WORDING_CLEANUP.md](../ui/DEALS_BOOSTS_WORDING_CLEANUP.md)           | Deals/Boosts UI copy     |
| [../ui/LEGAL_PACK_REACCEPTANCE.md](../ui/LEGAL_PACK_REACCEPTANCE.md)                     | Legal re-acceptance      |
| [../features/deals-and-promotions.md](../features/deals-and-promotions.md)               | Deals system (technical) |
| [../operations/railway-environments.md](../operations/railway-environments.md)           | Railway deploy           |

---

## 10. Sign-off

| Environment | Deployed | Migrations OK | Smoke OK | Tester | Date |
| ----------- | -------- | ------------- | -------- | ------ | ---- |
| dev         |          |               |          |        |      |
| preprod     |          |               |          |        |      |
| prod        |          |               |          |        |      |
