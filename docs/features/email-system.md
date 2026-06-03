# Supplify email system

Unified transactional email for the Supplify API: HTML templates, env gates, idempotency, and Railway-ready configuration.

## Architecture

```
Business flow → notification.service (prefs/tier/in-app/push/WhatsApp)
                    ↓ email channel
              email.service (templates, dedup, EMAIL_* gates)
                    ↓
              mailer.service (SendGrid API or Nodemailer SMTP)
```

Direct sends (guest waitlist, team invites, staff portal) call `email.service` without going through tenant notification prefs where appropriate.

## Environment variables

| Variable                                                          | Purpose                                   |
| ----------------------------------------------------------------- | ----------------------------------------- |
| `EMAIL_ENABLED`                                                   | Master switch (default `true`)            |
| `EMAIL_LOG_ONLY`                                                  | Log payload, no network send              |
| `EMAIL_PROVIDER`                                                  | `smtp` or `sendgrid`                      |
| `EMAIL_FROM_NAME` / `EMAIL_FROM_ADDRESS`                          | From header                               |
| `EMAIL_REPLY_TO`                                                  | Optional reply-to                         |
| `EMAIL_TEST_TO`                                                   | Default recipient for `email:test` script |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | Nodemailer SMTP                           |
| `SENDGRID_API_KEY`                                                | Optional legacy SendGrid API path         |

See [apps/api/.env.example](../../apps/api/.env.example) and [deploy/railway/](../deploy/railway/) for Railway defaults.

## Local development

**Default — Mailpit (Docker infra)**

With `pnpm local:infra` or the full Docker stack, Mailpit captures all outbound mail:

| Service              | URL / port                                                      |
| -------------------- | --------------------------------------------------------------- |
| Mailpit web UI       | http://localhost:8025                                           |
| SMTP (API → Mailpit) | `localhost:1025` (native dev) or `mailpit:1025` (API container) |

Configured in `docker/.env` (`SMTP_HOST`, `EMAIL_LOG_ONLY=false`). Open the UI after triggering a welcome email, invite, staff magic link, etc.

**Option — log only (no Mailpit)**

```env
EMAIL_LOG_ONLY=true
```

Unset `SMTP_HOST` or stop Mailpit if you only want log lines in the API console.

**Test script**

```bash
pnpm --filter @supplify/api email:test you@example.com
```

Debug API route (when `ENABLE_DEBUG_ROUTES=true`): `POST /api/notifications/test` with `{ "emailTo": "..." }`.

## Railway deployment

Committed in git (`deploy/railway/<env>/api.env`):

- **development:** `EMAIL_LOG_ONLY=true`
- **preprod/prod:** SMTP host/port/user + from address

Set once in dashboard: **`SMTP_PASS`** (see `secrets.env.example`).

Recommended provider: **Resend** via SMTP (`smtp.resend.com`, user `resend`).

## Duplicate prevention

`email_delivery_log` stores unique `event_key` values (e.g. `order:{id}:placed`). Domain-specific dedup still uses:

- `inventory_expiry_notification_log`
- `reorder_cadence_reminder_log`
- `invoice.overdue_notified_at`

## Adding a template

1. Register in [`apps/api/src/services/email/templates/registry.js`](../../apps/api/src/services/email/templates/registry.js)
2. Map notification category in [`template-resolver.js`](../../apps/api/src/services/email/template-resolver.js) if used via `sendNotification`
3. Call `sendTemplateEmail({ template: 'your.id', ... })` from the service layer

## Coverage matrix

| Domain              | Event                                                 | Status                                  |
| ------------------- | ----------------------------------------------------- | --------------------------------------- |
| Auth                | Welcome                                               | Done — `register-account.js`            |
| Auth                | Team invite                                           | Done — branch/restaurant invitations    |
| Auth                | Admin password reset                                  | Done — `admin-user-password.service.js` |
| Auth                | Keycloak self-service reset                           | N/A — OIDC delegated                    |
| Orders              | Status / amendments / fulfillment                     | Done — via `notification.service`       |
| Orders              | Scheduled auto-place                                  | Done — `scheduled-orders.service.js`    |
| Receiving           | Auto-invoice                                          | Done — `receiving.routes.js`            |
| Billing             | Renew / fail / lock / sandbox expiry                  | Done — billing jobs                     |
| Deals               | Approved / submitted / rejected / expired             | Done                                    |
| Staff               | Magic link / invite / shift / announcement / document | Done                                    |
| Reservations        | Guest + waitlist                                      | Done                                    |
| Inventory / reorder | Cron digests                                          | Done — via `notifyTenantUsers`          |
| Admin               | New tenant                                            | Done — `register-account.js`            |

## Production notes

- Nodemailer stays the transport abstraction; switch providers by changing SMTP credentials.
- Email failures do not roll back business transactions (logged + `email_delivery_log`).
- Security-critical flows (staff magic link, invites) may surface delivery errors to callers without rolling back DB writes.
