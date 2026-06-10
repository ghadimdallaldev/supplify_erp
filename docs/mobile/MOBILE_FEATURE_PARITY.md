Copy of mobile parity audit — source of truth: `supplify-mobile/docs/mobile/MOBILE_FEATURE_PARITY.md`

See that file for the full feature matrix (restaurant, supplier, driver, admin).

Web = full cockpit. Mobile v1 = operational app. Driver mobile = complete and simple.

## 2026-06-11 — Quote requests & supplier mini-store (web-only)

- **Quote requests / RFQ**: Implemented on web only (`/app/quote-requests`). API at `/api/quote-requests`. Types in `apps/web/src/types/index.ts` for future mobile.
- **Supplier mini-store**: Public page `/supplier/:slug` + public API. Mobile not in scope for v1.
- **Reason**: Operational procurement RFQ and public catalog browsing are web-first; mobile can adopt APIs later without blocking web release.
