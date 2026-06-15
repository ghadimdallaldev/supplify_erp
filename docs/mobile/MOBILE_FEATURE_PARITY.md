Copy of mobile parity audit — source of truth: `supplify-mobile/docs/mobile/MOBILE_FEATURE_PARITY.md`

See that file for the full feature matrix (restaurant, supplier, driver, admin).

Web = full cockpit. Mobile v1 = operational app. Driver mobile = complete and simple.

## 2026-06-12 — ERP web UI motion polish (web-only)

- **Scope**: Emil design-eng motion pass on ERP shell (supplier, admin, fulfillment, staff, login): shared Sheet/Tooltip/Popover/Command primitives, Sonner toasts, motion tokens, skeleton unification.
- **Reason**: Visual polish and perceived performance on web; no API or behavioral changes. Consumer B2C polish deferred to a follow-up pass. Mobile unchanged.

- **Quote requests / RFQ**: Implemented on web only (`/app/quote-requests`). API at `/api/quote-requests`. Types in `apps/web/src/types/index.ts` for future mobile.
- **Supplier mini-store**: Public page `/supplier/:slug` + public API. Mobile not in scope for v1.
- **Reason**: Operational procurement RFQ and public catalog browsing are web-first; mobile can adopt APIs later without blocking web release.

## 2026-06-15 — Bulk product image import (web-only)

- **Scope**: Supplier bulk catalog image import (ZIP by SKU, ZIP + mapping CSV, and `image_url` via product CSV) on `/app/products` → **Import Product Images**. API at `/api/supplier/products/images/import/*`.
- **Reason**: Large ZIP uploads, multi-step preview/confirm, and background job polling are supplier catalog-management workflows suited to the web cockpit. Mobile v1 focuses on operational ordering and fulfillment; suppliers can manage images on web. APIs and types exist in `apps/web` for a future mobile catalog-admin pass if needed.
- **Migration**: Run `0168_catalog_image_import.sql` before using Import Product Images in deployed environments.
- **Docs**: [bulk-product-image-import.md](../features/bulk-product-image-import.md)

## 2026-06-15 — Supplier customer growth (web-only)

- **Scope**: Supplier customer import, referral invites, sponsored onboarding, and growth dashboard at `/app/customer-growth`. APIs at `/api/supplier/growth/*`, `/api/growth/referral/:token`, `/api/restaurant/growth/connection-requests`.
- **Reason**: CRM-style bulk import, invite link sharing, and admin growth configuration are web-first supplier acquisition workflows. Mobile can consume metrics API later.
- **Migration**: Run `0169_supplier_growth_program.sql` before using customer growth features.
- **Platform trial**: Free trial default raised to **30 days** platform-wide (admin range 7–90).
