# Notifications & alerts

How Supplify delivers in-app, email, push, and WhatsApp alerts — architecture, recipients, and configuration.

## Recipients

`notifyTenantUsers` in `notification.service.js` loads every `app_user` linked to the tenant via:

- `tenant_user_roles` (team members), and
- the tenant `contact_email` (primary account).

Team members receive the same in-app (and email/push when enabled) alerts as the primary contact.

## Channels

| Channel  | When                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------- |
| In-app   | `notification_log` + header bell; foreground toast + optional browser banner via `useNotificationAlerts` |
| Realtime | Socket.IO `notification_new` and `entitlements_refresh` on the app socket                                |
| Email    | Plan tier + `email_enabled` + per-category `notify_*` toggles; HTML templates (see below)                |
| WhatsApp | Tier + toggle; server send via `whatsapp.service.js` (Meta Cloud API)                                    |
| Web Push | Opt-in `push_enabled` + VAPID keys (see below)                                                           |
| Webhook  | Platinum tier — outbound signed HTTP to tenant-configured URL (`notification/webhook.js`)                |

Driver delivery milestones (`driver_assigned`, `out_for_delivery`, `delivered`, etc.) are **in-app only** — email and WhatsApp are suppressed per ping (`skipEmail` + `skipWhatsapp` on metadata).

## Order events

| Event                             | Recipient                                  |
| --------------------------------- | ------------------------------------------ |
| `PLACED`                          | Supplier team                              |
| Acknowledged → delivered          | Restaurant team                            |
| `CANCELLED` by restaurant         | Supplier team                              |
| `CANCELLED` by supplier (decline) | Restaurant team — includes `cancel_reason` |

See [ordering-decline.md](./ordering-decline.md).

## Other tenant-wide events

Messages, invoices (issued/overdue/reminders), payments, inventory (low/out of stock), disputes, staff PTO/swap, scheduled quick lists, reservation staff events, guest reservation updates, post-receiving review prompts, order amendments, billing lifecycle events, supplier reorder reminders, team role changes.

## Billing events

| Category                 | When                                                   |
| ------------------------ | ------------------------------------------------------ |
| `billing_trial_started`  | Free plan activation after registration                |
| `billing_trial_ending`   | Cron: trial ending soon                                |
| `billing_trial_expired`  | Free sandbox expiry job (before lock)                  |
| `billing_trial_extended` | Admin or unlock extends free trial                     |
| `billing_activated`      | Paid checkout succeeds                                 |
| `billing_plan_changed`   | Admin plan change or paid checkout with different plan |
| `billing_renewed`        | Subscription billing job renewal                       |
| `billing_payment_failed` | Failed renewal charge                                  |
| `billing_cancelled`      | Admin sets status `CANCELLED`                          |
| `billing_account_locked` | Past-due lock or free sandbox expiry                   |

## Supplier customer growth

| Event                         | Recipient                                              |
| ----------------------------- | ------------------------------------------------------ |
| `supplier_connection_request` | Restaurant team — supplier wants to connect            |
| `connection_request_accepted` | Supplier team                                          |
| `connection_request_declined` | Supplier team                                          |
| `referral_registered`         | Restaurant team — completed signup via supplier invite |
| `referral_reward_earned`      | Supplier team — referred restaurant converted to paid  |
| `sponsorship_gift_received`   | Restaurant team — supplier sponsored onboarding        |
| `sponsorship_expired`         | Restaurant + supplier teams — sponsored period ended   |

See [supplier-customer-growth.md](./supplier-customer-growth.md).

## User preferences

Settings → Notifications: `notify_order_new`, `notify_order_cancelled`, `notify_message_received`, `notify_reservation_created`, etc. Disabled categories skip all channels.

Product event matrix: [notifications-summary.md](../product/notifications-summary.md).

---

## Email system

Unified transactional email for the API: HTML templates, env gates, idempotency, Railway-ready configuration.

### Architecture

```text
Business flow → notification.service (prefs/tier/in-app/push/WhatsApp)
                    ↓ email channel
              email.service (templates, dedup, EMAIL_* gates)
                    ↓
              mailer.service (Nodemailer SMTP)
```

Direct sends (guest waitlist, team invites, staff portal, welcome email, role changed on assign) call `email.service` without tenant notification prefs where appropriate. Guest reservation updates use direct email + WhatsApp in `notification/email.js`.

### Environment variables

| Variable                                 | Purpose                        |
| ---------------------------------------- | ------------------------------ |
| `EMAIL_ENABLED`                          | Master switch (default `true`) |
| `EMAIL_LOG_ONLY`                         | Log payload, no network send   |
| `EMAIL_PROVIDER`                         | `smtp`                         |
| `EMAIL_FROM_NAME` / `EMAIL_FROM_ADDRESS` | From header                    |
| `SMTP_*`                                 | Transport                      |

Full list: [environment-variables.md](../operations/environment-variables.md), `apps/api/.env.example`.

### Local development

**Mailpit (Docker):** UI http://localhost:8025, SMTP `localhost:1025`. Or `EMAIL_LOG_ONLY=true` for console-only.

```bash
pnpm --filter @supplify/api email:test you@example.com
```

### Railway

- **development:** `EMAIL_LOG_ONLY=true` in `deploy/railway/development/api.env`
- **preprod/prod:** SMTP credentials; set `SMTP_PASS` in dashboard (Resend recommended)

### Duplicate prevention

`email_delivery_log` unique `event_key` (e.g. `order:{id}:placed`). Domain-specific dedup on expiry/reorder/invoice tables.

### Adding a template

1. Register in `apps/api/src/services/email/templates/registry.js`
2. Map category in `template-resolver.js` if used via `sendNotification`
3. Call `sendTemplateEmail` from the service layer

Admin delivery log (redacted): [admin-panel-operations.md](./admin-panel-operations.md).

---

## WhatsApp (Meta Cloud API)

Server-side send via `apps/api/src/services/whatsapp.service.js`. Gated by plan feature `notifications` (`email_and_whatsapp` or `email_whatsapp_webhook`), user pref `whatsapp_enabled`, and phone on `restaurant_contact_info` / `supplier_contact_info`.

### Environment variables

| Variable                        | Purpose                                     |
| ------------------------------- | ------------------------------------------- |
| `WHATSAPP_ENABLED`              | Master switch (default `false`)             |
| `WHATSAPP_LOG_ONLY`             | Log payload, no network send (dev/preprod)  |
| `WHATSAPP_ACCESS_TOKEN`         | Meta Business API token                     |
| `WHATSAPP_PHONE_NUMBER_ID`      | Meta phone number ID                        |
| `WHATSAPP_API_VERSION`          | Graph API version (default `v21.0`)         |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Webhook verification                        |
| `WHATSAPP_APP_SECRET`           | Signature verification for inbound webhooks |

Webhook URL: `https://<api-host>/webhooks/whatsapp`

Guest flows (reservation confirm/cancel/reschedule, waitlist offer) send WhatsApp directly when a guest phone is present, without tenant prefs.

Dedup/audit: `whatsapp_delivery_log` (migration `0181`).

---

## Web Push (PWA)

Browser-native Web Push via VAPID. Complements in-app log and foreground toasts; not Twilio/FCM.

### Configuration

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=notifications@yourdomain.com
```

Generate: `npx web-push generate-vapid-keys` (from `apps/api`).

### API

| Method | Path                         | Description              |
| ------ | ---------------------------- | ------------------------ |
| GET    | `/api/push/vapid-public-key` | Public key for subscribe |
| POST   | `/api/push/subscribe`        | Save subscription        |
| DELETE | `/api/push/unsubscribe`      | Remove by endpoint       |

### Delivery

After `notification_log` write, `sendWebPushToUser` when VAPID configured and `push_enabled` true. Stale endpoints (`410`/`404`) remove `push_subscriptions` rows.

**Payload:** `{ title, body, url, referenceId, referenceType }`

### Frontend

- Hook: `usePushNotifications.ts`
- Service worker: `apps/web/static/sw.js`
- Settings toggle → `push_enabled` (opt-in, default false)

Migration: `0073_push_subscriptions.sql`.

---

## Operations cross-links

- [email-system.md](../operations/email-system.md) — ops index (points here)
- [cron-jobs.md](../operations/cron-jobs.md) — digest/reminder crons that trigger notifications
