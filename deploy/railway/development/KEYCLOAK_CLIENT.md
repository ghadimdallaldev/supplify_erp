# Keycloak client setup — Railway development

Realm: **Supplify** · Client: **supplify-api**  
Preprod/prod redirect URIs: `deploy/keycloak/realm-export.preprod.json` and `realm-export.prod.json`

## Valid redirect URIs

```text
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
https://supplify-api-dev-development.up.railway.app/auth/register?continue=1
https://supplify-api-dev-development.up.railway.app/auth/register
https://supplify-api-dev-development.up.railway.app/*
https://supplify-web-dev-development.up.railway.app/login
https://supplify-web-dev-development.up.railway.app/*
```

**Advanced → Attributes** (single line, `##` between URIs):

```text
https://supplify-api-dev-development.up.railway.app/auth/register?continue=1##https://supplify-api-dev-development.up.railway.app/auth/register##https://supplify-api-dev-development.up.railway.app/*##https://supplify-web-dev-development.up.railway.app/login##https://supplify-web-dev-development.up.railway.app/*
```

Click **Save**.

## Web origins

```text
https://supplify-web-dev-development.up.railway.app
```

## Credentials

Client secret must match Railway API `KEYCLOAK_CLIENT_SECRET` (import default: `changeme`).
