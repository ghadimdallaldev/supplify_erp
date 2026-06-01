# Notifications — delivery & recipients

How Supplify decides **who** gets notified and **which channels** fire.

## Recipients

`notifyTenantUsers` in `notification.service.js` loads every `app_user` linked to the tenant via:

- `tenant_user_roles` (team members), and
- the tenant `contact_email` (primary account).

Previously many events only notified the single `contact_email` user; team members now receive the same in-app (and email/push when enabled) alerts.

## Channels

| Channel  | When                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| In-app   | `notification_log` + header bell; foreground **toast** + optional **browser** banner via `useNotificationAlerts` |
| Realtime | Socket.IO `notification_new` and `entitlements_refresh` on shared app socket (sub-second foreground alerts)      |
| Email    | Plan tier + `email_enabled` + per-category `notify_*` toggle                                                     |
| WhatsApp | Tier + toggle; often a `wa.me` link in metadata                                                                  |
| Web Push | `push_enabled` + VAPID; see [push-notifications.md](./push-notifications.md)                                     |

## Order events

| Event                             | Recipient                                             |
| --------------------------------- | ----------------------------------------------------- |
| `PLACED`                          | Supplier team                                         |
| Acknowledged → delivered          | Restaurant team                                       |
| `CANCELLED` by restaurant         | Supplier team                                         |
| `CANCELLED` by supplier (decline) | Restaurant team — includes `cancel_reason` in message |

See [order-decline.md](./order-decline.md).

## Other tenant-wide events

Messages, invoices (issued/overdue), payments, inventory (low/out of stock), disputes, staff PTO/swap, scheduled quick lists, reservation staff events, post-receiving review prompts, order amendments.

## Preferences

Settings → Notifications: `notify_order_new`, `notify_order_cancelled`, `notify_message_received`, `notify_reservation_created`, etc. Disabled categories skip all channels.

## Reference

- [NOTIFICATIONS_SUMMARY.md](../product/NOTIFICATIONS_SUMMARY.md)
- [push-notifications.md](./push-notifications.md)
