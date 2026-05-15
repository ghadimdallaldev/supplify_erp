# Notification Hardening — Design Spec

**Date:** 2026-05-15  
**Status:** Approved  
**Scope:** Backend only. WhatsApp skeleton (no real API). Preferences UI excluded.

---

## Problem

1. **Tier enforcement is absent.** `sendNotification()` sends email to every user regardless of plan. Free users should receive in-app notifications only; email is a Bronze+ feature; WhatsApp is a Gold+ feature.
2. **Three notification events have no trigger.** Invoice overdue, out-of-stock, and chat message received all have preference columns in the DB and are expected by users, but no code ever fires them.
3. **WhatsApp has no service shape.** `lib/whatsapp.js` builds wa.me deep links. There is no `whatsapp.service.js` with a standard send interface, making future API integration unnecessarily invasive.
4. **Plan feature strings are misleading.** Gold says `"email_and_sms"`, Platinum says `"email_sms_webhook"` — SMS is deprecated and WhatsApp is the intended channel.

---

## Out of Scope

- Real WhatsApp API (Meta Cloud API, Twilio) — skeleton only
- Notification preferences UI (separate task)
- Push notifications (currently disabled by design)
- Staff events (clock-in/out, announcements, documents)
- Email HTML templates / multi-language

---

## Design

### 1. WhatsApp Service Skeleton

**New file:** `apps/api/src/services/whatsapp.service.js`

Exports a single function matching the mailer interface:

```js
sendWhatsAppMessage({ to, message, templateName, templateParams })
// Returns: { sent: false, reason: 'NOT_CONFIGURED' }
```

- Logs the would-be message at `info` level in dev so content is visible
- Has a clearly marked `// TODO: integrate Meta Cloud API or Twilio here` block
- The existing `lib/whatsapp.js` link builder stays untouched (used by guest-facing reservation confirmation links)
- `notification.service.js` imports from `whatsapp.service.js`, not `lib/whatsapp.js`

### 2. Tier Enforcement in `notification.service.js`

At the top of `sendNotification()`, resolve allowed channels from the tenant's entitlements before any send:

```
getEntitlements(tenantId, tenantType)
  → features.notifications value
  → derive allowedChannels set
```

Channel resolution table:

| `notifications` feature value | Allowed channels |
|---|---|
| `in_app_only` | `['in_app']` |
| `in_app_and_email` | `['in_app', 'email']` |
| `email_and_whatsapp` (Gold) | `['in_app', 'email', 'whatsapp']` |
| `email_whatsapp_webhook` (Platinum) | `['in_app', 'email', 'whatsapp']` |
| *(missing / unknown)* | `['in_app']` — safe default |

User preferences are applied as an **additional opt-out layer**: a channel must be both in `allowedChannels` AND enabled in the user's preferences to fire.

Entitlements fetch is cached within the request lifetime (already available via `getEntitlements` which has its own DB-level caching).

### 3. Fix Plan Feature Strings (DB Migration)

New migration `0059_fix_notification_plan_feature_strings.sql`:

```sql
UPDATE subscription_plan
SET features = jsonb_set(features, '{notifications}', '"email_and_whatsapp"')
WHERE code IN ('gold', 'enterprise')
  AND features->>'notifications' = 'email_and_sms';

UPDATE subscription_plan
SET features = jsonb_set(features, '{notifications}', '"email_whatsapp_webhook"')
WHERE code = 'platinum'
  AND features->>'notifications' = 'email_sms_webhook';
```

Both restaurant and supplier plan rows updated (same code, different `tenant_type`).

### 4. Missing Notification Triggers

#### 4a. Invoice Overdue

**Mechanism:** Daily cron job.  
**Location:** New file `apps/api/src/jobs/invoice-overdue.job.js`, registered in the scheduler alongside scheduled-orders.

```
Every day at 08:00 UTC:
  SELECT invoices WHERE status = 'PENDING'
    AND due_date < NOW()
    AND overdue_notified_at IS NULL
  For each: notifyInvoiceOverdue(invoice) → mark overdue_notified_at
```

Requires adding `overdue_notified_at TIMESTAMPTZ` column to the `invoice` table (new migration `0060_invoice_overdue_notified_at.sql`).

`notifyInvoiceOverdue()` added to `notification.service.js`. Recipients: the restaurant tenant's contact + the relevant supplier.

#### 4b. Out of Stock

**Mechanism:** Inline check in inventory adjustment route.  
**Location:** `apps/api/src/routes/inventory.routes.js` — after any stock write that results in `quantity <= 0`.

```
After inventory update:
  if (newQuantity <= 0 && previousQuantity > 0):
    notifyOutOfStock({ tenantId, product, location })
```

`notifyOutOfStock()` added to `notification.service.js`. Recipient: the owning tenant.

#### 4c. Chat Message Received

**Mechanism:** Inline call after message insert.  
**Location:** Wherever chat messages are created (chat routes or chat service).

```
After message insert:
  notifyMessageReceived({ senderId, recipientId, recipientType, messagePreview })
```

`notifyMessageReceived()` added to `notification.service.js`. Only fires if recipient is not the sender (no self-notification). Respects the `notify_message_received` preference column.

---

## Data Flow

```
Route / Job fires event
  → notification.service.notifyXxx()
      → sendNotification({ tenantId, tenantType, userId, ... })
          → getEntitlements() → derive allowedChannels
          → check user preferences
          → write to notification_log (always)
          → if 'email' allowed: mailer.service.sendMail()
          → if 'whatsapp' allowed: whatsapp.service.sendWhatsAppMessage() → no-op
```

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/services/whatsapp.service.js` | **New** — skeleton send function |
| `apps/api/src/services/notification.service.js` | Add tier enforcement + 3 new notify functions |
| `apps/api/src/jobs/invoice-overdue.job.js` | **New** — daily cron job |
| `apps/api/src/db/migrations/0059_fix_notification_plan_feature_strings.sql` | **New** — fix Gold/Platinum plan strings |
| `apps/api/src/db/migrations/0060_invoice_overdue_notified_at.sql` | **New** — add column to invoice table |
| `apps/api/src/routes/inventory.routes.js` | Add out-of-stock trigger after stock writes |
| Chat routes / service | Add message-received trigger after insert |

---

## Error Handling

- Entitlements fetch failure → default to `in_app_only` (never crash a route because of notification logic)
- Email send failure → log error, do not throw (notification is best-effort)
- WhatsApp send → always returns `{ sent: false }` until real API is added, no error thrown
- Overdue job failure → log and continue to next invoice (never abort the batch)

---

## Testing Touchpoints

- Unit: `sendNotification()` with mocked entitlements — verify correct channels fire per tier
- Unit: `resolveAllowedChannels(featureValue)` pure function
- Integration: POST order → notification_log row created with correct `email_sent` flag per tier
- Integration: Invoice overdue job → rows with past due_date get `overdue_notified_at` set
- Manual: Create inventory adjustment to 0 → notification fires
