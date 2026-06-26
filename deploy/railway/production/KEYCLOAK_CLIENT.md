# Keycloak client setup — Railway production

Realm: **supplify-prod** · Clients: **supplify-api**, **supplify-web**

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

## Credentials

`KEYCLOAK_CLIENT_SECRET` in Railway API must match Keycloak (dashboard only; never commit).

## Sync from git

```bash
KEYCLOAK_ADMIN_PASSWORD=<from Railway> node scripts/import-keycloak-realm.mjs \
  --file deploy/keycloak/realm-export.prod.json \
  --url https://keycloak.supplifyerp.com
```
