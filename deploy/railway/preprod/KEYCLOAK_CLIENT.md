# Keycloak — preprod (`supplify-preprod`)

Import: `deploy/keycloak/realm-export.preprod.json`  
API `KEYCLOAK_REALM` / web `VITE_KEYCLOAK_REALM`: **`supplify-preprod`**

Update hostnames below if your Railway URLs differ (`apps/api/.env.preprod.example`).

## Client `supplify-api`

### Valid redirect URIs

```text
https://supplify-api-preprod.up.railway.app/auth/callback
https://supplify-api-preprod.up.railway.app/*
```

### Valid post logout redirect URIs

```text
https://supplify-api-preprod.up.railway.app/auth/register?continue=1
https://supplify-api-preprod.up.railway.app/auth/register
https://supplify-api-preprod.up.railway.app/*
https://supplify-web-preprod.up.railway.app/login
https://supplify-web-preprod.up.railway.app/*
```

**Attributes** (`post.logout.redirect.uris`, `##`-separated):

```text
https://supplify-api-preprod.up.railway.app/auth/register?continue=1##https://supplify-api-preprod.up.railway.app/auth/register##https://supplify-api-preprod.up.railway.app/*##https://supplify-web-preprod.up.railway.app/login##https://supplify-web-preprod.up.railway.app/*
```

### Web origins

```text
https://supplify-web-preprod.up.railway.app
```

Use a **strong** client secret (not `changeme`). Set the same value on API `KEYCLOAK_CLIENT_SECRET`.
