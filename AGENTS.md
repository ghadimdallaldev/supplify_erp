# Supplify ERP — Agent Instructions (Codex / OpenAI Agents / Claude)

## Project

Supplify ERP is a multi-tenant restaurant–supplier marketplace monorepo.
Stack: React/Vite (`apps/web`), Node/Express (`apps/api`), PostgreSQL, Keycloak, Redis, S3.

Full technical context: `docs/onboarding/`, `docs/architecture/`, `docs/guides/setup.md`.

---

## ⛔ MANDATORY — Mobile Parity

**Any change to API behavior, auth, RBAC, types, notifications, or feature flags MUST be propagated to BOTH sibling mobile repos:**

- `C:/myProjects/supplify-mobile` (React Native / Expo — Android)
- `C:/myProjects/supplify-mobile-ios` (React Native / Expo — iOS)

**Do not output "done", "complete", or any task-completion signal until this is satisfied.**

### Triggers (must update both mobile repos)

- New or modified API endpoint → update API client, types
- Auth / session / token change → update auth flow, token storage, guards
- New or changed permission key → update permission guards and navigation
- New or changed feature key → update feature gates
- Order / fulfillment / delivery / GPS change → update affected flows
- Notification event or payload change → update handlers
- New required env var → add to all three `.env.example` files

### Exceptions (mobile skip allowed IF documented)

- Admin-only features
- Web-only UI/layout changes
- Server-side infra changes with no client contract change

When skipping mobile, add a dated entry to `docs/mobile/MOBILE_FEATURE_PARITY.md` explaining why.

---

## ⛔ MANDATORY — Docs Update

**Every substantive change must update relevant docs before the task is complete.**

Priority docs to check:

1. `docs/mobile/MOBILE_FEATURE_PARITY.md` — dated entry always required
2. `docs/features/`, `docs/architecture/`, `docs/operations/` — update if behavior documented there changed
3. `docs/guides/environment-variables.md` — new env vars
4. `docs/admin/feature-flags.md` — new feature keys
5. `docs/architecture/rbac-overview.md` — new permission keys or roles

---

## Completion gate

Before marking any API/auth/feature task done, confirm:

1. Both `C:/myProjects/supplify-mobile` and `C:/myProjects/supplify-mobile-ios` updated (or skip documented)
2. `docs/mobile/MOBILE_FEATURE_PARITY.md` has a dated entry
3. All affected domain docs updated
4. `pnpm typecheck` passes

---

## Key file locations

| What            | Path                                   |
| --------------- | -------------------------------------- |
| Permission keys | `apps/api/src/lib/permission-keys.js`  |
| Feature keys    | `apps/api/src/lib/feature-keys.js`     |
| Role matrix     | `apps/api/src/lib/role-matrix.js`      |
| Web types       | `apps/web/src/types/index.ts`          |
| Android mobile  | `C:/myProjects/supplify-mobile`        |
| iOS mobile      | `C:/myProjects/supplify-mobile-ios`    |
| In-repo Expo    | `mobile-work/`                         |
| Parity log      | `docs/mobile/MOBILE_FEATURE_PARITY.md` |

## General rules

- Keycloak port: **8180** (not 8080). PostgreSQL: **5432**.
- Never edit a committed SQL migration. New behavior = new migration file.
- Never push to `main` or `prod` directly.
- `pnpm` only — no npm/yarn in this repo.
