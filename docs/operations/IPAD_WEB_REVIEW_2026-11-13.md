# iPad desktop-mode web and guest-flow review — 2026-11-13

Changes are local source changes. This review does not claim a production deployment
or certify zero defects. The user's live URL/workspace and physical-device
screenshots were not supplied during this pass.

## Reported defects

| Report                                               | Finding and repair                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty invoice details / PDF does nothing             | SQL referenced nonexistent `restaurant.contact_name`, `restaurant.email`, and `app_user.name`. Use supported contact/display fields. PDF generation works with zero or populated lines. Failed detail loads now offer retry; genuinely absent seeded line items have an explicit message. |
| Invoice close touches Make Payment                   | Actions moved below the invoice heading; shared dialog headers reserve close-button space. Tables scroll inside the dialog and totals fit narrow widths.                                                                                                                                  |
| Payment/date/supplier/report controls uneven on iPad | Shared inputs/selects can shrink within their cells; date/time native appearance/edit padding normalized. Product filters use labeled rows, aligned search/favorites, full-width price controls, and keyboard-operable tag buttons.                                                       |
| New-deal count but empty deals                       | Discovery incorrectly required every deal to have an active paid boost. Restore documented follower/explicit-target organic visibility; banner uses the same eligibility plus recency/dismissal. Exhausted deals are excluded from both.                                                  |
| Supplier dropdown only has All Suppliers             | Options now derive from the complete eligible result, independently of the selected supplier. No eligible offers still legitimately has no supplier choices; errors show retry rather than a false empty state.                                                                           |
| Product details say not found                        | Restaurant supplier-authorization SQL referenced an undefined `s` alias. Bind the supplier in both follow/history branches, preserve tenant checks, and distinguish server failure from 404 on web.                                                                                       |
| Receiving quality has many decimals                  | Display quality to one decimal without changing stored values.                                                                                                                                                                                                                            |
| Reorder assistance reliability                       | Real database low-stock/pack-size/tenant/snooze drill; cart handoff retains quantity and applies MOQ/pack rules; multi-list selection is explicit.                                                                                                                                        |
| Reservation board / public booking                   | Wider tablet columns, larger actions, stale table selection reset, active booked-cover count; public responsive panels and guarded availability/confirmation. Waitlist retains a future slot from the chosen date.                                                                        |
| Guest menu and rewards                               | Branch-specific menu, modifier revalidation, storage fallback, responsive cart actions, guest logout privacy, rewards progress/cap/retry, and keyed duplicate-safe checkout.                                                                                                              |

## Verification

| Check                              | Result                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Full API suite                     | 390 files / 2,564 tests pass                                                             |
| Full web suite                     | 159 files / 606 tests pass                                                               |
| Final deal-refresh regressions     | 3 files / 4 tests pass after enabling focus/reconnection listeners                       |
| Android and iOS                    | Each: 30 suites / 116 tests and TypeScript pass; seven changed files match byte-for-byte |
| Root typecheck / production builds | Pass                                                                                     |
| Lint                               | Pass; web has zero warnings; API's 1,716 warnings match the preceding pilot baseline     |
| Real SQL drills                    | Six checks pass against 233 migrations in disposable PostgreSQL 18                       |

Both browser engines pass 37 recorded checks each: 33 loaded-screen/width cases
and four interaction checks (PDF download, expired-deal focus refresh, reorder
quantity handoff, and duplicate-safe uncertain checkout retry). No runtime errors
or horizontal overflow were recorded in these fixtures.

The six SQL checks include exactly one rewards debit and ledger entry under
simultaneous keyed checkout requests. The disposable container and anonymous volume
were removed after verification.

- Full API and web suites, root typecheck, lint/build, and native parity checks are recorded in `output/ipad-*.log`.
- `scripts/qa/verify-ipad-data.mjs` runs only against `localhost:55439/ipad_qa`.
  All numbered migrations are applied to a disposable PostgreSQL 18 container.
  Synthetic fixtures verify invoice/PDF, product authorization, organic deal
  discovery/banner consistency, reorder rules/snooze, and concurrent guest checkout.
- Guest checkout stores replay metadata transactionally. Tests cover one order/receipt
  from simultaneous requests, retry, and rejection of changed data under the same key.
- Browser screenshots/results: `output/ipad-review-2026-11-13/`, WebKit 26 and Chromium,
  touch enabled with desktop mode at 768, 1024, and 1194 CSS-pixel widths.
- Browser API responses are synthetic fixtures; the database drill tests real SQL.
  WebKit on Windows is not a physical iPad and does not reproduce every native iPadOS
  date picker/download-sheet behavior. A physical Safari pass remains a release check.
- Deal freshness checks expire the fixture offers and dispatch focus, then require
  both the old banner and offers to disappear. The browser harness waits for loaded,
  visible actions rather than accepting a loading skeleton as a layout pass.

## Release order and limits

Development follow-up: the user identified dev as the affected environment.
See [November 14 Development rollout](./DEV_IPAD_ROLLOUT_2026-11-14.md) for
live-data reproduction, migration application and deployed verification.

1. Review and deploy API with migration `0232_consumer_checkout_idempotency.sql`.
2. Verify the target environment's invoice/PDF and keyed guest checkout behavior.
3. Release web; native deal/checkout contract source is mirrored in both sibling repos.
4. Verify the user's actual iPad/workspace, including unavailable/deleted seeded data,
   a real reservation confirmation and guest checkout/rewards receipt.

No production data was changed by this review. The earlier decision to leave hosted
backup configuration pending remains in effect. Keycloak/SMTP settings and the pilot
email tests were outside this pass. Native binaries were not rebuilt here.

On checkout reload, the browser key is reusable for the same reconstructed payload
when persistent storage is available. The current-page uncertain-order snapshot is
not a cross-device recovery system; guests should check their order/receipt before
starting a changed order after closing the page.
