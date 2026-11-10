# Runbook: Keycloak session configuration

## Canonical policy file

`deploy/keycloak/session-policy.json`

| Field                      | Seconds | Meaning                 |
| -------------------------- | ------- | ----------------------- |
| `accessTokenLifespan`      | 1200    | 20 minutes              |
| `ssoSessionIdleTimeout`    | 604800  | 7 days                  |
| `ssoSessionMaxLifespan`    | 2592000 | 30 days                 |
| `clientSessionIdleTimeout` | 604800  | 7 days                  |
| `clientSessionMaxLifespan` | 2592000 | 30 days                 |
| `revokeRefreshToken`       | true    | Rotation on             |
| `refreshTokenMaxReuse`     | 0       | No reuse after rotation |
| `rememberMe`               | false   | Disabled                |

Client attribute `access.token.lifespan` = `1200` on `supplify-api`, `supplify-mobile`, `supplify-web`.

## Apply to an existing realm

`--import-realm` **skips** existing realms. Always run:

```bash
export KEYCLOAK_BASE_URL=https://keycloak-<env>.supplifyerp.com
export KEYCLOAK_REALM=<realm>   # Supplify | supplify-preprod | supplify-prod
export KEYCLOAK_ADMIN=admin
export KEYCLOAK_ADMIN_PASSWORD=***
node deploy/keycloak/apply-session-policy.mjs
```

Verify with Admin API `GET /admin/realms/{realm}` or the script’s printed `Verified:` block.

## Fresh import

Realm JSON under `deploy/keycloak/realm-export*.json` includes the same fields for first boot.

## Environments

| Env         | Realm              | Verify live before traffic         |
| ----------- | ------------------ | ---------------------------------- |
| Development | `Supplify`         | Required                           |
| Preprod     | `supplify-preprod` | Required — do not assume from JSON |
| Production  | `supplify-prod`    | Required — do not assume from JSON |

## Rollback

1. Restore previous numbers in `session-policy.json` (or a snapshot).
2. Re-run `apply-session-policy.mjs`.
3. Optionally roll back API cookie maxAge env vars / deploy.

## Out of scope

Consumer JWT, staff magic-link, `admin-cli` service usage.
