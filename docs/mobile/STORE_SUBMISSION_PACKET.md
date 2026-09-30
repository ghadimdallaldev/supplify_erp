# Store Submission Packet

**Date:** 2026-09-30  
**Apps:** Supplify Android + iOS (`com.supplify.mobile` v1.1.0 / build 11)  
**Play account deletion URL:** `https://app.supplifyerp.com/account/delete`  
**Privacy policy URL:** `https://app.supplifyerp.com/legal/privacy_policy`  
**Terms URL:** `https://app.supplifyerp.com/legal/terms_and_conditions`  
**Support / privacy email:** `privacy@supplify.com` / `legal@supplify.com`

Do **not** hardcode reviewer credentials in production binaries.

---

## Reviewer demo accounts (OWNER supplies credentials)

| Role       | How to test                                                   | Notes                                         |
| ---------- | ------------------------------------------------------------- | --------------------------------------------- |
| Guest      | Open app logged out → Discover → storefront → cart → checkout | Offline payment only                          |
| Consumer   | Register / sign in as CONSUMER                                | Account → Delete account available            |
| Restaurant | Keycloak user with restaurant Owner/staff                     | More → Delete account; ERP flows              |
| Supplier   | Keycloak supplier user                                        | Featured placement: view-only + Manage on web |
| Driver     | Linked driver user                                            | More → Delete account; GPS when-in-use only   |

**Review notes (paste into App Store Connect / Play Console):**

> Supplify is a multi-role B2B restaurant–supplier marketplace with optional public guest shopping. Sign-in uses Keycloak SSO (email/password), not Facebook/Google social login, so Sign in with Apple is not required. Physical goods and guest orders use offline payment (COD / pickup / bank transfer). Digitalsubscription and featured-placement purchases are completed on the web only (`https://app.supplifyerp.com`). Account deletion is available in-app (Settings / Account / Driver More → Delete account) and on the web at `/account/delete`. Organization owners must transfer ownership or explicitly close the organization before personal deletion; closing an org is never implied by personal deletion. Location is used only while the app is in the foreground for delivery address validation and active driver deliveries.

---

## Metadata checklist (owner-supplied marketing)

| Item                                 | Status                                                   |
| ------------------------------------ | -------------------------------------------------------- |
| App name                             | Supplify (from repo)                                     |
| Subtitle / short description         | **ACTION REQUIRED** — marketing                          |
| Full description                     | **ACTION REQUIRED** — marketing                          |
| Category                             | Business / Food & Drink — **confirm**                    |
| Keywords (Apple)                     | **ACTION REQUIRED**                                      |
| Screenshots (phone + required sizes) | **ACTION REQUIRED**                                      |
| App icon                             | Present in mobile `assets/` — confirm store assets       |
| Feature graphic (Play)               | **ACTION REQUIRED**                                      |
| Privacy policy URL                   | `https://app.supplifyerp.com/legal/privacy_policy`       |
| Support URL                          | **ACTION REQUIRED** (website or support page)            |
| Terms URL                            | `https://app.supplifyerp.com/legal/terms_and_conditions` |
| Account deletion URL (Play)          | `https://app.supplifyerp.com/account/delete`             |
| Age rating / content rating          | **ACTION REQUIRED** — answer questionnaires              |
| Copyright                            | **ACTION REQUIRED**                                      |
| Contact info                         | **ACTION REQUIRED**                                      |
| Countries / regions                  | **ACTION REQUIRED**                                      |
| DSA trader status (EU)               | **ACTION REQUIRED** if distributing in EU                |

---

## Data Safety / App Privacy (code-backed)

| Category                    | Collect?           | Notes                     |
| --------------------------- | ------------------ | ------------------------- |
| Name, email, phone          | Yes                | Account / delivery        |
| Precise location            | Yes                | When-in-use only          |
| Photos / camera             | Yes                | POD camera                |
| Photos library              | No (mobile config) | Camera-only POD           |
| Push tokens                 | Yes                | Notifications             |
| Purchase history (physical) | Yes                | Orders                    |
| Payment card info           | Not on mobile      | Web billing only after 2C |
| Advertising ID / tracking   | No                 | No ATT / analytics SDK    |
| Crash / analytics SDK       | No                 | None in mobile deps       |

---

## Console / infra ACTION REQUIRED

1. Replace `TEAMID` in AASA and Play signing SHA-256 in `assetlinks.json`, then confirm `https://app.supplifyerp.com/.well-known/...` serves correctly (Apple needs `application/json` and no auth redirect).
2. EAS production credentials: Android upload key / Play App Signing; iOS APNs + distribution cert; build with **Xcode 26 / iOS 26 SDK**.
3. Ensure `GOOGLE_SERVICES_JSON` is set for Android production EAS builds.
4. Legal counsel review of privacy retention wording.
5. Future IAP decision if SaaS purchases return to mobile.
6. Demo accounts for App Review / Play review.
7. Store listing creatives and copy.
