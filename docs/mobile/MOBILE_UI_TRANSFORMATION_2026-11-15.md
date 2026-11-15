# Mobile UI transformation — 2026-11-15

The Android and iOS applications share a violet, light-theme design system. The
delivery target for this work is an installable **Android dev APK** using the
existing EAS `demo` profile. Native iOS validation and distribution are deferred
at the user's request; iOS source and dependency parity remain required.

## Product and implementation decisions

- Retain Expo 56, React Native, React Navigation, TanStack Query, Zustand, and
  the established authenticated/public clients and business services.
- Evolve `src/theme` and `src/components/ui`; preserve existing component exports
  while consolidating their presentation. No competing component framework.
- Keep Supplify violet `#5822B4`, neutral surfaces, readable system typography,
  semantic statuses, numerical alignment, and restrained borders.
- Restaurant tabs: Home, Suppliers, Orders, Messages, More. Reservations remains
  directly reachable from Home and More, including reservation-only staff.
- Supplier tabs: Home, Orders, Dispatch, Messages, More. Other roles retain their
  established destinations and capability boundaries.
- At 600 logical pixels, expand spacing; from 900 pixels, use a navigation rail
  and split order, message, dispatch, and reservation views when font scaling
  permits. Enable orientation changes and future native iPad support.
- Centralize reactive English/Arabic copy, logical direction, numeric input,
  and locale-aware formatting. Store the device language preference separately
  from authentication. Language changes retain navigation and mounted drafts.
- Use the existing workspace-switch flow and session clearing. Warehouse
  assignments remain distinct from the active account.
- Respect font scaling, safe areas, keyboards, reduced motion, semantic labels,
  and 48-point primary controls. Physical assistive-technology checks remain a
  release gate; source and web checks alone do not certify native accessibility.

## Workflow improvements

The role home screens prioritize actual work and preserve sampled-data labels.
Mixed-currency supplier totals are separated. Failed queries do not present a
known count of zero. Queries and refresh actions respect relevant permissions.

Order and message lists support tablet detail panes without changing canonical
detail routes. Cart quantities support deliberate direct entry while retaining
existing checkout validation, price resolution, quote locks, and retry keys.

The reservation board offers a date picker, booking/table/waitlist views, guest
details, existing table-assignment actions, and status controls. Read-only staff
cannot expose edit controls. Cancellations and no-shows require confirmation;
the API remains the authority on capacity, overlap, transitions, and ownership.
Booking creation separates date and time selection instead of requiring an ISO
datetime string. Date-only values use local calendar construction rather than
UTC serialization.

The account directory supports searching permitted destinations. All existing
secondary modules consume the shared typography/controls. Public shopping and
business carts remain separate. Admin-console handoffs remain browser links.
The pending-account screen no longer displays development sign-in credentials.

## Motion and dependencies

React Native's built-in `Animated` native driver handles press, reveal, and sheet
transforms; Gesture Handler 2.31.2 drives native sheet-drag events. Expo Haptics
56.0.3 provides restrained feedback after confirmed results. These dependencies
match the Expo 56 compatibility map and use MIT licenses. Press, state, and sheet
timing tokens are 120/180/260 ms. Native stack gestures remain native.
Reduced-motion state has one shared subscription and suppresses transitions.

No experimental shared-element dependency, animation asset service, analytics
SDK, new environment variable, API endpoint, permission, or feature key is added.
Both repositories now use a pinned pnpm version and a matching pnpm lockfile.

Expo Doctor still reports the underlying SDK 56 Hermes version as affected by
an upstream memory regression (21/22 checks pass). The new motion components
avoid the documented trigger: neither Reanimated nor Worklets is installed or
imported in the final app. Their temporary Jest mocks/resolver were removed.
This does not patch Hermes itself. A future SDK 57+ upgrade and native memory
profiling remain separate production work. See the
[maintainer diagnosis](https://github.com/expo/expo/issues/46519) and
[official release notes](https://expo.dev/changelog/sdk-57#known-regressions).

Clean cloud installation exposed two packaging issues: the obsolete npm lockfile
and imports relying on transitive packages. Both repositories now declare
`@react-navigation/elements` and the Expo 56-compatible `expo-constants` directly.
The parity verifier checks direct imports, matching dependency declarations,
lockfile parity, and pinned EAS package-manager versions before future builds.
Setup/QA documentation and release pruning use pnpm consistently.

## Verification and delivery checklist

- [x] Existing source/route/component inventory and initial rendered baselines.
- [x] Shared design system, navigation, role screens, and Arabic catalogue migrated.
- [x] Android/iOS source and dependency synchronization.
- [x] Final Android and iOS typechecks and regression suites.
- [x] Required ERP root typecheck and parity verification.
- [x] Final rendered route review and phone/tablet interaction review.
- [x] Android export, cloud build, APK download/checksum, and emulator installation.
- [x] Record exact evidence, remaining device checks, and the build artifact.

Run `node scripts/mobile/verify-ui-parity.mjs` from the ERP repository to verify
source/configuration parity, registered Arabic copy, and untranslated internal
comparison values. API and provider-backed Assistant verification is documented
separately in the read-only assistance report; this redesign does not expand
Assistant write authority.

Verified repository evidence:

| Check                                     | Result                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Android and iOS TypeScript                | Pass after the clean-build dependency correction                                                                                              |
| Android and iOS Jest                      | 34 suites / 125 tests pass in each checkout                                                                                                   |
| ERP root TypeScript                       | Pass                                                                                                                                          |
| Expo dependency compatibility             | Up to date                                                                                                                                    |
| Native parity verifier                    | 267 source files, 1,127 translated copy keys, 29 direct imports; no errors                                                                    |
| All-role rendered route review            | 137 cases; no runtime errors, document overflow, or business writes                                                                           |
| Additional responsive review              | 40 cases at 360, 430, 768, and 1,366 pixels; tab bounds included                                                                              |
| Focused phone/tablet interactions         | Search, invalid-date feedback, calendar/time selection, and Arabic draft retention pass at 360 and 1,024 pixels                               |
| Android and iOS release JavaScript export | Pass; Hermes bundles generated                                                                                                                |
| Android EAS `demo` build                  | Finished successfully; version 1.1.0 / code 27                                                                                                |
| Native Android smoke                      | Update installation, cold launch, real dev Keycloak form, landscape, and 1.5 system font scale reviewed; no detected process JavaScript crash |

The rendered review uses isolated synthetic API fixtures and real source/routes.
It covers empty/error paths as well as representative records; it does not prove
live business transactions or provider delivery. Evidence is retained under
`output/mobile-transformation/` and `output/readonly-transform-*.log`.

## Android dev artifact

- [Download the APK](https://expo.dev/artifacts/eas/LH5m8fUYgO22AMc3ue0UhcN2YpTbWGekIRyKwXmS9wc.apk)
- [Expo build record](https://expo.dev/accounts/supplify-team/projects/supplify-mobile/builds/b5bcb76b-d869-4c7c-9844-046348170400)
- Build ID: `b5bcb76b-d869-4c7c-9844-046348170400`.
- API: `https://api-dev.supplifyerp.com`; identity: `https://keycloak-dev.supplifyerp.com`.
- Local file: `output/mobile-transformation/android/Supplify-dev-ui-2026-11-15.apk` (93,949,408 bytes).
- SHA-256: `1f82bdd20a0c96b1afd93a2bfd7d3162bc343b760015fcc40b2b7503c180bac9`.

APK inspection confirms both development URLs in its embedded bundle and no
Reanimated/Worklets native libraries. It installed over the existing emulator
app without clearing data. The cold launch returned `Status: ok`; the real
development Keycloak form loaded. No credentials were entered and no business
transaction was executed. Canceling sign-in returns the existing cancellation
notice. Emulator display settings were restored after layout review.

Native smoke evidence is scoped to the signed-out shell and identity handoff.
Signed-in operational workflows, physical camera/GPS/push, and native assistive
technology still require device UAT. The 137 route fixtures and phone/tablet
interaction checks provide source-level coverage, not native transaction proof.

## Release boundaries

No production backend deployment, store submission, automatic purchase, or
release-branch promotion is part of this Android dev delivery. Retain the
existing dev → preprod → prod promotion workflow for a later release. Physical
iOS, camera/GPS/push behavior on physical Android hardware, and a complete native
screen-reader/performance audit must be reported separately from browser QA.
