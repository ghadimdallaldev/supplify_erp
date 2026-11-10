# Android mobile app release

The Android app is maintained in the standalone repository:

    C:\\myProjects\\supplify-mobile

No Android application project is generated or released from `apps/web`. The web ERP remains a browser/PWA application.

## Prerequisites

- Node.js 22 LTS
- Android Studio with the Android SDK and an Android Virtual Device
- EAS CLI for cloud builds, or the local Android toolchain for debug builds
- A configured Keycloak public client named `supplify-mobile`

## Development and emulator

From `C:\\myProjects\\supplify-mobile`:

    npm install
    npm run typecheck
    npm test -- --runInBand
    npx expo start --android

The checked-in `eas.json` contains development, preview, and production profiles. Environment setup and emulator networking are documented in `docs/mobile/MOBILE_SETUP.md` in that repository.

## Internal APK

After authenticating EAS CLI:

    eas build --platform android --profile preview

The preview profile produces an installable internal-test APK. Use the production profile for the Play Store AAB:

    eas build --platform android --profile production

## Release checks

Verify restaurant, supplier, and driver accounts separately. For drivers, verify today’s route, navigation, delivery-state transitions, foreground GPS while the app is open, proof-of-delivery photo/signature/GPS, and problem reporting. The app requests foreground location only and does not claim persistent background tracking.

The equivalent iOS source is maintained separately in `C:\\myProjects\\supplify-mobile-ios`.
