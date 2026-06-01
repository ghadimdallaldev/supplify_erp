# Keycloak — production (`supplify-prod`)

Import: `deploy/keycloak/realm-export.prod.json`  
Replace `yourdomain.com` with your real domains before import or edit clients in Admin UI.

API `KEYCLOAK_REALM` / web `VITE_KEYCLOAK_REALM`: **`supplify-prod`**

## Client `supplify-api`

### Valid redirect URIs

```text
https://api.yourdomain.com/auth/callback
https://api.yourdomain.com/*
```

### Valid post logout redirect URIs

```text
https://api.yourdomain.com/auth/register?continue=1
https://api.yourdomain.com/auth/register
https://api.yourdomain.com/*
https://app.yourdomain.com/login
https://app.yourdomain.com/*
```

**Attributes** (`post.logout.redirect.uris`):

```text
https://api.yourdomain.com/auth/register?continue=1##https://api.yourdomain.com/auth/register##https://api.yourdomain.com/*##https://app.yourdomain.com/login##https://app.yourdomain.com/*
```

### Web origins

```text
https://app.yourdomain.com
```

Use a **strong** client secret. No demo passwords in production.
