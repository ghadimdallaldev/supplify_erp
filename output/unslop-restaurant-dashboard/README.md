# Restaurant dashboard design review — 2026-11-16

Approved scope: keep Supplify purple and the existing section order; improve
spacing and typography, clarify spend, compact phone order rows, and improve
Arabic presentation. Changes apply to the restaurant web dashboard. Existing
queries, calculations, actions, permissions, and subscription gates are retained.

## Direction

- **Product:** restaurant purchasing, supplier orders, and stock oversight.
- **Character:** practical, measured, reassuring.
- **World:** kitchen purchasing records and delivery receipts.
- **Moments:** the existing spend data carries the strongest visual emphasis.
- **Signature:** receipt-style alignment of order references and amounts.

## Audit and changes

1. **Spacing:** the original dashboard mixed tight card padding with tall,
   vertically split phone order rows. Consistent 16/20px padding, 20/24px section
   gaps, and compact aligned rows establish a purchasing ledger rhythm.
2. **Color:** competing KPI stripes and icon colors are replaced by neutral
   surfaces and restrained purple accents. Reorder row position no longer implies
   urgency; real order status and expired-stock semantics remain.
3. **Icons:** decorative KPI icon tiles are removed. Calendar icons use the
   existing line icon set and a consistent stroke within the dashboard.
4. **Copy:** restaurant role headings, descriptions, KPI captions, and reorder
   source labels are translated. Section labels use sentence case. Existing
   metric scopes and recommendation-source conditions are retained.
5. **Type:** tiny tracked headings become 15px, medium-weight sentence-case
   labels; supporting text is generally 12–14px. Arabic uses bundled IBM Plex
   Sans Arabic with zero tracking. Mixed references and monetary values are
   isolated, with tabular numbers and responsive metric sizing.
6. **Layout:** section order is retained. The spend chart gets more room at
   desktop widths; reorder suggestions span the row where three columns would
   crowd the chart. Phone orders keep supplier/reference and amount/status
   together horizontally.
7. **Details:** panels use 12px radii, controls use 8px, and keyboard focus is
   visible. Calendar filter selects now have translated accessible names. The
   filter hint uses readable neutral text in both themes.
8. **Visuals:** the real daily series is drawn as a straight line with date and
   currency axes in a 240px chart. Existing totals, periods, source attribution,
   empty states, and tooltips remain. No imagery or invented data was added to
   the product.
9. **Motion:** the chart has no entrance animation; feedback uses short named
   color/background transitions and respects reduced motion.

## Evidence

Isolated Playwright fixtures intercept API/auth traffic. Preview data is synthetic;
the review did not access a live account or submit an ordering mutation.

| Check                                     | Result                                              |
| ----------------------------------------- | --------------------------------------------------- |
| Required `pnpm typecheck`                 | Passed                                              |
| Dashboard, calendar, currency unit suites | 4 files, 19 tests passed                            |
| Targeted ESLint                           | Passed without warnings                             |
| Web production build                      | Passed                                              |
| `git diff --check`                        | Passed                                              |
| Responsive browser checks                 | English: 320, 390, 768, 1440px; Arabic: 390, 1440px |
| Dark CSS theme                            | 1440px English                                      |
| Spend period control                      | 7-day selection updates in all seven scenarios      |

The final DOM/accessibility verification is in [verified-review.json](verified-review.json):
page overflow, metric overflow, runtime errors, loaded Arabic font, chart output,
and axe WCAG 2 A/AA and 2.1 AA results are recorded per scenario. Axe is scoped
to the dashboard, including its calendar; this is not a whole-application
accessibility certification. Arabic copy still benefits from native-speaker review.
The calendar fixture exercises its existing plan-locked state, not live events.

Before: [desktop English](before-1440-en.png), [phone English](before-390-en.png),
[desktop Arabic](before-1440-ar.png).

Reviewed presentation: [desktop English](final-1440-en.png),
[phone English](final-390-en.png), [phone Arabic](final-390-ar.png),
[dark theme](final-1440-en-dark.png). These captures precede the last small
Arabic metric sizing and calendar hint contrast corrections; `verified-review.json`
checks the corrected source without another screenshot pass.

Reproduce with the web app running on `127.0.0.1:5175`:

```powershell
node output/unslop-restaurant-dashboard/review.mjs verified --verify-only
```

Build warnings concern existing environment placeholders, browser-data age,
Tailwind utility ambiguity, and mixed static/dynamic locale imports. No dependency
or environment variable was added for this change. Both mobile repositories are
skipped under the documented web-only presentation exception in the parity log.

Direction and craft workflow adapted from **unslop by Damir Sokolovsky
([@heydamir](https://x.com/heydamir))**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Arabic font license: [SIL Open Font License](../../apps/web/static/fonts/IBMPlexSansArabic-OFL.txt).
