# Native Android tracking sources

The production Capacitor Android project is generated in `apps/web/android`. The Kotlin sources in this folder are the checked-in source template used when regenerating the native project. After changing Capacitor dependencies, run `pnpm exec cap sync android` from `apps/web` and reapply the native files if Capacitor regenerates the Android tree.

The native service requires location permissions, a foreground notification, and Google Play Services location APIs. Validate background behavior on a physical device before enabling native tracking in production.
