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

Mobile repo: `../supplify-mobile`
