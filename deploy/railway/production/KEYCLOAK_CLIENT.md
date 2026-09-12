# Keycloak client setup — Railway production

Realm: **supplify-prod** · Clients: **supplify-api**, **supplify-web**, **supplify-mobile**

Custom domains: `app.supplifyerp.com` (web), `api.supplifyerp.com` (API), `keycloak.supplifyerp.com` (IdP).

## Valid redirect URIs (supplify-api)

```text
https://app.supplifyerp.com/auth/callback
https://app.supplifyerp.com/*
https://api.supplifyerp.com/auth/callback
https://api.supplifyerp.com/*
```

Railway fallbacks (rollback only): `supplify-web-prod-production.up.railway.app`, `supplify-api-prod-production.up.railway.app`.

## Web origins

```text
https://app.supplifyerp.com
https://api.supplifyerp.com
```

## Security

- `registrationAllowed: false` — admins create users in Keycloak only
- `directAccessGrantsEnabled: false` — no password grant
- `sslRequired: all`

## Mobile public client (`supplify-mobile`)

Required for Expo Android/iOS PKCE login. Present in `deploy/keycloak/realm-export.prod.json`. Sync with the command below. Redirect URIs: `supplify://auth/callback`, Expo Go `exp://…` (dev), post-logout `supplify://auth/logout`. See `docs/mobile/KEYCLOAK_MOBILE_CLIENT.md`.

## Credentials

`KEYCLOAK_CLIENT_SECRET` in Railway API **must** match the live Keycloak `supplify-api` client secret.

After any realm partial-import or client overwrite, verify (admin token required):

```bash
# Live secret must equal Railway API KEYCLOAK_CLIENT_SECRET
# Mismatch symptoms: web /auth/callback → "Token exchange failed: 401"
# and LoginPage shows "Authentication failed. If you were signed in as a demo user..."
```

If mismatched: regenerate the secret in Keycloak Admin → Clients → `supplify-api` → Credentials, then set the same value on Railway `supplify-api-prod` `KEYCLOAK_CLIENT_SECRET` and redeploy the API.

## Sync from git

```bash
KEYCLOAK_ADMIN_PASSWORD=<from Railway> node scripts/import-keycloak-realm.mjs \
  --file deploy/keycloak/realm-export.prod.json \
  --url https://keycloak.supplifyerp.com
```
