# Environment variable matrix (quick reference)

Paths: **API** = `apps/api/`, **Web** = `apps/web/`. Example files: `.env.{dev,preprod,prod}.example`.

| Concern                    | dev                                                   | preprod                                           | prod                                           |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| `APP_ENV` / `VITE_APP_ENV` | `dev`                                                 | `preprod`                                         | `prod`                                         |
| `NODE_ENV` (API)           | `development`                                         | `production`                                      | `production`                                   |
| Postgres                   | isolated dev DB                                       | isolated preprod DB                               | isolated prod DB                               |
| CORS                       | localhost + dev URL                                   | preprod web URL only                              | prod web URL only                              |
| Keycloak realm             | `Supplify` (dev)                                      | `supplify-preprod`                                | `supplify-prod`                                |
| Keycloak URI docs          | `../../deploy/railway/development/KEYCLOAK_CLIENT.md` | `../../deploy/keycloak/realm-export.preprod.json` | `../../deploy/keycloak/realm-export.prod.json` |
| Keycloak Railway env       | `../../deploy/railway/development/keycloak.env`       | `../../deploy/railway/preprod/keycloak.env`       | `../../deploy/railway/production/keycloak.env` |
| Keycloak optimized start   | `false` (runtime postgres)                            | `false`                                           | `true`                                         |
| `PAYMENTS_MODE`            | `mock`                                                | `test`                                            | `live`                                         |
| `STORAGE_DRIVER`           | `local`                                               | `s3` (recommended)                                | `s3` (required)                                |
| E2E / debug routes         | allowed (dev only)                                    | disabled                                          | disabled                                       |
| Demo seed / DB reset       | allowed                                               | disabled                                          | disabled                                       |
| Email (`EMAIL_LOG_ONLY`)   | `true` (log only)                                     | `false` + `SMTP_PASS` secret                      | `false` + `SMTP_PASS` secret                   |
| Email config source        | `../../deploy/railway/development/api.env`            | `../../deploy/railway/preprod/api.env`            | `../../deploy/railway/production/api.env`      |
| Delivery GPS (API)         | `GPS_TRACKING_ENABLED=true` (typical)                 | same + map keys in secrets if using embed         | prod map keys in Railway secrets               |
| Delivery GPS (Web)         | `VITE_GPS_*`, optional `VITE_GOOGLE_MAPS_API_KEY`     | same                                              | same                                           |

Full tables: [environment-variables.md](./environment-variables.md). Tracking spec: [../features/drivers-and-gps-tracking.md](../features/drivers-and-gps-tracking.md). Email system: [../features/email-system.md](../features/email-system.md). Deploy guide: [railway-environments.md](./railway-environments.md).
