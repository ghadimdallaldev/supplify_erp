# Archived scripts (one-off)

Moved from active script folders on 2026-06-12. **Do not run** on current databases — behavior is superseded by numbered SQL migrations (`apps/api/db/migrations/`) or modern seed flows (`seed-full.mjs`, `prodlike.seed.js`).

## Layout

| Folder | Source | Contents |
|--------|--------|----------|
| `apps-api/` | `apps/api/scripts/` | Schema patches, wave-2/4 refactor tools, ad-hoc data backfills, debug scripts |
| `apps-web/` | `apps/web/scripts/` | Admin i18n codemods (completed 2026-06) |
| `repo-scripts/` | `scripts/` | Monolith split utilities (wave2/wave3) |

## Restore

If you need a script for historical reference:

```bash
git mv docs/archive/scripts/one-off/apps-api/<name> apps/api/scripts/<name>
```

Prefer reimplementing against current schema rather than running archived files as-is.
