# Keycloak — Railway development

See the full multi-environment guide: [`deploy/railway/keycloak/RAILWAY_SETUP.md`](../../keycloak/RAILWAY_SETUP.md).

| Item      | Value                                                      |
| --------- | ---------------------------------------------------------- |
| Config    | `deploy/railway/development/keycloak/railway.json`         |
| Realm     | `Supplify`                                                 |
| Hostname  | `deploy/railway/development/keycloak.env` → `KC_HOSTNAME`  |
| Start     | `railway-entrypoint.sh start --import-realm`               |
| Optimized | **No** — `KEYCLOAK_USE_OPTIMIZED=false` (runtime postgres) |

**Sync:** `KEYCLOAK_ADMIN_PASSWORD=secret pnpm railway:keycloak:sync -- development`

**Docs:**

- Memory / JVM: [`deploy/railway/KEYCLOAK_RAILWAY_MEMORY_NOTES.md`](../../KEYCLOAK_RAILWAY_MEMORY_NOTES.md)
- Database: [`deploy/railway/KEYCLOAK_RAILWAY_DB_NOTES.md`](../../KEYCLOAK_RAILWAY_DB_NOTES.md)
- Fix narrative: [`docs/operations/keycloak-railway-memory-fix.md`](../../../docs/operations/keycloak-railway-memory-fix.md)
