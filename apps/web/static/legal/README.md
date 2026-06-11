# Supplify Legal Documents Pack

**Current pack version:** `2026-06-09` (must match `LEGAL_PACK_VERSION` in `apps/web/src/lib/legalDocuments.ts` and `apps/api/src/lib/legal-documents.js`).

> **Legal review required:** This document is a business/legal draft for Supplify. It is not legal advice. Before using it with real users, have it reviewed and adapted by a qualified lawyer in Lebanon and in every market where Supplify operates.

Placeholders to replace before launch: `[Company Legal Name]`, `[Company Address]`, `[Support Email]`, `[Privacy Email]`, `[Effective Date]`, `[Last Updated]`, `[Website]`.

## Included files

1. `TERMS_AND_CONDITIONS.md` — Master platform terms for restaurants, suppliers, staff, drivers, admins, public guests, reservations, orders, branches, warehouses, subscriptions, **deals & boosts**, mobile app usage, and platform liability.
2. `PRIVACY_POLICY.md` — Personal/business data processing notice covering users, staff, drivers, public reservation guests, notifications, mobile app permissions, analytics, subprocessors, retention, and rights.
3. `DATA_PROCESSING_ADDENDUM.md` — B2B data-processing addendum for restaurant/supplier tenant data, admin support access, subprocessors, security, deletion/export, and anonymized analytics.
4. `SUPPLIER_AGREEMENT.md` — Supplier-specific obligations for catalog accuracy, inventory, pricing, fulfillment, invoices, delivery, drivers, substitutions, **deals, boosts, coupon codes**, and disputes.
5. `RESTAURANT_AGREEMENT.md` — Restaurant-specific obligations for ordering, receiving, payments, reservations, waitlists, guests, staff, branches, invoices, and disputes.
6. `DEALS_BOOST_TERMS.md` — Specific terms for supplier **deals**, **boosts**, **coupon codes**, admin approval, pricing snapshots, visibility, expiry, refund/credit rules, and no guaranteed results.
7. `SUBSCRIPTION_ADDON_TERMS.md` — Plans, Free Trial, billing, account locks, branches, warehouses, add-ons, upgrades/downgrades, cancellations, and refunds.
8. `ACCEPTABLE_USE_POLICY.md` — Prohibited conduct, prohibited goods/content, spam, misuse, security abuse, platform manipulation, and enforcement.
9. `MOBILE_APP_TERMS.md` — Mobile app and future driver/PWA-specific terms covering push, device permissions, camera, location, offline use, app stores, and updates.
10. `COOKIE_POLICY.md` — Cookie/session/analytics/marketing cookie disclosures.

## Recommended app acceptance points

- **Registration:** Terms + Privacy acceptance checkbox (full registration pack).
- **Login (existing users):** When `LEGAL_PACK_VERSION` bumps, users with stale acceptances are redirected to **`/legal/reaccept`** before using `/app/*` or `/staff/dashboard`. See [`docs/ui/LEGAL_PACK_REACCEPTANCE.md`](../../../docs/ui/LEGAL_PACK_REACCEPTANCE.md).
- **Supplier deal/boost submission:** Deals & Boost Terms acceptance (included in registration pack for suppliers).
- **Subscription checkout:** Subscription & Add-on Terms acceptance.
- **Mobile first login:** Mobile App Terms + push/device permission explanation.
- **Public booking form:** Privacy notice + restaurant booking terms notice.

## Bumping the legal pack

1. Edit the relevant markdown files in this directory.
2. Set the **same** new version string in `legalDocuments.ts` (web) and `legal-documents.js` (API).
3. Deploy **API and Web together**.
4. All users not on the new version will see `/legal/reaccept` on next app visit.

## Important product positioning

Supplify should be positioned as a **software/platform provider**, not as the seller of supplier products or the operator of restaurant reservations unless you intentionally take that liability.
