# Keycloak client setup — Railway development

Realm: **Supplify** · Client: **supplify-api**  
Preprod/prod redirect URIs: `deploy/keycloak/realm-export.preprod.json` and `realm-export.prod.json`

Custom dev domains: `app-dev.supplifyerp.com` (web), `api-dev.supplifyerp.com` (API), `keycloak-dev.supplifyerp.com` (IdP).

## Valid redirect URIs

```text
https://app-dev.supplifyerp.com/auth/callback
https://app-dev.supplifyerp.com/*
https://api-dev.supplifyerp.com/auth/callback
https://api-dev.supplifyerp.com/*
https://supplify-web-dev-development.up.railway.app/auth/callback
https://supplify-web-dev-development.up.railway.app/*
https://supplify-api-dev-development.up.railway.app/auth/callback
https://supplify-api-dev-development.up.railway.app/*
```

The **web** callback is used in normal login (same-origin proxy). Keep the API URIs for direct API links and tooling.

## Valid post logout redirect URIs

Required for **Create account** (registration clears Keycloak SSO first).

In Admin UI: **Clients** → **supplify-api** → scroll to **Logout settings** → **Valid post logout redirect URIs** (add each line, or use **Advanced** → Attributes).

```text
https://app-dev.supplifyerp.com/login
https://app-dev.supplifyerp.com/*
https://api-dev.supplifyerp.com/auth/register?continue=1
https://api-dev.supplifyerp.com/auth/register
https://api-dev.supplifyerp.com/*
https://supplify-api-dev-development.up.railway.app/auth/register?continue=1
https://supplify-api-dev-development.up.railway.app/auth/register
https://supplify-api-dev-development.up.railway.app/*
https://supplify-web-dev-development.up.railway.app/login
https://supplify-web-dev-development.up.railway.app/*
```

**Advanced → Attributes** (single line, `##` between URIs):

```text
https://app-dev.supplifyerp.com/login##https://app-dev.supplifyerp.com/*##https://api-dev.supplifyerp.com/auth/register?continue=1##https://api-dev.supplifyerp.com/auth/register##https://api-dev.supplifyerp.com/*##https://supplify-api-dev-development.up.railway.app/auth/register?continue=1##https://supplify-api-dev-development.up.railway.app/auth/register##https://supplify-api-dev-development.up.railway.app/*##https://supplify-web-dev-development.up.railway.app/login##https://supplify-web-dev-development.up.railway.app/*
```

Click **Save**.

## Web origins

```text
https://app-dev.supplifyerp.com
https://supplify-web-dev-development.up.railway.app
```

## Credentials

Client secret must match Railway API `KEYCLOAK_CLIENT_SECRET` (import default: `changeme`).

## Sync from git

After editing `deploy/keycloak/realm-export.json`:

```bash
KEYCLOAK_ADMIN_PASSWORD=admin node scripts/import-keycloak-realm.mjs --url https://keycloak-dev.supplifyerp.com
```
