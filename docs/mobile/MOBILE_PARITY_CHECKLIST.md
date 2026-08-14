# Mobile Parity Checklist

Use on every web/API PR that touches orders, auth, fulfillment, tracking, or RBAC.

- [ ] Did API response types change? → Update `supplify-mobile/src/types`
- [ ] Did web route behavior change? → Check mobile screen equivalent
- [ ] Did RBAC / plan gating change? → Update mobile guards/navigation
- [ ] Did order lifecycle change? → Update restaurant/supplier/driver flows
- [ ] Did fulfillment / GPS / ETA / maps change? → Update mobile tracking
- [ ] Does mobile need a screen update?
- [ ] Were mobile tests / typecheck run when mobile-related?
- [ ] Was `MOBILE_FEATURE_PARITY.md` updated if something is deferred?
- [ ] Supplier bulk image import changed? → Web-only; document in parity file (see 2026-06-15 entry).

Mobile repos: `C:/myProjects/supplify-mobile` (Android) and `C:/myProjects/supplify-mobile-ios` (iOS). No Expo workspace belongs inside the ERP.

## 2026-08-14 — Supplify Assistant

- [x] API `/api/assistant` + types added; mobile client/types updated in both repos.
- [x] Feature gate `ai_platform` on Assistant screen (restaurant, supplier, driver).
- [x] Admin assistant overview: web-only; admin mobile skip documented in parity log.
- [x] Human Chat unchanged and separate from Assistant.
- [x] `MOBILE_FEATURE_PARITY.md` dated entry added.

## 2026-08-09 audit record

- [x] API response type checked: mobile entitlement envelope corrected.
- [x] Web/API behavior checked: billing notification route synchronized.
- [x] RBAC and plan gates checked: permissions remain server-aligned; mobile feature keys verified against `feature-keys.js`.
- [x] Order lifecycle checked: no API lifecycle change in this audit.
- [x] Fulfillment, GPS, ETA, and maps checked: no payload change; foreground-only policy retained.
- [x] Mobile screens updated: Plan & features plus feature-unavailable guard.
- [x] Android and iOS source changes synchronized.
- [x] iOS tests, typecheck, Expo Doctor, and production export run.
- [x] `MOBILE_FEATURE_PARITY.md` updated.
