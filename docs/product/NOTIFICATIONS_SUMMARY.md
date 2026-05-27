# Notification System - Complete Summary

## Delivery channels

| Channel      | Implementation                                                                | Notes                                                                                                            |
| ------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Email**    | Twilio SendGrid API (preferred) or [nodemailer](https://nodemailer.com/) SMTP | `SENDGRID_API_KEY` or `SMTP_*` on the API                                                                        |
| **WhatsApp** | Twilio Programmable Messaging (+ `wa.me` fallback in metadata)                | Outbound when configured; in-app “Open in WhatsApp” when link present                                            |
| **In-app**   | `notification_log` table                                                      | Bell icon; **toast + sound** via `useNotificationAlerts` (~10s); optional browser banner when permitted          |
| **Push**     | Web Push (VAPID) via `web-push`                                               | Opt-in (`push_enabled`); requires `VAPID_*` env — see [push-notifications.md](../features/push-notifications.md) |

### SMTP environment variables

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-password
SMTP_FROM=notifications@yourdomain.com
```

If SMTP is not configured, emails are logged only (safe for local dev).

### WhatsApp behavior

When **WhatsApp** is enabled in preferences and a phone number exists:

1. The API builds `https://wa.me/{digits}?text={encoded message}`
2. The link is stored in `notification_log.metadata.whatsappUrl`
3. The in-app notification shows **Open in WhatsApp**

Guest reservation confirmations:

- **Email** → sent to `customer_email` when provided
- **Phone** → returns a `wa.me` link for staff to message the guest (one tap from notifications)

---

## Recipients

Most tenant events use **`notifyTenantUsers`**: every user in `tenant_user_roles` plus the primary `contact_email` account. See [notifications-delivery.md](../features/notifications-delivery.md).

## Notification triggers

### Orders

| Event                                        | Recipient(s)      | Category / notes                                                                                 |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| Order placed                                 | Supplier team     | `PLACED` / `notify_order_new`                                                                    |
| Acknowledged, processing, shipped, delivered | Restaurant team   | matching status                                                                                  |
| Cancelled by **restaurant**                  | Supplier team     | `CANCELLED`                                                                                      |
| **Declined by supplier** (reason required)   | Restaurant team   | `CANCELLED`; message includes `cancel_reason` — [order-decline.md](../features/order-decline.md) |
| Order approval pending                       | Assigned approver | `order_approval`                                                                                 |
| Order amendment created/accepted/rejected    | Counterparty team | `order_amendment`                                                                                |
| Order reminder (restaurant)                  | Supplier team     | `PLACED`                                                                                         |

### Reservations

| Event                        | Recipient(s)                |
| ---------------------------- | --------------------------- |
| New reservation              | Restaurant team             |
| Waitlist                     | Restaurant team             |
| Guest cancel / reschedule    | Restaurant team             |
| Staff status change          | Restaurant team             |
| Confirmed / waitlist (guest) | Guest email + WhatsApp link |

See [reservations-foh.md](../features/reservations-foh.md).

### Other (tenant-wide where noted)

| Event                        | Recipient(s)                |
| ---------------------------- | --------------------------- |
| Invoice issued               | Restaurant team             |
| Invoice overdue              | Restaurant + supplier teams |
| Payment received             | Supplier team               |
| Low / out of stock           | Supplier or restaurant team |
| Chat message                 | Counterparty team           |
| Dispute opened               | Supplier team               |
| Dispute resolved             | Restaurant team             |
| Staff PTO / swap             | Restaurant team             |
| Scheduled quick list         | Restaurant team             |
| Post-receiving review prompt | Restaurant team             |

Preference toggles map to `notify_*` keys (e.g. `notify_order_new`, `notify_reservation_created`). Disabled toggles skip delivery.

---

## API endpoints

| Method | Path                             | Purpose                                                                   |
| ------ | -------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/notifications`             | List notifications                                                        |
| GET    | `/api/notifications/preferences` | Read preferences                                                          |
| PATCH  | `/api/notifications/preferences` | Update preferences (`emailEnabled`, `whatsappEnabled`, `inAppEnabled`, …) |
| POST   | `/api/notifications/:id/read`    | Mark one read                                                             |
| POST   | `/api/notifications/read-all`    | Mark all read                                                             |
| POST   | `/api/notifications/test`        | Send test notification                                                    |

---

## Flow

```
Event (order, reservation, invoice, …)
    ↓
Load preferences + contact info (profile / contact_info sync)
    ↓
Category enabled? → if no, skip
    ↓
Insert notification_log (in-app)
    ↓
Email via nodemailer (if emailEnabled + email)
WhatsApp link in metadata (if whatsappEnabled + phone)
    ↓
Update log with delivery results
```

---

## Testing

**Unit tests**

- `apps/api/src/services/notification.service.test.js`
- `apps/api/src/lib/whatsapp.test.js`

**Manual**

1. Set SMTP env vars (or rely on log-only mode)
2. Settings → Notifications → toggle Email / WhatsApp / types → Save
3. Trigger an order or reservation
4. Check bell icon; use **Open in WhatsApp** when shown

---

**Last updated:** May 2026  
**Version:** 2.1.0 (tenant fan-out, foreground alerts, supplier decline notifications)
