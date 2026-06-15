# Notification System - Complete Summary

## Delivery channels

| Channel      | Implementation                                                  | Notes                                                                                                                                      |
| ------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Email**    | [nodemailer](https://nodemailer.com/) SMTP (Resend recommended) | `SMTP_*` on the API                                                                                                                        |
| **WhatsApp** | Meta Cloud API server send (planned)                            | Server send pending Phase 2; no deep-link fallback                                                                                         |
| **In-app**   | `notification_log` table                                        | Bell icon; **toast + sound** via `useNotificationAlerts` (~10s); **Socket.IO `notification_new`** for sub-second delivery when tab is open |
| **Push**     | Web Push (VAPID) via `web-push`                                 | Opt-in (`push_enabled`); requires `VAPID_*` env — see [notifications-and-alerts.md](../features/notifications-and-alerts.md)               |

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

When **WhatsApp** is enabled in preferences and a phone number exists, the API calls `whatsapp.service.js` for server-side delivery (Meta Cloud API — planned).

Guest reservation confirmations:

- **Email** → sent to `customer_email` when provided
- **Phone** → server-side WhatsApp when Meta API is configured

---

## Recipients

Most tenant events use **`notifyTenantUsers`**: every user in `tenant_user_roles` plus the primary `contact_email` account. See [notifications-and-alerts.md](../features/notifications-and-alerts.md).

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

### Supplier customer growth

| Event                                      | Recipient(s)                |
| ------------------------------------------ | --------------------------- |
| Connection request (supplier → restaurant) | Restaurant team             |
| Connection accepted                        | Supplier team               |
| Referral registered                        | Restaurant team             |
| Referral reward earned                     | Supplier team               |
| Sponsorship gift received                  | Restaurant team             |
| Sponsorship expired                        | Restaurant + supplier teams |

See [supplier-customer-growth.md](../features/supplier-customer-growth.md).

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
Emit Socket.IO notification_new (foreground realtime)
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
- `apps/api/src/lib/socket.test.js`, `socket-auth.test.js`
- `apps/web/src/hooks/useNotificationAlerts.test.tsx`, `useChatRealtime.test.ts`

**Manual**

1. Set SMTP env vars (or rely on log-only mode)
2. Settings → Notifications → toggle Email / WhatsApp / types → Save
3. Trigger an order or reservation
4. Check bell icon; use **Open in WhatsApp** when shown

---

**Last updated:** June 2026  
**Version:** 2.2.0 (Socket.IO realtime alerts, unified app socket, multi-replica Redis adapter)
