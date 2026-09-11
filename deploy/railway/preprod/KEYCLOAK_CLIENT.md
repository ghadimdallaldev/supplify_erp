# Keycloak client setup — Railway preprod

Realm: **supplify-preprod** · Clients: **supplify-api**, **supplify-web**, **supplify-mobile**

Custom domains: `app-preprod.supplifyerp.com` (web), `api-preprod.supplifyerp.com` (API), `keycloak-preprod.supplifyerp.com` (IdP).

## Valid redirect URIs (supplify-api)

```text
https://app-preprod.supplifyerp.com/auth/callback
https://app-preprod.supplifyerp.com/*
https://api-preprod.supplifyerp.com/auth/callback
https://api-preprod.supplifyerp.com/*
```

Railway fallbacks (rollback only): `supplify-web-preprod-preprod.up.railway.app`, `supplify-api-preprod-preprod.up.railway.app`.

## Web origins

```text
https://app-preprod.supplifyerp.com
https://api-preprod.supplifyerp.com
```

Do **not** use `+` (wildcard) in preprod/prod for **web** clients.

## Mobile public client (`supplify-mobile`)

Required for Expo Android/iOS PKCE login. Present in `deploy/keycloak/realm-export.preprod.json`. Sync with:

```bash
KEYCLOAK_ADMIN_PASSWORD=<from Railway> node scripts/import-keycloak-realm.mjs \
  --file deploy/keycloak/realm-export.preprod.json \
  --url https://keycloak-preprod.supplifyerp.com
```

Redirect URIs: `supplify://auth/callback`, Expo Go `exp://…` (dev), post-logout `supplify://auth/logout`. See `docs/mobile/KEYCLOAK_MOBILE_CLIENT.md`.

## Credentials

`KEYCLOAK_CLIENT_SECRET` in Railway API must match the Keycloak client secret (set via dashboard; not stored in git).

## Sync from git

```bash
KEYCLOAK_ADMIN_PASSWORD=<from Railway> node scripts/import-keycloak-realm.mjs \
  --file deploy/keycloak/realm-export.preprod.json \
  --url https://keycloak-preprod.supplifyerp.com
```
