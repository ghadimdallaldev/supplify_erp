# Email system

Transactional email architecture, providers, and env gates.

**Canonical feature spec:** [notifications-and-alerts.md](../features/notifications-and-alerts.md) (templates, triggers, push, WhatsApp, admin delivery log).

**Product matrix:** [notifications-summary.md](../product/notifications-summary.md)

**Operations:** env vars in [environment-variables.md](./environment-variables.md).

**Admin visibility:** Operations tab email logs — [admin-operations-console.md](../admin/admin-operations-console.md).

## Layout

Shared transactional shell lives in `apps/api/src/services/email/templates/layout.js`:

- Stripe-like canvas (`#f8fafc`), violet wordmark (`#5b21b6`), violet CTA (`#7c3aed`)
- `renderOtpCode` — large code hero for `auth.email_otp_*` (no CTA)
- `renderDetailStrip` — optional key/value rows for invites, orders, invoices, billing when payload fields exist
- Copy: `apps/api/src/i18n/locales/{en,ar}/emails.json`

Design: [2026-08-21-transactional-email-design.md](../superpowers/specs/2026-08-21-transactional-email-design.md).

## Coverage (high level)

| Domain       | Templates (examples)                                                             | Dispatch                                 |
| ------------ | -------------------------------------------------------------------------------- | ---------------------------------------- |
| Auth         | `auth.welcome`, `auth.team_invite`, `auth.password_changed`, `auth.role_changed` | Direct `sendTemplateEmail`               |
| Orders       | `order.placed` … `order.cancelled`, amendments, fulfillment                      | `sendNotification` → resolver            |
| Reservations | `reservation.confirmation`, `reservation.cancelled`, waitlist offer              | Guest direct + staff `notifyTenantUsers` |
| Billing      | `billing.trial_started`, `billing.activated`, `billing.plan_changed`, …          | `notifyBilling*` helpers                 |
| Staff portal | `staff.magic_link`, `staff.invite`, `staff.shift`                                | Direct or mixed                          |
| Growth       | `growth.connection_accepted`, `supplier.access_request`, …                       | `notifyTenantUsers`                      |

Dedup: `email_delivery_log.event_key`. Retries: `email-retry` cron job.
