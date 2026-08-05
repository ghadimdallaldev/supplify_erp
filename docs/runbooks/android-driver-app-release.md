# Android driver app release

## Prerequisites

- Android SDK 35 and Build Tools 35 are installed.
- Android Studio's bundled JDK 21 is available.
- ANDROID_HOME and ANDROID_SDK_ROOT point to the Android SDK.
- GPS native tracking and session flags are enabled only in the intended environment.
- A physical test device has location and notification permissions available.

## Sync an environment

From apps/web:

    pnpm.cmd run android:sync:development
    # or: android:sync:preprod / android:sync:production

The sync command writes a strict hosted-origin profile into the generated Android
configuration. Development loads app-dev.supplifyerp.com and allows only
keycloak-dev.supplifyerp.com for the OAuth screen. Preprod and production use
their matching first-party hosts. The app requires network access.

## Local debug build

From apps/web/android:

    $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
    $env:GRADLE_USER_HOME = 'C:\myProjects\supplify_erp\.gradle-user-home'
    .\gradlew.bat assembleDebug --no-daemon --max-workers=1 '-Pkotlin.incremental=false' '-Pkotlin.compiler.execution.strategy=in-process'

Install and launch:

    adb install -r app\build\outputs\apk\debug\app-debug.apk
    adb shell am start -n com.supplify.driver/.MainActivity

## Signed release APK and AAB

Release signing reads the ignored apps/web/android/keystore.properties file:

    storeFile=keystores/supplify-driver-release.jks
    storePassword=<secret>
    keyAlias=supplify-driver
    keyPassword=<secret>

Keep the keystore and passwords in the organization's password manager and secure
backup. Losing the keystore prevents signing upgrades for the same Android app.

After syncing the intended environment:

    .\gradlew.bat :app:assembleRelease :app:bundleRelease --no-daemon --max-workers=1 '-Pkotlin.incremental=false' '-Pkotlin.compiler.execution.strategy=in-process'

- Share the signed APK with direct-install testers.
- Upload the signed AAB to Google Play internal testing or a client release.
- Verify the APK with apksigner verify --verbose --print-certs.
- Verify the AAB with jarsigner -verify -certs.
- Never ship the debug APK.

## Smoke test

Install on an emulator first and verify Sign in and Register remain inside the
WebView and reach the matching Keycloak host. On a physical device, sign in as a
driver, start a session, grant location and notification permissions, lock the
screen, move through a short route, verify the foreground notification, and
confirm points and stale state on the supplier map. Stop the session and verify
the server marks it stopped.

The Android instrumentation regression covers both auth entry points. With an
emulator running and after syncing the intended environment:

    .\gradlew.bat :app:connectedDebugAndroidTest --no-daemon --max-workers=1 '-Pandroid.testInstrumentationRunnerArguments.class=com.supplify.driver.DriverAuthSmokeTest'

## Rollback

Disable the session and live-event flags and keep the legacy browser endpoint
available. This returns web tracking to the existing order-location path while
leaving stored session data intact.
