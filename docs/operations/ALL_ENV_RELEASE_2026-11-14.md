# Pilot and iPad repairs - all-environment release, 2026-11-14

The owner requested committing and promoting the verified repairs to all
environments. Release order is Development, preproduction, then production;
production receives the tested preproduction runtime tree through a pull request.
No direct push to `main` or `prod` is used.

## Included source

Invoice detail/PDF, product authorization, organic deal discovery and interaction
database adapters, iPad form/dialog/filter layouts, receiving score display,
reorder quantity handoff, reservation/public booking safeguards, guest menu and
rewards behavior, and duplicate-safe guest checkout are included. Earlier pilot
session/cart/currency isolation, cron startup/retry, email transport hardening,
and the Keycloak HTTP mail adapter are included in the same source release.

Migration `0232_consumer_checkout_idempotency.sql` is additive. It is applied by
the API startup migration runner before keyed checkout is used. No seed, reset,
database restore or destructive migration is part of this release.

The corresponding Android/iOS source is committed and promoted through its
own `dev`, `preprod` and `prod` branches. Native source promotion does not
distribute a new signed binary or publish to either app store.

Unrelated flyer/marketing work and local verification outputs stay outside the
source commits. Secrets, signing keys and database snapshots are excluded.
The owner's decision to leave hosted backup configuration pending is preserved.

## Verification before promotion

- Earlier full API suite: 390 suites / 2,564 tests; full web: 159 suites / 606 tests.
- Follow-up API route/security/service checks: 5 suites / 30 tests.
- Follow-up guest menu/public booking checks: 2 suites / 6 tests.
- Root typecheck, web lint and production build pass after the last web changes.
- Both native clients: 30 suites / 116 tests and TypeScript pass; shared changed
  files are identical, with the Android-only internal pilot build profile documented.
- Real isolated PostgreSQL drills cover tenant access, invoices/PDF, deal
  eligibility, reorder rules and simultaneous guest checkout/reward debit.
- Live Development: 18 API checks and 29 WebKit layout/interaction checks pass.
  The seeded demo account consent gate is isolated only in the layout harness;
  no acceptance record or deployed guard is changed.

Detailed evidence and limitations:
[pilot readiness](./PILOT_READINESS_2026-11-13.md),
[iPad repair review](./IPAD_WEB_REVIEW_2026-11-13.md),
[Development rollout](./DEV_IPAD_ROLLOUT_2026-11-14.md).

## Deployment tracking

Git source commits, promotion pull requests and Railway deployment evidence are
recorded locally under `output/all-env-release-2026-11-14/` as each target settles.
Each environment must pass API health/readiness, web health, realm discovery,
and migration confirmation before advancing to the next target.

Previous healthy production rollback references:

| Service  | Deployment                             |
| -------- | -------------------------------------- |
| API      | `00d32105-2723-4087-8129-a4cdb529973e` |
| Web      | `b658b24b-cbd0-4e4e-bb02-86d379fab04c` |
| Keycloak | `77cec117-6208-4a33-88eb-2db1f004c916` |

Physical-device verification, observed production recovery/invitation delivery,
automated hosted backups, and a real booking/checkout/rewards receipt remain
customer-onboarding gates. Deploying these repairs does not claim those gates
have been satisfied or that the product has zero defects.
