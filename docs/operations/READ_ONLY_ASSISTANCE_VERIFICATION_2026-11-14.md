# Read-only assistance verification - 2026-11-14

Implemented locally in the ERP, Android, and iOS worktrees. This record is not a
deployment or an installed-device sign-off. The larger action-taking design remains
in [the deferred roadmap](../features/ai-assistant-action-roadmap.md).

## Resulting behavior

- Assistant conversations restore and paginate within the signed-in user's workspace.
  Answers carry server-provided source status, retrieval time, and limited-result
  warnings. Starter questions follow available tools. Catalog, supplier workload,
  reservations, and availability are read-only and domain-permission gated.
- Uploaded images and actual PDF bytes reach the configured provider after upload
  ownership, file-type, size, and clean-read checks. Recent document follow-ups
  recheck ownership. Invalid tool arguments are rejected; unavailable results are
  not presented as verified sources. Historical references never replace fresh facts.
- Reorder guidance accounts for measured consumption, complete local calendar days,
  branch stock scope, physical receiving, dated incoming supply, and pack rounding.
  Unknown supply and insufficient evidence require review. Zero need stays zero.
  Assistant answers and inventory cards consume the same deterministic snapshot.
- AI reorder review runs only when requested. Manual list selection is preserved;
  wait/review results cannot submit a purchase. Both native clients display shared
  guidance and use existing manual catalog/cart/list handoffs.
- Supplier follow-ups expose their timing evidence and consolidate repeated cadence
  records. Multiple lines on one order do not count as multiple ordering intervals.
  A longer gap is not labeled as a predicted customer churn probability.

No migrations, dependencies, environment variables, feature keys, or permission keys
were added. Existing business-write controls remain in their domain workflows.

## Automated evidence

| Check                                      | Result                                                                   | Local evidence                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Full API suite during implementation       | 394 suites, 2,596 tests passed                                           | `output/readonly-api-all.log`                                                  |
| Full web suite during implementation       | 160 suites, 612 tests passed                                             | `output/readonly-web-all.log`                                                  |
| Final affected API regressions             | 10 suites, 89 tests passed                                               | `output/readonly-api-final.log`                                                |
| Final affected web regressions             | 3 suites, 31 tests passed                                                | `output/readonly-web-last.log`                                                 |
| Android full suite after final source sync | 32 suites, 119 tests passed                                              | `output/readonly-android-tests-final.log`                                      |
| iOS full suite after final source sync     | 32 suites, 119 tests passed                                              | `output/readonly-ios-tests-final.log`                                          |
| ERP `pnpm typecheck`                       | Passed                                                                   | `output/readonly-root-typecheck.log`                                           |
| Android and iOS `pnpm exec tsc --noEmit`   | Both passed                                                              | `output/readonly-android-type-final.log`, `output/readonly-ios-type-final.log` |
| Production web build including TypeScript  | Passed                                                                   | `output/readonly-web-build-last.log`                                           |
| API/web lint                               | No errors; existing API warnings remain                                  | `output/readonly-lint-final.log`                                               |
| Isolated PostgreSQL 16 service/SQL check   | 233 migrations; 13 fixture checks passed                                 | `output/readonly-database-result.json`                                         |
| Chromium and WebKit responsive checks      | 10 scenarios, 390/768/1024/1194 px, English/Arabic and both tenant roles | `output/readonly-browser-results/results.json`                                 |

Full suites preceded the final small fixes; affected regressions were rerun after
those changes. The native suites and typechecks cover both matching source trees.
The verification artifacts live locally under `output/`; they contain synthetic
fixtures and are not runtime application dependencies.

The database fixture proves 10 ordered minus 4 physically received equals 6 incoming;
42 expected usage minus 5 on hand minus 6 incoming equals 31 net need, rounded to 32
for a two-unit pack. It also checks assistant/panel agreement, currency separation,
branch-stock isolation, catalog/reservation SQL, and distinct-order supplier cadence.
The temporary database container was removed after the check.

Browser checks use actual source components and synthetic API responses. They verify
no page overflow, runtime errors, automatic AI review, or automatic list writes at
the tested sizes. Screenshots were inspected. They do not constitute a complete
accessibility audit or a test of live tenant data.

## Remaining release validation

- Run a deployed-provider pilot for bilingual answer quality, document/model
  compatibility, latency, and quota behavior with real permissions.
- Test installed Android/iOS builds and physical iPad Safari, including keyboard,
  document selection, source navigation, and account/workspace switching.
- Measure forecast/query performance with production-sized data and complete an
  accessibility audit before making broad accessibility claims.

No hosted environment or installed native binary was changed by this implementation.
See the dated [parity record](../mobile/MOBILE_FEATURE_PARITY.md),
[Assistant behavior](../features/ai-assistant.md), and
[reorder behavior](../features/ai-smart-reorder.md).
