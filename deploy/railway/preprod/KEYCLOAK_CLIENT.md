# Keycloak client setup — Railway preprod

Realm: **supplify-preprod** · Clients: **supplify-api**, **supplify-web**

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

Do **not** use `+` (wildcard) in preprod/prod.

## Credentials

`KEYCLOAK_CLIENT_SECRET` in Railway API must match the Keycloak client secret (set via dashboard; not stored in git).

## Sync from git

```bash
KEYCLOAK_ADMIN_PASSWORD=<from Railway> node scripts/import-keycloak-realm.mjs \
  --file deploy/keycloak/realm-export.preprod.json \
  --url https://keycloak-preprod.supplifyerp.com
```
