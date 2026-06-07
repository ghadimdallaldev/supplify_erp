# Keycloak Mobile Client Setup

Configure this **once** in Keycloak before running the Supplify mobile app against your environment.

## Client settings

| Setting                       | Value                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client ID**                 | `supplify-mobile`                                                                                                                            |
| **Client type**               | OpenID Connect                                                                                                                               |
| **Access type**               | Public (no client secret)                                                                                                                    |
| **Standard flow**             | Enabled                                                                                                                                      |
| **Direct access grants**      | Disabled (use PKCE only)                                                                                                                     |
| **PKCE**                      | Required (S256)                                                                                                                              |
| **Valid redirect URIs**       | `supplify://auth/callback` (native); `exp://localhost:8081/--/auth/callback` (Expo Go); `http://localhost:8081/auth/callback` (Expo web dev) |
| **Web origins**               | Leave empty (native app)                                                                                                                     |
| **Post logout redirect URIs** | `supplify://auth/logout` (optional)                                                                                                          |

## Realm

Use the same realm as the web app (default: `Supplify`).

## Mobile environment variables

Set these in `supplify-mobile/.env`:

```env
EXPO_PUBLIC_API_URL=https://your-api.railway.app
EXPO_PUBLIC_KEYCLOAK_URL=https://your-keycloak.railway.app
EXPO_PUBLIC_KEYCLOAK_REALM=Supplify
EXPO_PUBLIC_KEYCLOAK_CLIENT_ID=supplify-mobile
```

## Auth flow (PKCE)

1. Mobile opens Keycloak authorize URL via `expo-auth-session` with PKCE code challenge.
2. User signs in; Keycloak redirects to `supplify://auth/callback?code=...`.
3. Mobile exchanges the code for `access_token` + `refresh_token` directly with Keycloak (public client + PKCE).
4. Mobile stores tokens in `expo-secure-store`.
5. API requests send `Authorization: Bearer <access_token>`.
6. On 401 / expiry, mobile calls `POST /auth/mobile/refresh` with `{ "refresh_token": "..." }` to obtain new tokens (JSON response, no cookies).

## API headers (mobile)

| Header                                 | When                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `Authorization: Bearer <access_token>` | All authenticated requests                                             |
| `X-Requested-With: Supplify`           | Recommended on mutations (optional when Bearer is valid)               |
| `X-Active-Tenant-Token: <jwt>`         | After branch/org switch (same JWT as web `active_tenant_token` cookie) |

## CSRF note

Web cookie sessions still require CSRF + allowed Origin on mutating `/api/*` requests. Valid Bearer tokens skip CSRF (mobile path). Web behavior is unchanged.

## Railway dev

Point `EXPO_PUBLIC_API_URL` at your Railway development API URL. Ensure Keycloak public URL is reachable from the device/emulator (use LAN IP or public Railway URL, not `localhost`, when testing on a physical phone).

## Verification

After Keycloak client creation, confirm:

```bash
# From supplify_erp API tests
cd apps/api && npm test -- mobile-auth csrf activeTenant auth.routes
```

Mobile app login should reach `GET /auth/me` with a Bearer token and receive user + tenant permissions.
