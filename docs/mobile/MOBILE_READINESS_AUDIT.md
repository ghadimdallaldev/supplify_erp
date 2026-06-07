# Mobile Readiness Audit

Date: 2026-06-07  
Purpose: Gate mobile app v1 against existing web/API surface

## Executive summary

The API is **largely mobile-ready** for restaurant ordering/tracking, supplier fulfillment oversight, and driver delivery execution. Auth is OAuth/Keycloak cookie-based on web; mobile will need **token strategy** (likely same BFF with secure storage or native OAuth). Reuse RTK Query endpoint shapes from `apps/web/src/services/api.ts` as the contract baseline.

## APIs mobile can reuse directly

| Domain        | Endpoints                                                                | Notes                                        |
| ------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| Auth          | `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout`                | Mobile needs cookie or bearer migration plan |
| Orders        | `GET/POST /api/orders`, `GET/PATCH /api/orders/:id`                      | Restaurant create + both sides read          |
| Tracking      | `GET /api/orders/:id/tracking`                                           | Restaurant-safe payload already sanitized    |
| Driver        | `PATCH /api/orders/:id/delivery-status`, `POST .../location`, POD routes | Driver-scoped                                |
| Fulfillment   | `GET /api/fulfillment/routes/today`, `PATCH .../stops/reorder`           | Driver route UX                              |
| Restaurants   | `GET/PATCH /api/restaurants/me/delivery-location`                        | ETA destination coords                       |
| Notifications | `GET /api/notifications`, `/unread-count`                                | User-scoped                                  |
| Subscriptions | `GET /api/subscriptions/entitlements`                                    | Plan gating UI                               |

## APIs needing mobile-friendly adjustments

| Endpoint                        | Gap                     | Recommendation                                           |
| ------------------------------- | ----------------------- | -------------------------------------------------------- |
| `GET /auth/me`                  | Large bootstrap payload | Optional `?fields=` or `/auth/me/mobile` slim profile    |
| `GET /api/fulfillment/dispatch` | Heavy board for phones  | `?compact=true` stop list for supplier mobile            |
| Tracking poll                   | 15–30s HTTP poll        | Push/Socket for "driver nearby" (future); poll OK for v1 |
| File uploads (POD)              | Multipart from web      | Confirm React Native / Expo upload compatibility         |
| Admin                           | Not in mobile v1        | Web-only                                                 |

## Web-only (stay on web for v1)

- Admin dashboard (`/api/admin-dashboard/*`)
- Promotions/deals authoring
- Contract pricing matrix editing
- Org/branch structure management
- Reports / advanced analytics
- Staff portal (`/api/staff/*`)

## Mobile v1 required flows

### Restaurant

1. Browse suppliers / catalog (read)
2. Cart + checkout (`POST /api/orders`)
3. Order list + detail
4. Live tracking + ETA (`GET .../tracking`)
5. Manual receive (`/app/receiving` → `POST` receiving APIs)

### Supplier (optional v1 — can be web-first)

1. Orders list + status updates
2. Assign driver / activate route (simplified dispatch)
3. Track active delivery (map optional)

### Driver (priority)

1. Today's deliveries + route stops
2. Status: picked up → on the way → delivered
3. GPS background pings (`POST .../location`)
4. Proof of delivery photo
5. Problem reporting

## Missing endpoints for mobile (nice-to-have)

| Endpoint                              | Why                                                                   |
| ------------------------------------- | --------------------------------------------------------------------- |
| `GET /api/driver/me/deliveries` alias | Single aggregated driver home (today split across fulfillment routes) |
| `GET /api/orders/:id/tracking/events` | Optional lightweight SSE for ETA updates                              |
| Device registration                   | `POST /api/push/devices` if not already used from native              |

## Shared type contracts

- Extract TypeScript types from `apps/web/src/types` and tracking helpers (`restaurantTrackingMessages`, `deliveryEtaDisplay`) into `packages/shared` or OpenAPI-generated client
- Run `pnpm openapi:gen` and publish schema for mobilecodegen

## Auth / session complexity

| Topic          | Current web                        | Mobile implication                                                        |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| Keycloak       | OAuth redirect + HTTP-only cookies | PKCE public client `supplify-mobile`; see `KEYCLOAK_MOBILE_CLIENT.md`     |
| CSRF           | Required on mutating `/api/*`      | Skipped for valid `Authorization: Bearer`; cookie path unchanged          |
| Bearer auth    | N/A                                | `extractAccessToken()` — Bearer first, cookie fallback (`mobile-auth.js`) |
| Mobile refresh | Cookie `POST /auth/refresh`        | JSON `POST /auth/mobile/refresh` with `{ refresh_token }`                 |
| Tenant context | Workspace cookie + branch header   | `X-Active-Tenant-Token` header or `X-Branch-Id` (supplier)                |
| Impersonation  | Admin cookie                       | N/A on mobile v1                                                          |
| STAFF_PORTAL   | Separate realm                     | Out of scope v1                                                           |

**Status (2026-06-07):** Mobile auth unblocker implemented in API — Bearer + mobile refresh + tenant header. Proceed with Expo app (Phase 2).

## PWA baseline (existing)

See `docs/archive/audits/pwa-mobile-readiness-audit.md` — driver/receiving pages already mobile-first. Native app can reuse API contracts validated there.

## Recommendation

**Proceed with mobile v1** focused on **driver app first**, then restaurant order/track/receive. Supplier mobile can follow or remain web for v1. ~~Blockers are **auth token strategy** and **CSRF/session bootstrap**~~ Auth unblocker complete — see `KEYCLOAK_MOBILE_CLIENT.md`.
