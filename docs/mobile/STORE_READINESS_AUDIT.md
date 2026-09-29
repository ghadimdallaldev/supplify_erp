# Store Readiness Audit

**Date:** 2026-09-29  
**Scope:** Supplify Android (`C:/myProjects/supplify-mobile`), iOS (`C:/myProjects/supplify-mobile-ios`), ERP API/web (`C:/myProjects/supplify_erp`)  
**Policy sources (current):** [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Apple Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/), [Google Play Target API](https://support.google.com/googleplay/android-developer/answer/11926878), [Google Play Account Deletion](https://support.google.com/googleplay/android-developer/answer/13327111), [Google Play User Data](https://support.google.com/googleplay/android-developer/answer/10144311)

**Locked product decisions:** Account deletion **1B** (OWNER must transfer ownership or complete explicit org-close before personal deletion; never implicitly delete the business). Mobile SaaS payments **2C** (hide Featured Placement / digital purchase + raw card UI on mobile; web billing untouched). Public Play deletion URL must **initiate** deletion on web, not only instruct users to use the app.

**Implementation status:** Audit complete. Code fixes blocked until Agent mode is approved (Plan mode rejects non-markdown edits).

---

## Platform / build

| Check                   | Android                                      | iOS                    | Status                                       |
| ----------------------- | -------------------------------------------- | ---------------------- | -------------------------------------------- |
| Package / bundle ID     | `com.supplify.mobile`                        | `com.supplify.mobile`  | PASS                                         |
| Version / build         | 1.1.0 / versionCode 11                       | 1.1.0 / buildNumber 11 | PASS (bump at submit)                        |
| Target SDK              | API **36** via RN/Expo defaults              | N/A                    | PASS (meets Aug 31 2026 Play rule)           |
| Xcode 26 / iOS 26 SDK   | N/A                                          | Managed Expo / EAS     | OWNER — confirm EAS image uses Xcode 26      |
| EAS production API      | `https://api.supplifyerp.com`                | same                   | PASS                                         |
| Local release signing   | Debug keystore in `android/app/build.gradle` | N/A                    | FAIL if local release shipped; EAS remote OK |
| AAB production          | EAS production default AAB                   | N/A                    | PASS (config)                                |
| Push config             | `GOOGLE_SERVICES_JSON` optional at build     | APNs via EAS project   | OWNER — ensure credentials present           |
| Sentry / analytics SDKs | None                                         | None                   | PASS (disclose none)                         |

---

## Completeness / privacy / accounts

| Check                                         | Status                    | Evidence                                                                      |
| --------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| In-app account deletion                       | **FAIL**                  | No delete UI in Settings / Consumer Account / Driver More                     |
| Account deletion API                          | **FAIL**                  | No self-service purge/anonymize route                                         |
| Org OWNER gate + transfer/close               | **FAIL**                  | No transfer-ownership or close-org API; branch deactivate only (main blocked) |
| Public web deletion that **initiates** delete | **FAIL**                  | Privacy policy email only; no `/account/delete` flow                          |
| Privacy / Terms tappable in app               | **FAIL**                  | PendingScreen switch without links                                            |
| Guest privacy notice on mobile checkout       | **FAIL**                  | Missing vs web                                                                |
| Role isolation                                | PASS                      | RootNavigator role switch                                                     |
| Guest/public shop                             | PASS                      | Rate limits + hashed tracking tokens                                          |
| Sign in with Apple                            | N/A                       | Keycloak-only; no third-party social login                                    |
| Raw card PAN on mobile Featured Placement     | **FAIL** (to hide per 2C) | `FeaturedPlacementScreen.tsx`                                                 |
| SaaS subscription in mobile                   | PASS (web handoff)        | BillingLockedScreen                                                           |
| Physical goods IAP                            | N/A                       | Guest/offline COD/bank — correct                                              |
| Background location requested                 | PASS (code)               | Foreground `watchPositionAsync` only                                          |
| Always-location Info.plist strings (iOS)      | **FAIL**                  | Plugin defaults add Always strings                                            |
| Android location FGS merge                    | **REVIEW**                | expo-location `LocationTaskService` may merge                                 |
| AASA / assetlinks published                   | **FAIL**                  | Not in `apps/web/static`                                                      |
| Android HTTPS App Links in committed manifest | **FAIL**                  | Scheme-only; rely on EAS prebuild                                             |
| Hardcoded secrets in app src                  | PASS                      | `__DEV__` admin hint only                                                     |
| Debug menus in production                     | PASS                      | None found                                                                    |

---

## Data inventory (for App Privacy / Data Safety)

| Data                        | Collected?                                | Purpose                                         | Notes                       |
| --------------------------- | ----------------------------------------- | ----------------------------------------------- | --------------------------- |
| Name, email, phone          | Yes                                       | Account / delivery                              |                             |
| Address                     | Yes                                       | Delivery / consumer                             |                             |
| Precise location            | Yes (when-in-use)                         | Driver active delivery, address validation, POD | Not background              |
| Photos / camera             | Yes                                       | POD                                             |                             |
| Push tokens                 | Yes                                       | Notifications                                   | Unregister on logout        |
| Device IDs / Advertising ID | No app code                               | —                                               |                             |
| Analytics / crash SDKs      | No                                        | —                                               |                             |
| Payment card PAN            | Web + currently mobile Featured Placement | SaaS ads                                        | Hide on mobile (2C)         |
| Order history               | Yes                                       | Core product                                    | Retain on account delete    |
| Chat / messages             | Yes (ERP roles)                           | Ops                                             | Anonymize display on delete |
| Guest tracking token        | Yes                                       | Order track                                     | Capability URL              |

---

## Payments classification

| Flow                        | Type                    | Store implication                                        |
| --------------------------- | ----------------------- | -------------------------------------------------------- |
| Restaurant↔supplier orders | Physical / B2B goods    | No IAP                                                   |
| Guest/consumer public sales | Offline COD/pickup/bank | No IAP                                                   |
| Tenant SaaS subscription    | Digital                 | Web-only today; **ACTION REQUIRED** if sold in-app later |
| Featured placement / boosts | Digital ads             | Hide on mobile (2C); web untouched; IAP ruling OWNER     |

---

## Reviewer accounts needed (credentials OWNER-supplied)

- Restaurant Owner / staff
- Supplier Owner / staff
- Driver (linked)
- Consumer
- Guest checkout without login

Do **not** hardcode credentials in production binaries.

---

## Next implementation phases (blocked on Agent mode)

1. Migration `0224` + account deletion service/routes (OWNER transfer + explicit org close)
2. Web `/account/delete` that initiates deletion when signed in
3. Mobile delete UX (both repos)
4. Hide mobile SaaS purchase UI
5. Privacy links, permissions, AASA/assetlinks
6. Tests, builds, submission packet, verdict

---

## Release verdict (pre-implementation)

| Platform    | Verdict                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Apple       | **NOT READY TO SUBMIT** — account deletion, privacy links, Always-location strings, AASA, Xcode 26 build confirmation             |
| Google Play | **NOT READY TO SUBMIT** — account deletion + web initiate URL, privacy links, Data Safety accuracy, App Links hosting, FGS review |
