# Pilot readiness handoff - 2026-11-13

[Release record and remaining gates](../../docs/operations/PILOT_READINESS_2026-11-13.md)

- [Signed Android pilot APK, 1.1.0 (27)](./supplify-pilot-1.1.0-27.apk)
- [EAS build](https://expo.dev/accounts/supplify-team/projects/supplify-mobile/builds/de477af2-8729-4411-84a8-534fa4e6d39f)
- [APK build metadata](./android-final-build.json)
- [Emulator install evidence](./android-final-install.json)
- [Native SSO form evidence](./android-sso-evidence.json)
- [Native cart at 320 pixels](./native-cart-320.png)
- [Native cart at 390 pixels](./native-cart-390.png)
- [Web orders at 390 pixels](./web-orders-390.png)
- [Web orders at 1440 pixels](./web-orders-1440.png)
- [Visual measurements](./ui-review-final.json)
- [API tests](./api-tests.log), [web tests](./web-tests.log)
- [Android tests](./android-tests.log), [iOS tests](./ios-tests.log)
- [Restore drill evidence](./hosted-restore-evidence.json)
- [Production backup inventory](./production-backup-schedule.json)
- [Preproduction recovery delivery](./recovery-preprod-evidence.json)
- [Preproduction health and cron runs](./preprod-crons.json)
- [Isolated source manifest](./preprod-source.json)

The pilot APK uses production API/Keycloak settings. Customer rollout remains
gated by the release record. Android physical push/GPS/uploads and a complete
customer order/payment rehearsal are not established by emulator screenshots.

The production backup volume has no schedule or hosted snapshot. The owner
explicitly deferred configuration; `enable-production-backups.py` is dry-run
by default and was never executed with `--apply`. Local restore scratch data
was deleted. No database dump, signing key, or mail credential is included.

Scripts in this folder are evidence/rehearsal helpers, not an automatic release
pipeline. Review their environment/service targets before reusing them.
