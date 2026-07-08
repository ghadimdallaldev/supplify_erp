# Email system

Transactional email architecture, providers, and env gates.

**Canonical feature spec:** [notifications-and-alerts.md](../features/notifications-and-alerts.md) (templates, triggers, push, WhatsApp, admin delivery log).

**Product matrix:** [notifications-summary.md](../product/notifications-summary.md)

**Operations:** env vars in [environment-variables.md](./environment-variables.md).

**Admin visibility:** Operations tab email logs — [admin-operations-console.md](../admin/admin-operations-console.md).

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
