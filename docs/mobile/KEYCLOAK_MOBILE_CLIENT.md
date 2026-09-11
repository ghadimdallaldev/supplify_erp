# Keycloak Mobile Client Setup

Configure this **once** in Keycloak before running the Supplify mobile app against your environment.

## Client settings

| Setting                       | Value                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client ID**                 | `supplify-mobile`                                                                                                                                                                                                               |
| **Client type**               | OpenID Connect                                                                                                                                                                                                                  |
| **Access type**               | Public (no client secret)                                                                                                                                                                                                       |
| **Standard flow**             | Enabled                                                                                                                                                                                                                         |
| **Direct access grants**      | Disabled (use PKCE only)                                                                                                                                                                                                        |
| **PKCE**                      | Required (S256)                                                                                                                                                                                                                 |
| **Valid redirect URIs**       | `supplify://auth/callback` (native); `exp://127.0.0.1:8081/--/auth/callback` (Expo Go iOS/web dev); `exp://10.0.2.2:8081/--/auth/callback` (Expo Go Android emulator dev); `http://localhost:8081/auth/callback` (Expo web dev) |
| **Web origins**               | Leave empty (native app)                                                                                                                                                                                                        |
| **Post logout redirect URIs** | `supplify://auth/logout` (optional)                                                                                                                                                                                             |

## Realm

| Environment             | Realm              |
| ----------------------- | ------------------ |
| Local / Railway **dev** | `Supplify`         |
| Railway **preprod**     | `supplify-preprod` |
| Railway **prod**        | `supplify-prod`    |

Mobile EAS profiles bake the matching realm into `EXPO_PUBLIC_KEYCLOAK_REALM` (see `supplify-mobile/eas.json`).

## Mobile environment variables

Set these in `C:/myProjects/supplify-mobile/.env` and `C:/myProjects/supplify-mobile-ios/.env` for **local** Expo:

```env
EXPO_PUBLIC_API_URL=http://localhost
EXPO_PUBLIC_KEYCLOAK_URL=http://localhost:8180
EXPO_PUBLIC_KEYCLOAK_REALM=Supplify
EXPO_PUBLIC_KEYCLOAK_CLIENT_ID=supplify-mobile
```

Hosted backends (EAS builds):

| Build profile         | `EXPO_PUBLIC_API_URL`                 | `EXPO_PUBLIC_KEYCLOAK_URL`                 | Realm              |
| --------------------- | ------------------------------------- | ------------------------------------------ | ------------------ |
| `preprod` / `preview` | `https://api-preprod.supplifyerp.com` | `https://keycloak-preprod.supplifyerp.com` | `supplify-preprod` |
| `production`          | `https://api.supplifyerp.com`         | `https://keycloak.supplifyerp.com`         | `supplify-prod`    |

Both standalone mobile repositories default local Keycloak to `http://localhost:8180`, matching the ERP development stack. Their committed `.env.example` files carry the same value. Use a reachable LAN address or hosted URL for a physical device.

These are Expo public configuration values, not secrets. Never place Keycloak client secrets or Apple/Expo signing credentials in a mobile `.env` file.

## Driver OTP bypass

The `EMAIL_OTP` authenticator skips MFA for users whose Keycloak attribute `supplify_driver_login=true` is set. The attribute is managed server-side by `setKeycloakUserDriverLogin()` in `keycloak-admin.js` and is gated by the API env var `AUTH_EMAIL_OTP_DRIVER_BYPASS` (default `true`). Setting `AUTH_EMAIL_OTP_DRIVER_BYPASS=false` forces drivers through OTP on every login.

## Mobile branch switch

Mobile obtains `activeTenantToken` from the `POST /api/branches/switch` JSON response body (field `data.activeTenantToken`). This field is only present for bearer-authenticated requests; web clients receive the token via an `HttpOnly` cookie instead. Store the token and attach it as `X-Active-Tenant-Token` on subsequent requests.

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

Confirm the public client exists (should redirect to the realm login form, not "Client not found"):

```bash
curl -sSL "https://keycloak-preprod.supplifyerp.com/realms/supplify-preprod/protocol/openid-connect/auth?client_id=supplify-mobile&response_type=code&redirect_uri=supplify%3A%2F%2Fauth%2Fcallback&scope=openid" | head
```

Apply from git when missing:

```bash
KEYCLOAK_ADMIN_PASSWORD=<from Railway> node scripts/import-keycloak-realm.mjs \
  --file deploy/keycloak/realm-export.preprod.json \
  --url https://keycloak-preprod.supplifyerp.com

KEYCLOAK_ADMIN_PASSWORD=<from Railway> node scripts/import-keycloak-realm.mjs \
  --file deploy/keycloak/realm-export.prod.json \
  --url https://keycloak.supplifyerp.com
```

After Keycloak client creation, confirm API mobile auth tests:

```bash
# From supplify_erp API tests
cd apps/api && npm test -- mobile-auth csrf activeTenant auth.routes
```

Mobile app login should reach `GET /auth/me` with a Bearer token and receive user + tenant permissions.
