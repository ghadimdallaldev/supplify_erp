# Admin shell revamp (2026-09-14)

Scope: the chrome every platform-admin screen shares (`/app/admin/**` and `/app/settings` for
platform admins). Tab panels (Tenants, Plans, Health, …) were not rewritten; they inherit the new
tokens and shell behaviour.

Source: `apps/web/src/components/admin/shell/` and the `/* —— Admin shell —— */` block in
`apps/web/src/index.css`.

## What changed

### Dark theme actually darkens

`Settings → Admin preferences → Theme` toggles the `.dark` class on `<html>`. Before this change
only the shadcn HSL tokens flipped; the Supplify hex tokens the admin shell and most ERP surfaces
read (`--bg`, `--surface`, `--app-border`, `--text`, `--brand-pale`, `--red-pale`, …) stayed on
their light values. `.dark` now redefines the whole hex family plus `color-scheme: dark`.

Guideline: never hard-code Tailwind palette colours (`bg-red-50`, `text-slate-900`) in admin
components. Use the tokens; they are the only thing that flips.

### Sidebar

- Collapsible icon rail on `lg+`. The toggle lives in the sidebar footer, state persists in
  `localStorage["supplify.admin.sidebarCollapsed"]` (per browser, not synced).
- In rail mode labels hide, links gain `aria-label`, and a tooltip appears on hover/focus.
  Collapsible groups (Billing, Growth) render expanded because their summary label is hidden.
- Workspace switcher (Platform / Suppliers / Restaurants / Settings) is a vertical list instead of
  a 2×2 grid.
- Active item shows a brand indicator bar (`::before`, logical inset so RTL mirrors).
- Mobile drawer: Escape closes it, body scroll locks while open, backdrop fades in.
- Brand lockup switches wordmark colour with the theme via `useIsDarkTheme()`.

### Top bar

- Sticky with a translucent blur background (`color-mix` with a solid fallback).
- Breadcrumb `Workspace › Section` above the page title (hidden on `xs`).
- Theme toggle (sun/moon). Applies instantly through `applyAdminPreferences` and PATCHes
  `/auth/admin-preferences` with `{ themePreference }`. Failure shows a toast; the local change
  stays.
- Account menu (Radix popover) replaces the avatar-as-logout button: name, email, first admin role
  as a chip, `Account settings` link, `Sign out`. The `logout-button` test id is preserved.

### Content

- `<main id="admin-main-content">` with a `Skip to content` link as the first focusable element.
- Tab panel eases in on section change (`.admin-tab-panel-enter`, 220 ms, disabled under
  `prefers-reduced-motion`).
- `AdminErrorState` uses `--red` / `--red-pale` tokens so it survives dark mode.

## New i18n keys (`admin` namespace, en + ar)

`nav.workspaces`, `nav.collapseSidebar`, `nav.expandSidebar`, `nav.skipToContent`,
`nav.theme.{switchToDark,switchToLight,saveFailed}`,
`nav.userMenu.{open,platformAdmin,settings,signOut}`, `nav.aria.breadcrumb`.

## Test ids

| Test id                   | Element                               |
| ------------------------- | ------------------------------------- |
| `admin-shell`             | Shell root (`data-sidebar-collapsed`) |
| `admin-sidebar`           | `<aside>` (`data-collapsed`)          |
| `admin-sidebar-collapse`  | Rail toggle button                    |
| `admin-portal-nav`        | Workspace switcher                    |
| `admin-nav-<tab>`         | Section link                          |
| `admin-topbar`            | Header                                |
| `admin-breadcrumb`        | Breadcrumb nav                        |
| `admin-theme-toggle`      | Theme button (`aria-pressed`)         |
| `admin-user-menu-trigger` | Avatar button                         |
| `logout-button`           | Sign out item in the account menu     |

Coverage: `apps/web/src/components/admin/shell/AdminShell.test.tsx`.

## Not in scope / follow-ups

- Tab panels still contain hard-coded English strings and a few raw palette colours
  (e.g. `#fef2f2` in the Overview subscription breakdown). They render acceptably in dark mode but
  are not token-pure.
- The non-admin `Sidebar`/`Header` do not share code with the admin shell. A shared rail primitive
  is a possible next step.
- Mobile apps: not applicable, there is no admin surface in the native apps.
