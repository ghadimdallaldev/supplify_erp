# Android driver app release

## Prerequisites

- Android SDK and a supported JDK are installed.
- The API and web environment values are configured.
- `GPS_NATIVE_TRACKING_ENABLED` and session flags are enabled only in the intended environment.
- A physical test device has location and notification permissions available.

## Build

From `apps/web`:

```text
pnpm build
pnpm exec cap sync android
gradlew.bat assembleDebug
```

For a release build, configure signing in the Android project outside source control and run the organization’s release Gradle task. Never ship a debug APK.

## Smoke test

Install on a physical device, sign in as a driver, start a session, lock the screen, move through a short route, verify the foreground notification, and confirm points and stale state on the supplier map. Stop the session and verify the server marks it stopped.

## Rollback

Disable the session/live-event flags and keep the legacy browser endpoint available. This returns web tracking to the existing order-location path while leaving stored session data intact.
