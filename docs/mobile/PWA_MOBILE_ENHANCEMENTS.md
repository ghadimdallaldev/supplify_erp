# PWA mobile enhancements

Supplify remains a **Progressive Web App** — these changes improve the existing web/PWA experience on phones without a native app or architecture rewrite.

**Native Expo mobile development is active** in the standalone Android and iOS repositories. They ship driver, restaurant, and supplier flows; the PWA remains the fallback for users without the installed app.

## What was improved

### 1. Driver deliveries (`/app/driver-deliveries`)

- Plain-language labels: **Today's deliveries**, **Next stop**, **Open Maps**, **I'm on the way**, **Delivered**, **Problem**
- GPS states: **Location active**, **Location permission needed**, **Location not updating**
- Sticky bottom action bar on small screens (primary + Problem)
- Larger tap targets (48px+), no horizontal scroll on the page shell
- Clearer empty state when no assignments

### 2. Restaurant tracking & receiving

- **Order detail** tracking panel: larger ETA/map area, lazy-loaded map, **Open in maps** as a full-width mobile button
- Consistent GPS labels (**Live now**, **Location not updating**)
- **Receiving** (`/app/receiving`): banner — _Delivered does not mean received_; existing large confirm buttons retained

### 3. Supplier fulfillment (`/app/fulfillment`)

- Dispatch cards: **Track delivery** button sized for mobile
- **Routes** tab: card layout on phones (table hidden below `sm`); **Route planned** badge label
- **Route detail panel** (360–430px): stacked stop cards with stop number, restaurant, order ref, plain status (**Waiting for preparation**, **Ready for dispatch**, **On the way**, **Delivered**, **Problem**), ETA/GPS when available, full-width primary actions (44px+), secondary address/area behind **Show details**; desktop/tablet row layout unchanged
- Tracking drawer: near full-screen on mobile, map lazy-loaded, polling only while drawer is open

### 4. PWA polish

- Manifest: clearer `name` / `description`, `display_override` for install UX
- Safe-area padding on driver sticky bar (notch/home indicator)
- Service worker unchanged in dev (still clears SW to protect Vite HMR); production SW does not cache authenticated API responses

### 5. Performance

- `LazyDeliveryTrackingMap` — code-splits Leaflet map bundle
- Maps render only when tracking panel/drawer is shown
- Existing `skipPollingIfUnfocused` on tracking queries retained

## Routes & files touched

| Area        | Primary files                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driver      | `DriverDeliveriesPage.tsx`, `DriverDeliveryCard.tsx`, `DriverRoutePanel.tsx`, `DriverDeliveriesHeader.tsx`, `DriverStickyActionBar.tsx`, `driverDeliveryUi.ts` |
| Tracking    | `RestaurantOrderTrackingPanel.tsx`, `DeliveryTrackingDrawer.tsx`, `DeliveryTrackingMap.tsx`, `LazyDeliveryTrackingMap.tsx`, `deliveryTrackingLabels.ts`        |
| Fulfillment | `DispatchOrderRow.tsx`, `FulfillmentRoutesTab.tsx`, `FulfillmentRouteDetailPanel.tsx`, `fulfillmentRouteLabels.ts`                                             |
| Receiving   | `ReceivingPage.tsx`                                                                                                                                            |
| PWA         | `static/manifest.webmanifest`, `index.css`                                                                                                                     |

## How to test on Android / iPhone

1. Run web on **dev** (`pnpm --filter @supplify/web dev`) and open from phone on the same network, or use Railway dev URL.
2. **Driver**: log in as supplier Driver → **My Deliveries** → verify sticky actions, Open Maps, GPS banner.
3. **Restaurant**: open an in-flight order → tracking panel → ETA + map + Receive CTA; **Receiving** tab on a delivered order.
4. **Supplier**: **Fulfillment** → dispatch **Track delivery**; **Routes** tab → open a route on a ~390px viewport and verify stacked stop cards, **Show details**, and primary actions.
5. **Install PWA**: Chrome (Android) → Add to Home screen; Safari → Share → Add to Home Screen. Confirm icon, theme color, and standalone launch.

## PWA limitations

- **PWA only:** No offline order creation or GPS when the PWA is backgrounded/killed (browser/OS limits). The standalone native apps use foreground location while open; persistent background tracking is intentionally not claimed.
- No push notifications on PWA unless already configured server-side
- Native camera/POD capture not added to PWA (existing flows only)
- Table-heavy admin pages unchanged

## Native app status

Expo/native mobile development is **active** in `C:/myProjects/supplify-mobile` and `C:/myProjects/supplify-mobile-ios`. Build from the relevant standalone repository with its checked-in `eas.json` profiles.
