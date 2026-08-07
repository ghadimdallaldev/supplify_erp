# Supplify ERP — Claude Code Instructions

## Project

Supplify ERP is a multi-tenant restaurant–supplier marketplace monorepo.
Stack: React/Vite (`apps/web`), Node/Express (`apps/api`), PostgreSQL, Keycloak, Redis, S3.

Full technical context: `docs/onboarding/`, `docs/architecture/`, `docs/guides/setup.md`.

---

## ⛔ HARD STOP — Mobile Parity (non-negotiable)

**Every change to the API, auth, RBAC, types, or feature behavior MUST be propagated to BOTH mobile repos before the task is considered done:**

- `C:/myProjects/supplify-mobile` (React Native / Expo — Android)
- `C:/myProjects/supplify-mobile-ios` (React Native / Expo — iOS)

This is not optional. Do not mark any task complete, do not close any loop, do not respond "done" until mobile parity is verified or explicitly documented as not applicable.

### What triggers a required mobile update

| Change type                                       | What to do in both mobile repos                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| New or changed API endpoint                       | Update API client calls, request/response types                                                          |
| Auth / session / token changes                    | Update auth flow, token storage, session guards                                                          |
| RBAC / permission key added or changed            | Update permission checks and navigation guards                                                           |
| Plan feature key added or changed                 | Update feature gates and upgrade prompts                                                                 |
| Order / fulfillment lifecycle change              | Update restaurant, supplier, driver flows                                                                |
| GPS / ETA / delivery tracking change              | Update tracking hooks and ETA display helpers                                                            |
| Notification event or payload change              | Update notification handlers and deep-link routing                                                       |
| New env var required by mobile                    | Add to `C:/myProjects/supplify-mobile/.env.example` and `C:/myProjects/supplify-mobile-ios/.env.example` |
| Type or interface change in `apps/web/src/types/` | Port the type change to mobile                                                                           |

### What does NOT require a mobile update

- Admin-only features (no mobile admin surface)
- Web-only UI changes (layout, animation, CSS)
- Server-side cron, DB migration, or infra changes with no client contract change

When a change is web/admin-only and mobile is not affected, you **must** add a dated entry to `docs/mobile/MOBILE_FEATURE_PARITY.md` under the current date explaining why mobile was skipped.

---

## ⛔ HARD STOP — Docs Update (non-negotiable)

**Every substantive change must be reflected in the relevant documentation before the task is considered done.**

Required docs checks after any change:

1. `docs/mobile/MOBILE_FEATURE_PARITY.md` — Add a dated entry for the change (implemented or skipped-with-reason)
2. Domain docs in `docs/features/`, `docs/architecture/`, `docs/operations/` — Update if the change affects behavior documented there
3. `docs/guides/environment-variables.md` — Add any new env vars
4. `docs/admin/feature-flags.md` — Add any new feature keys
5. `docs/architecture/rbac-overview.md` — Add any new permission keys or roles
6. Onboarding docs (`docs/onboarding/`) — Update counts (migrations, keys, routes) if they change

---

## Mobile Parity Completion Checklist

Before declaring any API/auth/feature task complete, confirm each item:

- [ ] Both `supplify-mobile` and `supplify-mobile-ios` have been updated (or skip documented)
- [ ] Types are in sync with `apps/web/src/types/index.ts`
- [ ] Mobile typecheck passes: `cd C:/myProjects/supplify-mobile && npx tsc --noEmit`
- [ ] `docs/mobile/MOBILE_FEATURE_PARITY.md` has a dated entry
- [ ] All affected domain docs are updated

---

## Key paths

| What             | Where                                    |
| ---------------- | ---------------------------------------- |
| API routes       | `apps/api/src/routes/`                   |
| Permission keys  | `apps/api/src/lib/permission-keys.js`    |
| Feature keys     | `apps/api/src/lib/feature-keys.js`       |
| Role matrix      | `apps/api/src/lib/role-matrix.js`        |
| Web types        | `apps/web/src/types/index.ts`            |
| Mobile (Android) | `C:/myProjects/supplify-mobile`          |
| Mobile (iOS)     | `C:/myProjects/supplify-mobile-ios`      |
| Parity log       | `docs/mobile/MOBILE_FEATURE_PARITY.md`   |
| Parity checklist | `docs/mobile/MOBILE_PARITY_CHECKLIST.md` |

---

## General rules

- Run `pnpm typecheck` after any TypeScript change.
- Run the relevant test suite (`pnpm test:api` or `pnpm test:web`) after any logic change.
- Never commit directly to `main` or `prod` branches.
- Migration filenames follow `NNNN_description.sql`; never edit a committed migration.
- Keycloak runs on port **8180** locally (not 8080). PostgreSQL on **5432**.
