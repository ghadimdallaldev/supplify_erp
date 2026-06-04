# PWA & Mobile Readiness Audit

Last updated: 2026-05-28

## PWA status

| Item                      | Status                                                                         |
| ------------------------- | ------------------------------------------------------------------------------ |
| Web app manifest          | Done — `apps/web/static/manifest.webmanifest`                                  |
| Service worker            | Done — `apps/web/static/sw.js` (extends existing push handler)                 |
| Installable (standalone)  | Configured — `display: standalone`, icons 192/512                              |
| Offline fallback          | Done — `apps/web/static/offline.html` + in-app `OfflineBanner`                 |
| Safe static caching       | Done — JS/CSS/fonts/images + precache list; **no** `/api/` or `/auth/` caching |
| SW registration           | Done — `src/lib/registerServiceWorker.ts` (single registration on load)        |
| Theme / background colors | `#5b21b6` / `#f1f5f9`                                                          |
| Viewport / mobile meta    | Done — `index.html` (`viewport-fit=cover`, apple-mobile-web-app-\*)            |

## Files added/changed

### Added

- `apps/web/static/manifest.webmanifest`
- `apps/web/static/offline.html`
- `apps/web/static/favicon.svg` (copied at build)
- `apps/web/static/icons/icon-192.png`
- `apps/web/static/icons/icon-512.png`
- `apps/web/static/icons/icon-maskable-512.png`
- `apps/web/scripts/generate-pwa-icons.mjs`
- `apps/web/src/lib/registerServiceWorker.ts`
- `apps/web/src/hooks/useOnlineStatus.ts`
- `apps/web/src/components/OfflineBanner.tsx`
- Tests: `pwaManifest.test.ts`, `pwaServiceWorker.test.ts`, `registerServiceWorker.test.ts`, `Sidebar.mobile.test.tsx`, `DriverDeliveriesPage.mobile.test.tsx`, `useOnlineStatus.test.ts`

### Changed

- `apps/web/static/sw.js` — install/activate/fetch caching + offline navigation fallback
- `apps/web/index.html` — manifest link, theme-color, PWA meta tags
- `apps/web/package.json` — `pwa:icons` script, build runs icon generation, `sharp` devDep
- `apps/web/tailwind.config.js` — `xs: 375px` breakpoint
- `apps/web/src/main.tsx` — SW registration
- `apps/web/src/index.css` — safe-area insets, standalone tap highlight
- `apps/web/src/components/Layout.tsx` — offline banner, `100dvh`, mobile nav (existing)
- `apps/web/src/components/Header.tsx` — mobile header, notification dropdown, driver page title
- `apps/web/src/components/Sidebar.tsx` — narrower mobile drawer width
- `apps/web/src/pages/DriverDeliveriesPage.tsx` — mobile-first layout, large status buttons, maps link
- `apps/web/src/pages/ReceivingPage.tsx` — stacked cards, touch-friendly receive dialog
- `apps/web/src/pages/OrderDetailPage.tsx` — responsive order item grid

## Installability checklist

- [x] Valid manifest linked from HTML
- [x] `name`, `short_name`, `start_url`, `display`, `theme_color`, `background_color`
- [x] PNG icons 192×192 and 512×512
- [x] Service worker registered on HTTPS/localhost
- [x] `fetch` handler does not cache authenticated API responses
- [x] Offline page for navigation failures
- [ ] Lighthouse PWA audit run locally (see notes below)

## Responsive pages audited

| Page / flow               | Widths checked (code review + tests) | Notes                                                                               |
| ------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| Layout / sidebar / header | 320–1024px                           | Collapsible sidebar, compact header, full-width notification panel on small screens |
| Driver deliveries         | 320px+                               | Card layout, 44px min touch targets, route stop maps link                           |
| Receiving                 | 320px+                               | Stacked order cards, full-width receive CTA, single-column dialog fields            |
| Reservations / host       | 375px+                               | Existing responsive grids; summary cards stack on mobile                            |
| Fulfillment / dispatch    | 375px+                               | Existing card-based dispatch rows, responsive tab grid                              |
| Orders / order detail     | 375px+                               | Item grid stacks on small screens                                                   |
| Notifications (header)    | 320px+                               | Fixed-position dropdown on mobile                                                   |

## Driver mobile status

- Driver RBAC: only **My Deliveries** nav (existing — `rbacGating.test.tsx`)
- Assigned delivery list with refresh
- Active route stops with address, maps link, item summary
- Large status buttons: Out for delivery, Delivered, Failed, Rescheduled
- Fixed invalid `sonner` toast import → `react-hot-toast`
- No supplier admin clutter in driver-only nav

## Receiving mobile status

- Pending orders as cards (not wide tables)
- Receive Now button full-width on mobile (`min-h-[44px]`)
- Receiving dialog: single-column fields on narrow screens
- History stats stack on very small widths
- Feature lock / upgrade states unchanged (existing `FeatureLockedCard`)

## Reservations mobile status

- Date picker + Today action wrap on small screens
- Summary KPI cards: 1→2→4 column grid
- Waitlist rows stack actions below guest info
- Board/table builder uses existing responsive patterns

## Fulfillment mobile status

- Tab bar: 2 cols mobile → 5 cols desktop (existing)
- Dispatch uses card rows (`DispatchOrderRow`) not tables
- Warehouse filter stacks vertically on mobile

## Orders mobile status

- Order detail line items: 1 col mobile → 4 col desktop
- Status badges and actions use flex-wrap patterns (existing)

## Offline behavior

1. **Navigation offline**: service worker serves `/offline.html` when network fails
2. **In-app**: `OfflineBanner` sticky banner when `navigator.onLine === false`
3. **API calls**: not cached; fail normally when offline (auth/session unchanged)
4. **Logout**: unchanged — session cookies cleared server-side as before

## Push notification status

- **Web Push**: partially implemented — existing VAPID subscription flow (`usePushNotifications.ts`) and push events in `sw.js`
- Requires HTTPS, user permission, and server VAPID keys configured
- Not enabled by default; no fake push UI added
- **Future work**: unified push opt-in from Settings, background sync for driver status queue

## Known limitations

1. **TypeScript `pnpm build`**: full `tsc && vite build` fails on pre-existing TS errors unrelated to this work; **`vite build` succeeds** and produces installable assets
2. **Lighthouse**: not run in CI here — run locally against `pnpm preview` on HTTPS or localhost
3. **iOS Safari**: add-to-home-screen works; push on iOS requires 16.4+ and user gesture
4. **Reservations table builder**: complex floor-plan editor remains desktop-first by design
5. **No background sync** for offline delivery status updates (network required)
6. **Driver board API** does not expose restaurant phone — maps + area only (no API change per scope)

## Manual QA checklist

1. [ ] Open app at 320px width
2. [ ] Login as Driver — confirm only **My Deliveries** in nav
3. [ ] Update delivery status from mobile
4. [ ] Login as Restaurant receiving staff — receive an order from mobile
5. [ ] Login as Restaurant host — manage today's reservation/waitlist from mobile
6. [ ] Login as Supplier fulfillment staff — use Driver Dispatch and Routes from mobile
7. [ ] Chrome DevTools → Application → Manifest — verify installability
8. [ ] Add app to home screen (Android Chrome / iOS Safari)
9. [ ] Launch from home screen — confirm standalone chrome and auth/session
10. [ ] Confirm no horizontal scroll on major pages
11. [ ] DevTools → Network → Offline — reload; confirm offline page or banner
12. [ ] Confirm impersonation banner visible on mobile
13. [ ] Confirm desktop layout still looks good at 1024px+

## Lighthouse / PWA notes

To run locally:

```bash
cd apps/web
pnpm vite build
pnpm preview
# Chrome → Lighthouse → Progressive Web App (use incognito, localhost)
```

Expected passing criteria after this change:

- Manifest present with required fields
- Service worker registered
- Offline start URL / fallback
- Themed address bar (`theme-color`)
- Tap targets on driver/receiving primary actions ≥ 44px

## Automated tests

```bash
cd apps/web
pnpm test:run src/lib/pwaManifest.test.ts src/lib/pwaServiceWorker.test.ts src/lib/registerServiceWorker.test.ts src/components/Sidebar.mobile.test.tsx src/hooks/useOnlineStatus.test.ts src/pages/DriverDeliveriesPage.mobile.test.tsx src/hooks/rbacGating.test.tsx
```

## Production build (`tsc` + Vite)

From monorepo root (required for CI and release — includes TypeScript check):

```bash
pnpm build
```

This runs `tsc` then `vite build` in `apps/web` (PWA icons are generated first). **`pnpm vite build` alone skips `tsc`** and is not sufficient for a full green build.

From `apps/web` only:

```bash
pnpm build
```

TypeScript fixes (2026-05-28): socket options typing, fulfillment dispatch panel, RTK tag types, reservation board hook options, shared route types — see git history; no PWA asset or manifest changes in that pass.

## Build-only (bundle, no `tsc`)

```bash
cd apps/web
pnpm vite build
```
