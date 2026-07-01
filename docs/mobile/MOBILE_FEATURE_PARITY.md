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

## 2026-06-17 — Supplier Ops Wave 2 (web-first)

- **Run sheet**: `/app/run-sheet` — daily ops brief (pick queue, deliveries, receivables, shortages). API `GET /api/supplier/run-sheet`.
- **Pick lists / waves**: Fulfillment → Pick lists tab; API `/api/fulfillment/waves/*`.
- **Collections reminders**: Receivables panel + cron `collections-reminders`; migration `0176_invoice_reminder_log.sql`.
- **POD photo + signature**: `ProofOfDeliveryDialog`, presign upload, restaurant confirm.
- **Excel import**: `.xlsx` on product bulk upload (server-side SheetJS).
- **Warehouse delivery zones**: Settings → Warehouses → Manage zones.
- **Quote price lock**: `QUOTE_PRICE` on checkout from RFQ compare; migration `0178_quote_price_lock.sql`.
- **Accounting export**: Supplier invoice/payment CSV + QuickBooks from `/api/supplier/invoices/export*`.
- **Route optimization**: `POST /api/fulfillment/routes/:id/optimize` (nearest-neighbor; Mapbox optional later).

**Mobile**: Run sheet, pick lists, POD capture, and route optimize are **high priority** for `supplify-mobile` driver/warehouse flows. Excel import and zones remain web-first.

**Migrations**: `0176`–`0179` before deployed use.

## 2026-06-17 — Arabic localization (web-only)

- **Scope**: English + Arabic UI via i18next on web — language switcher in header, RTL `dir` on `<html>`, eager `common`/`navigation` bundles, lazy `auth`/`settings`, locale persistence in `localStorage` (`supplify.locale`), Arabic-aware `Intl` formatting for dates/currency/numbers.
- **Docs**: [ARABIC_LOCALIZATION_I18N.md](../features/ARABIC_LOCALIZATION_I18N.md)

## 2026-06-17 — Restaurant payables, relationship UX, multi-supplier checkout (web-first)

- **Payables panel**: `GET /api/restaurant-finance/payables` + `RestaurantPayablesPanel` on restaurant Invoices (mirror supplier receivables).
- **Connection requests**: Restaurant inbox on `/app/suppliers` — `GET/POST /api/restaurant/growth/connection-requests/*`.
- **Block supplier**: `POST/DELETE /api/suppliers/:id/block` on supplier detail; `is_blocked` on supplier profile.
- **Multi-supplier cart preview**: Checkout shows N orders before confirm (backend already split per supplier).
- **Quote price lock hardening**: Checkout rejects stale quote locks with clear validation error.
- **Reason**: Accountant/purchaser workflows and supplier relationship management are web cockpit features. Mobile can consume payables API and connection-request endpoints in a later restaurant finance pass.

## 2026-06-18 — Mobile v1 parity release (supplify-mobile)

- **Scope**: Full acceptance-criteria parity for driver, restaurant, and supplier roles in `supplify-mobile` — chat, quick lists, invoices/statement, inventory, disputes, run sheet, pick lists, fulfillment dispatch (assign/reassign/rollover), photo POD, route optimize, branch picker, entitlements, offline banner, toast errors.
- **Native push**: `POST/DELETE /api/push/devices` for Expo push tokens (extends existing VAPID web subscribe in `push.routes.js`). Mobile registers via `expo-notifications`; delivery fan-out may require ops configuration.
- **QA**: [MOBILE_QA_CHECKLIST.md](../../supplify-mobile/docs/mobile/MOBILE_QA_CHECKLIST.md) in mobile repo; EAS `preview` profile for internal TestFlight / Play testing.
- **Still web-only**: Arabic i18n, admin, bulk CSV import, loyalty program setup, accounting export, delivery zone CRUD.

## 2026-06-18 — Restaurant inventory bulk import (web-only)

- **Scope**: Restaurant CSV bulk stock import on `/app/restaurant-inventory` — template download, preview, confirm. API `POST /api/restaurant-inventory/import/preview` and `/import` (`restaurant-inventory-import.service.js`).
- **Reason**: Multi-step CSV preview/validation and desktop file workflows match the web cockpit. Mobile v1 has no equivalent bulk-import UI; restaurants can adjust stock on web or use per-line add/adjust flows on mobile when parity is added.

## 2026-06-18 — Supplier B2B loyalty program page (web-only)

- **Scope**: Supplier loyalty configuration stub at `/app/loyalty` (`LoyaltyProgramPage`); APIs at `/api/loyalty/supplier/program` and balance endpoints. RTK types in `apps/web/src/services/api/endpoints/loyalty.ts`.
- **Reason**: B2B loyalty program setup and balance review are supplier catalog/CRM cockpit workflows (web-first). Consumer-facing loyalty remains separate (`/app/consumer-loyalty`). Mobile can adopt supplier loyalty APIs in a later supplier CRM pass.

## 2026-07-01 — Reorder correctness, WhatsApp + webhook plumbing, AI fixes (server-first)

- **Reorder suggestions (server is source of truth — no mobile change needed)**: Unified the reorder-quantity math behind `apps/api/src/lib/reorder-quantity.js` (order-up-to over lead time + 14-day buffer, minus on-hand, MOQ/pack rounding). Fixed a real bug in `GET /api/restaurant-inventory` (`avg_daily_usage` was averaged per movement row instead of per day). `GET /reorder-suggestions` and `/reorder-assistance` now agree. Quantities may shift for existing items; **mobile consumes the server `suggested_reorder_qty` value directly, so it inherits the fix automatically.** Additive fields on the inventory list rows: `lead_time_days`, `moq`, `order_multiple`.
- **WhatsApp (server-side delivery, no mobile UI)**: `whatsapp.service.js` is now a real Meta Cloud API client gated by `WHATSAPP_ENABLED` + credentials (log-only + not-configured modes mirror email). New `whatsapp_sent` column on `notification_log` (was recorded in the repurposed `sms_sent`). Delivery is server-side; **no mobile change** — mobile just sees the extra `whatsapp_sent` flag on notification rows (additive).
- **Notification webhooks (Platinum tier, server + web-only config UI)**: `email_whatsapp_webhook` plan now dispatches HMAC-signed outbound webhooks (`notification/webhook.js`). Config API `GET/PUT /api/notifications/webhook`; web settings card in restaurant/supplier notification settings. **Mobile not in scope** — webhook management is a cockpit/admin workflow.
- **AI reorder assistant fixes (server-side)**: quota now only counts successful LLM calls (refund on failure), `explain` filters hallucinated product IDs, env `AI_MAX_REQUESTS_PER_TENANT_PER_DAY` is enforced, and `ask` degrades to a heuristic on limit (previously threw). Ask result gains an optional `usageLimited` flag (additive). Behavior only differs when `AI_ENABLED=true`; **no mobile change required**.
- **Migrations**: `0181_whatsapp_delivery.sql`, `0182_notification_webhook.sql` before deployed use.
- **Env**: `WHATSAPP_ENABLED`, `WHATSAPP_LOG_ONLY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION` (see `apps/api/.env.example`).
