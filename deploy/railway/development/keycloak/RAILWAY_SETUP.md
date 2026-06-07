# Keycloak — Railway development

See the full multi-environment guide: [`deploy/railway/keycloak/RAILWAY_SETUP.md`](../../keycloak/RAILWAY_SETUP.md).

**This environment:** config `/deploy/railway/development/keycloak/railway.json`, realm **`Supplify`**, hostname in `deploy/railway/development/keycloak.env`.

**Memory / JVM:** [`deploy/railway/KEYCLOAK_RAILWAY_MEMORY_NOTES.md`](../../KEYCLOAK_RAILWAY_MEMORY_NOTES.md) — paste updated `keycloak.env` vars into the Railway dashboard after deploy.

**Database / persistence:** [`deploy/railway/KEYCLOAK_RAILWAY_DB_NOTES.md`](../../KEYCLOAK_RAILWAY_DB_NOTES.md) — dedicated `keycloak` Postgres DB; never `DATABASE_URL` on Keycloak service.
