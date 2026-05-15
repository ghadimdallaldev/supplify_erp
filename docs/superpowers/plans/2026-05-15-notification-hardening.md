# Notification Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce subscription tier on notification channels, add a WhatsApp service skeleton, and wire up three missing notification triggers (invoice overdue, out-of-stock, chat message received).

**Architecture:** `sendNotification()` fetches tenant entitlements to derive an `allowedChannels` set before dispatching email/WhatsApp. A new `whatsapp.service.js` exports a no-op `sendWhatsAppMessage()` that mirrors the mailer interface. Three new `notify*` helpers + one daily cron job cover the previously-silent events.

**Tech Stack:** Node.js ES modules, Vitest, PostgreSQL via `query()` from `../lib/db.js`, Nodemailer (SMTP), `getEntitlements` from `../lib/subscription.js`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/services/whatsapp.service.js` | **Create** | No-op WhatsApp send skeleton |
| `apps/api/src/services/whatsapp.service.test.js` | **Create** | Tests for skeleton |
| `apps/api/db/migrations/0060_fix_notification_plan_feature_strings.sql` | **Create** | Rename sms→whatsapp in Gold/Platinum plan features |
| `apps/api/db/migrations/0061_invoice_overdue_notified_at.sql` | **Create** | Add `overdue_notified_at` column to invoice table |
| `apps/api/src/services/notification.service.js` | **Modify** | Tier enforcement + 3 new notify functions |
| `apps/api/src/services/notification.service.test.js` | **Modify** | Tests for tier enforcement + new functions |
| `apps/api/src/jobs/invoice-overdue.job.js` | **Create** | Daily job: mark + notify overdue invoices |
| `apps/api/src/jobs/invoice-overdue.job.test.js` | **Create** | Tests for overdue job |
| `apps/api/src/server.js` | **Modify** | Register invoice-overdue job on 24h interval |
| `apps/api/src/routes/inventory.routes.js` | **Modify** | Fire `notifyOutOfStock` when qty drops to 0 |
| `apps/api/src/routes/chat.routes.js` | **Modify** | Fire `notifyMessageReceived` after message insert |

---

## Task 1: WhatsApp service skeleton

**Files:**
- Create: `apps/api/src/services/whatsapp.service.js`
- Create: `apps/api/src/services/whatsapp.service.test.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/api/src/services/whatsapp.service.test.js
import { describe, it, expect, vi } from 'vitest'
import { sendWhatsAppMessage } from './whatsapp.service.js'

describe('whatsapp.service', () => {
  it('returns sent:false with reason NOT_CONFIGURED', async () => {
    const result = await sendWhatsAppMessage({ to: '+971501234567', message: 'Hello' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('NOT_CONFIGURED')
  })

  it('returns sent:false when no phone provided', async () => {
    const result = await sendWhatsAppMessage({ to: '', message: 'Hello' })
    expect(result.sent).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/api && npx vitest run src/services/whatsapp.service.test.js
```

Expected: FAIL — `Cannot find module './whatsapp.service.js'`

- [ ] **Step 3: Create the service file**

```js
// apps/api/src/services/whatsapp.service.js
import { logger } from '../lib/logger.js'

/**
 * Send a WhatsApp message server-side.
 * Currently a no-op skeleton. When ready to integrate, replace the body
 * with a Meta Cloud API or Twilio WhatsApp call.
 *
 * TODO: integrate Meta Cloud API (or Twilio) here
 *   Meta: POST https://graph.facebook.com/v18.0/{phone_number_id}/messages
 *   Twilio: client.messages.create({ from: 'whatsapp:+14155238886', to: `whatsapp:${to}`, body: message })
 */
export async function sendWhatsAppMessage({ to, message }) {
  if (!to) return { sent: false, reason: 'NO_PHONE' }

  logger.info('[WhatsApp skeleton] Would send message — provider not configured', {
    to: to.slice(0, 6) + '***',
    messageLength: message?.length ?? 0,
  })

  return { sent: false, reason: 'NOT_CONFIGURED' }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/api && npx vitest run src/services/whatsapp.service.test.js
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/whatsapp.service.js apps/api/src/services/whatsapp.service.test.js
git commit -m "feat(notifications): add WhatsApp service skeleton"
```

---

## Task 2: DB migration — fix Gold/Platinum notification plan strings

**Files:**
- Create: `apps/api/db/migrations/0060_fix_notification_plan_feature_strings.sql`

- [ ] **Step 1: Create the migration**

```sql
-- apps/api/db/migrations/0060_fix_notification_plan_feature_strings.sql
-- Rename deprecated SMS labels to WhatsApp in subscription plan features.
-- Gold: email_and_sms → email_and_whatsapp
-- Platinum: email_sms_webhook → email_whatsapp_webhook

UPDATE subscription_plan
SET features = jsonb_set(features, '{notifications}', '"email_and_whatsapp"')
WHERE code IN ('gold', 'enterprise')
  AND features->>'notifications' = 'email_and_sms';

UPDATE subscription_plan
SET features = jsonb_set(features, '{notifications}', '"email_whatsapp_webhook"')
WHERE code = 'platinum'
  AND features->>'notifications' = 'email_sms_webhook';
```

- [ ] **Step 2: Run the migration**

```bash
cd apps/api && node -e "
import('./src/lib/db.js').then(async ({ query }) => {
  const fs = await import('fs');
  const sql = fs.readFileSync('db/migrations/0060_fix_notification_plan_feature_strings.sql', 'utf8');
  await query(sql);
  console.log('Migration 0060 applied');
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `Migration 0060 applied`

- [ ] **Step 3: Verify**

```bash
cd apps/api && node -e "
import('./src/lib/db.js').then(async ({ query }) => {
  const { rows } = await query(\"SELECT code, features->>'notifications' AS notif FROM subscription_plan ORDER BY display_order\");
  console.table(rows);
  process.exit(0);
});
"
```

Expected output:
```
code       | notif
-----------|---------------------------
free       | in_app_only
bronze     | in_app_and_email
gold       | email_and_whatsapp
platinum   | email_whatsapp_webhook
enterprise | email_and_whatsapp
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/db/migrations/0060_fix_notification_plan_feature_strings.sql
git commit -m "feat(notifications): rename sms to whatsapp in Gold/Platinum plan features"
```

---

## Task 3: DB migration — invoice overdue_notified_at column

**Files:**
- Create: `apps/api/db/migrations/0061_invoice_overdue_notified_at.sql`

- [ ] **Step 1: Create the migration**

```sql
-- apps/api/db/migrations/0061_invoice_overdue_notified_at.sql
-- Tracks when an overdue notification was last sent for an invoice
-- so the daily job doesn't re-notify.

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_overdue_check
  ON invoice (status, due_date, overdue_notified_at)
  WHERE status IN ('ISSUED', 'PARTIALLY_PAID');
```

- [ ] **Step 2: Run the migration**

```bash
cd apps/api && node -e "
import('./src/lib/db.js').then(async ({ query }) => {
  const fs = await import('fs');
  const sql = fs.readFileSync('db/migrations/0061_invoice_overdue_notified_at.sql', 'utf8');
  await query(sql);
  console.log('Migration 0061 applied');
  process.exit(0);
});
"
```

Expected: `Migration 0061 applied`

- [ ] **Step 3: Commit**

```bash
git add apps/api/db/migrations/0061_invoice_overdue_notified_at.sql
git commit -m "feat(notifications): add overdue_notified_at column to invoice"
```

---

## Task 4: Tier enforcement in `sendNotification()`

**Files:**
- Modify: `apps/api/src/services/notification.service.js`
- Modify: `apps/api/src/services/notification.service.test.js`

- [ ] **Step 1: Add failing tests for tier enforcement**

Add these tests to the existing `describe('sendNotification', ...)` block in `notification.service.test.js`:

```js
// At the top of the file, add subscription mock:
vi.mock('../lib/subscription.js', () => ({
  getEntitlements: vi.fn(),
}))
```

Then inside `describe('sendNotification', ...)`:

```js
it('does NOT send email when tenant is on Free plan', async () => {
  const { sendMail } = await import('./mailer.service.js')
  const { getEntitlements } = await import('../lib/subscription.js')

  getEntitlements.mockResolvedValue({ features: { notifications: 'in_app_only' } })

  queryMock
    .mockResolvedValueOnce({ rows: [{ email_enabled: true, in_app_enabled: true, notify_order_new: true }] }) // prefs
    .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1', email: 'owner@test.com', phone: null }] }) // getUserContactInfo tenant
    .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com' }] }) // contact_info table
    .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] }) // getTenantIdForUser
    .mockResolvedValueOnce({ rows: [{ id: 'notif-1', title: 'Test' }] }) // INSERT notification_log
    .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE notification_log

  await sendNotification({
    userId: 'user-1',
    userType: 'RESTAURANT',
    notificationType: 'ORDER',
    notificationCategory: 'PLACED',
    title: 'New Order',
    message: 'Order placed',
  })

  expect(sendMail).not.toHaveBeenCalled()
})

it('sends email when tenant is on Bronze plan', async () => {
  const { sendMail } = await import('./mailer.service.js')
  const { getEntitlements } = await import('../lib/subscription.js')

  sendMail.mockResolvedValue({ messageId: 'msg-1' })
  getEntitlements.mockResolvedValue({ features: { notifications: 'in_app_and_email' } })

  queryMock
    .mockResolvedValueOnce({ rows: [{ email_enabled: true, in_app_enabled: true, notify_order_new: true }] })
    .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1', email: 'owner@test.com', phone: null }] })
    .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com' }] })
    .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'notif-1', title: 'New Order' }] })
    .mockResolvedValueOnce({ rowCount: 1 })

  await sendNotification({
    userId: 'user-1',
    userType: 'RESTAURANT',
    notificationType: 'ORDER',
    notificationCategory: 'PLACED',
    title: 'New Order',
    message: 'Order placed',
  })

  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@test.com' }))
})

it('defaults to in_app_only when entitlements fetch fails', async () => {
  const { sendMail } = await import('./mailer.service.js')
  const { getEntitlements } = await import('../lib/subscription.js')

  getEntitlements.mockRejectedValue(new Error('DB error'))

  queryMock
    .mockResolvedValueOnce({ rows: [{ email_enabled: true, in_app_enabled: true, notify_order_new: true }] })
    .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1', email: 'owner@test.com', phone: null }] })
    .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com' }] })
    .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'notif-1', title: 'New Order' }] })
    .mockResolvedValueOnce({ rowCount: 1 })

  await sendNotification({
    userId: 'user-1',
    userType: 'RESTAURANT',
    notificationType: 'ORDER',
    notificationCategory: 'PLACED',
    title: 'New Order',
    message: 'Order placed',
  })

  expect(sendMail).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx vitest run src/services/notification.service.test.js
```

Expected: FAIL — new tests fail because tier enforcement doesn't exist yet.

- [ ] **Step 3: Update `notification.service.js`**

Add these imports at the top of the file (after existing imports):

```js
import { getEntitlements } from '../lib/subscription.js'
import { sendWhatsAppMessage as sendWhatsAppMessageService } from './whatsapp.service.js'
import { buildWhatsAppUrl } from '../lib/whatsapp.js'
```

Remove the existing inline `whatsappService` object (lines 23–30) and the existing `import { buildWhatsAppUrl }` if it's not already imported separately.

Add these two functions before `sendNotification()`:

```js
/**
 * Resolve which notification channels are allowed for a given plan feature value.
 * @param {string|undefined} notificationsFeatureValue - value from plan features.notifications
 * @returns {Set<string>}
 */
export function resolveAllowedChannels(notificationsFeatureValue) {
  switch (notificationsFeatureValue) {
    case 'in_app_and_email':
      return new Set(['in_app', 'email'])
    case 'email_and_whatsapp':
    case 'email_whatsapp_webhook':
      return new Set(['in_app', 'email', 'whatsapp'])
    case 'in_app_only':
    default:
      return new Set(['in_app'])
  }
}

/**
 * Look up the tenant (restaurant/supplier) ID for a given app_user ID.
 */
async function getTenantIdForUser(userId, userType) {
  const table = userType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows } = await query(
    `SELECT s.id AS tenant_id
     FROM ${table} s
     JOIN app_user u ON u.email = s.contact_email
     WHERE u.id = $1`,
    [userId],
  )
  return rows[0]?.tenant_id || null
}
```

Replace the `channels` block inside `sendNotification()`. The full updated function body from the top through to the `channels` object should read:

```js
export async function sendNotification({
  userId,
  userType,
  notificationType,
  notificationCategory,
  title,
  message,
  referenceId = null,
  referenceType = null,
  metadata = null,
}) {
  try {
    const prefs = await getUserPreferences(userId, userType)
    const contact = await getUserContactInfo(userId, userType)

    // Tier enforcement: derive allowed channels from subscription plan
    let allowedChannels = new Set(['in_app']) // safe default
    try {
      const tenantId = await getTenantIdForUser(userId, userType)
      if (tenantId) {
        const entitlements = await getEntitlements(tenantId, userType)
        allowedChannels = resolveAllowedChannels(entitlements?.features?.notifications)
      }
    } catch (err) {
      logger.warn('Failed to resolve notification tier, defaulting to in_app', { err: err.message })
    }

    const channels = {
      email: allowedChannels.has('email') && isPrefEnabled(prefs, 'email_enabled') && !!contact?.email,
      whatsapp: allowedChannels.has('whatsapp') && isPrefEnabled(prefs, 'whatsapp_enabled') && !!contact?.phone,
      sms: false,
      push: false,
      inApp: isPrefEnabled(prefs, 'in_app_enabled'),
    }
```

Then replace the WhatsApp send block (the `if (channels.whatsapp && contact?.phone)` section) with:

```js
    if (channels.whatsapp && contact?.phone) {
      const waResult = await sendWhatsAppMessageService({ to: contact.phone, message })
      results.sms = waResult.sent
      // Store deep link in metadata for in-app display
      const whatsappUrl = buildWhatsAppUrl(contact.phone, message)
      if (whatsappUrl) metadataPayload.whatsappUrl = whatsappUrl
    }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/api && npx vitest run src/services/notification.service.test.js
```

Expected: All tests PASS (existing + new tier tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/notification.service.js apps/api/src/services/notification.service.test.js
git commit -m "feat(notifications): enforce subscription tier on email/WhatsApp channels"
```

---

## Task 5: Add three missing notify functions

**Files:**
- Modify: `apps/api/src/services/notification.service.js`
- Modify: `apps/api/src/services/notification.service.test.js`

- [ ] **Step 1: Write failing tests**

Add these tests in a new `describe` block in `notification.service.test.js`:

```js
describe('notifyInvoiceOverdue', () => {
  it('notifies restaurant and supplier when invoice is overdue', async () => {
    const { notifyInvoiceOverdue } = await import('./notification.service.js')
    const { getEntitlements } = await import('../lib/subscription.js')
    const { sendMail } = await import('./mailer.service.js')

    getEntitlements.mockResolvedValue({ features: { notifications: 'in_app_and_email' } })
    sendMail.mockResolvedValue({ messageId: 'msg-overdue' })

    // restaurant user lookup
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'restaurant-user-1' }] })
    // supplier user lookup
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'supplier-user-1' }] })
    // For each sendNotification call (restaurant): prefs, contact tenant, contact table, tenantId, INSERT log, UPDATE log
    queryMock
      .mockResolvedValueOnce({ rows: [{ email_enabled: true, in_app_enabled: true, notify_invoice_overdue: true }] })
      .mockResolvedValueOnce({ rows: [{ tenant_id: 'r-tenant', email: 'rest@test.com', phone: null }] })
      .mockResolvedValueOnce({ rows: [{ email: 'rest@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ tenant_id: 'r-tenant' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'notif-r' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
    // For supplier sendNotification: same pattern
    queryMock
      .mockResolvedValueOnce({ rows: [{ email_enabled: true, in_app_enabled: true, notify_invoice_overdue: true }] })
      .mockResolvedValueOnce({ rows: [{ tenant_id: 's-tenant', email: 'supp@test.com', phone: null }] })
      .mockResolvedValueOnce({ rows: [{ email: 'supp@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ tenant_id: 's-tenant' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'notif-s' }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    await notifyInvoiceOverdue({
      id: 'inv-1',
      invoice_number: 'INV-001',
      total_amount: 500,
      due_date: '2026-04-01',
      restaurant_id: 'rest-1',
      supplier_id: 'supp-1',
    })

    expect(sendMail).toHaveBeenCalledTimes(2)
  })
})

describe('notifyOutOfStock', () => {
  it('notifies supplier when product reaches zero stock', async () => {
    const { notifyOutOfStock } = await import('./notification.service.js')
    const { getEntitlements } = await import('../lib/subscription.js')
    const { sendMail } = await import('./mailer.service.js')

    getEntitlements.mockResolvedValue({ features: { notifications: 'in_app_and_email' } })
    sendMail.mockResolvedValue({ messageId: 'msg-oos' })

    queryMock
      .mockResolvedValueOnce({ rows: [{ name: 'Tomatoes', supplier_id: 'supp-1' }] }) // product lookup
      .mockResolvedValueOnce({ rows: [{ id: 'supp-user-1' }] }) // user lookup
      .mockResolvedValueOnce({ rows: [{ email_enabled: true, in_app_enabled: true, notify_out_of_stock: true }] })
      .mockResolvedValueOnce({ rows: [{ tenant_id: 's-tenant', email: 'supp@test.com', phone: null }] })
      .mockResolvedValueOnce({ rows: [{ email: 'supp@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ tenant_id: 's-tenant' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'notif-1' }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    await notifyOutOfStock({ productId: 'prod-1', warehouseId: 'wh-1', productName: 'Tomatoes' })

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'supp@test.com' }))
  })
})

describe('notifyMessageReceived', () => {
  it('notifies the supplier when a restaurant sends a message', async () => {
    const { notifyMessageReceived } = await import('./notification.service.js')
    const { getEntitlements } = await import('../lib/subscription.js')
    const { sendMail } = await import('./mailer.service.js')

    getEntitlements.mockResolvedValue({ features: { notifications: 'in_app_and_email' } })
    sendMail.mockResolvedValue({ messageId: 'msg-chat' })

    queryMock
      .mockResolvedValueOnce({ rows: [{ supplier_id: 'supp-1', restaurant_id: 'rest-1' }] }) // conversation
      .mockResolvedValueOnce({ rows: [{ id: 'supp-user-1' }] }) // supplier user
      .mockResolvedValueOnce({ rows: [{ email_enabled: true, in_app_enabled: true, notify_message_received: true }] })
      .mockResolvedValueOnce({ rows: [{ tenant_id: 's-tenant', email: 'supp@test.com', phone: null }] })
      .mockResolvedValueOnce({ rows: [{ email: 'supp@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ tenant_id: 's-tenant' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'notif-1' }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    await notifyMessageReceived({
      conversationId: 'conv-1',
      senderType: 'RESTAURANT',
      messagePreview: 'Hello, do you have tomatoes?',
    })

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'supp@test.com' }))
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx vitest run src/services/notification.service.test.js
```

Expected: FAIL — `notifyInvoiceOverdue`, `notifyOutOfStock`, `notifyMessageReceived` not exported.

- [ ] **Step 3: Add the three functions to `notification.service.js`**

Add after the existing `notifyLowStock` function at the end of the file:

```js
/**
 * Notify restaurant (owes) and supplier (is owed) when an invoice becomes overdue.
 * Called by the invoice-overdue daily job.
 */
export async function notifyInvoiceOverdue(invoice) {
  const promises = []

  const { rows: restaurantRows } = await query(
    `SELECT u.id FROM app_user u JOIN restaurant r ON r.contact_email = u.email WHERE r.id = $1`,
    [invoice.restaurant_id],
  )
  if (restaurantRows.length > 0) {
    promises.push(
      sendNotification({
        userId: restaurantRows[0].id,
        userType: 'RESTAURANT',
        notificationType: 'INVOICE',
        notificationCategory: 'invoice_overdue',
        title: 'Invoice Overdue',
        message: `Invoice ${invoice.invoice_number} for $${invoice.total_amount} was due on ${invoice.due_date} and is now overdue.`,
        referenceId: invoice.id,
        referenceType: 'INVOICE',
        metadata: { invoice_number: invoice.invoice_number, due_date: invoice.due_date },
      }).catch((err) => logger.error('notifyInvoiceOverdue restaurant failed', { err: err.message })),
    )
  }

  const { rows: supplierRows } = await query(
    `SELECT u.id FROM app_user u JOIN supplier s ON s.contact_email = u.email WHERE s.id = $1`,
    [invoice.supplier_id],
  )
  if (supplierRows.length > 0) {
    promises.push(
      sendNotification({
        userId: supplierRows[0].id,
        userType: 'SUPPLIER',
        notificationType: 'INVOICE',
        notificationCategory: 'invoice_overdue',
        title: 'Payment Overdue',
        message: `Invoice ${invoice.invoice_number} for $${invoice.total_amount} is overdue since ${invoice.due_date}.`,
        referenceId: invoice.id,
        referenceType: 'INVOICE',
        metadata: { invoice_number: invoice.invoice_number, due_date: invoice.due_date },
      }).catch((err) => logger.error('notifyInvoiceOverdue supplier failed', { err: err.message })),
    )
  }

  return Promise.allSettled(promises)
}

/**
 * Notify supplier when a product's available quantity drops to zero.
 * Call after any inventory adjustment that results in qty <= 0.
 */
export async function notifyOutOfStock({ productId, warehouseId, productName }) {
  const { rows: productRows } = await query(
    `SELECT p.name, p.supplier_id FROM product p WHERE p.id = $1`,
    [productId],
  )
  if (!productRows.length) return null

  const supplierId = productRows[0].supplier_id
  const name = productName || productRows[0].name

  const { rows: userRows } = await query(
    `SELECT u.id FROM app_user u JOIN supplier s ON s.contact_email = u.email WHERE s.id = $1`,
    [supplierId],
  )
  if (!userRows.length) {
    logger.warn('No app_user found for supplier in notifyOutOfStock', { supplierId })
    return null
  }

  return sendNotification({
    userId: userRows[0].id,
    userType: 'SUPPLIER',
    notificationType: 'OUT_OF_STOCK',
    notificationCategory: 'out_of_stock',
    title: 'Out of Stock',
    message: `${name} is now out of stock. Restock immediately to fulfil pending orders.`,
    referenceId: productId,
    referenceType: 'PRODUCT',
    metadata: { productId, warehouseId },
  }).catch((err) => {
    logger.error('notifyOutOfStock failed', { err: err.message, productId })
    return null
  })
}

/**
 * Notify the recipient of a conversation when a new message arrives.
 * If sender is RESTAURANT, notify the SUPPLIER side, and vice versa.
 */
export async function notifyMessageReceived({ conversationId, senderType, messagePreview }) {
  const { rows: convRows } = await query(
    `SELECT supplier_id, restaurant_id FROM conversation WHERE id = $1`,
    [conversationId],
  )
  if (!convRows.length) return null

  const conv = convRows[0]
  let recipientUserId, recipientType, senderLabel

  if (senderType === 'RESTAURANT') {
    // Notify supplier
    const { rows } = await query(
      `SELECT u.id FROM app_user u JOIN supplier s ON s.contact_email = u.email WHERE s.id = $1`,
      [conv.supplier_id],
    )
    if (!rows.length) return null
    recipientUserId = rows[0].id
    recipientType = 'SUPPLIER'
    senderLabel = 'A restaurant'
  } else {
    // Notify restaurant
    const { rows } = await query(
      `SELECT u.id FROM app_user u JOIN restaurant r ON r.contact_email = u.email WHERE r.id = $1`,
      [conv.restaurant_id],
    )
    if (!rows.length) return null
    recipientUserId = rows[0].id
    recipientType = 'RESTAURANT'
    senderLabel = 'A supplier'
  }

  const preview = messagePreview ? `: "${messagePreview.slice(0, 80)}"` : ''

  return sendNotification({
    userId: recipientUserId,
    userType: recipientType,
    notificationType: 'MESSAGE',
    notificationCategory: 'message_received',
    title: 'New message',
    message: `${senderLabel} sent you a message${preview}`,
    referenceId: conversationId,
    referenceType: 'CONVERSATION',
    metadata: { conversationId },
  }).catch((err) => {
    logger.error('notifyMessageReceived failed', { err: err.message, conversationId })
    return null
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/api && npx vitest run src/services/notification.service.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/notification.service.js apps/api/src/services/notification.service.test.js
git commit -m "feat(notifications): add notifyInvoiceOverdue, notifyOutOfStock, notifyMessageReceived"
```

---

## Task 6: Invoice overdue cron job

**Files:**
- Create: `apps/api/src/jobs/invoice-overdue.job.js`
- Create: `apps/api/src/jobs/invoice-overdue.job.test.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/api/src/jobs/invoice-overdue.job.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
vi.mock('../lib/db.js', () => ({ query: (...args) => queryMock(...args) }))
vi.mock('../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../services/notification.service.js', () => ({
  notifyInvoiceOverdue: vi.fn().mockResolvedValue([]),
}))

describe('checkOverdueInvoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
  })

  it('marks invoice OVERDUE and notifies when past due and unnotified', async () => {
    const { checkOverdueInvoices } = await import('./invoice-overdue.job.js')
    const { notifyInvoiceOverdue } = await import('../services/notification.service.js')

    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: 'inv-1',
          invoice_number: 'INV-001',
          total_amount: 300,
          due_date: '2026-04-01',
          restaurant_id: 'rest-1',
          supplier_id: 'supp-1',
        }],
      }) // SELECT overdue invoices
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE status + notified_at

    const result = await checkOverdueInvoices()

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('overdue_notified_at IS NULL'),
      expect.any(Array),
    )
    expect(notifyInvoiceOverdue).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-1' }))
    expect(result).toEqual({ processed: 1, notified: 1 })
  })

  it('returns 0 processed when no overdue invoices', async () => {
    const { checkOverdueInvoices } = await import('./invoice-overdue.job.js')
    queryMock.mockResolvedValueOnce({ rows: [] })

    const result = await checkOverdueInvoices()
    expect(result).toEqual({ processed: 0, notified: 0 })
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/api && npx vitest run src/jobs/invoice-overdue.job.test.js
```

Expected: FAIL — `Cannot find module './invoice-overdue.job.js'`

- [ ] **Step 3: Create the job file**

```js
// apps/api/src/jobs/invoice-overdue.job.js
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { notifyInvoiceOverdue } from '../services/notification.service.js'

/**
 * Daily job: find unpaid invoices past due_date, mark them OVERDUE,
 * and send notifications once (guarded by overdue_notified_at).
 */
export async function checkOverdueInvoices() {
  const { rows: overdueInvoices } = await query(
    `SELECT id, invoice_number, total_amount, due_date, restaurant_id, supplier_id
     FROM invoice
     WHERE status IN ('ISSUED', 'PARTIALLY_PAID')
       AND due_date < CURRENT_DATE
       AND overdue_notified_at IS NULL`,
    [],
  )

  logger.info('Invoice overdue job running', { count: overdueInvoices.length })

  if (overdueInvoices.length === 0) return { processed: 0, notified: 0 }

  let notified = 0

  for (const invoice of overdueInvoices) {
    try {
      await query(
        `UPDATE invoice SET status = 'OVERDUE', overdue_notified_at = NOW() WHERE id = $1`,
        [invoice.id],
      )
      await notifyInvoiceOverdue(invoice)
      notified++
    } catch (err) {
      logger.error('Failed to process overdue invoice', { invoiceId: invoice.id, error: err.message })
    }
  }

  return { processed: overdueInvoices.length, notified }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/api && npx vitest run src/jobs/invoice-overdue.job.test.js
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/jobs/invoice-overdue.job.js apps/api/src/jobs/invoice-overdue.job.test.js
git commit -m "feat(notifications): add invoice overdue daily job"
```

---

## Task 7: Register invoice-overdue job in server.js

**Files:**
- Modify: `apps/api/src/server.js`

- [ ] **Step 1: Add import**

In `apps/api/src/server.js`, add this import alongside the existing `executeScheduledOrders` import (around line 44):

```js
import { checkOverdueInvoices } from './jobs/invoice-overdue.job.js'
```

- [ ] **Step 2: Register the daily job**

In `server.js`, inside the `server.listen(PORT, () => { ... })` callback, add after the existing scheduled-orders block (after line 266):

```js
  // Invoice overdue job — runs once daily (24h interval)
  const INVOICE_OVERDUE_INTERVAL = 24 * 60 * 60 * 1000

  checkOverdueInvoices().catch((err) => {
    logger.error('Error in initial invoice overdue check:', err)
  })

  setInterval(() => {
    checkOverdueInvoices().catch((err) => {
      logger.error('Error in invoice overdue check:', err)
    })
  }, INVOICE_OVERDUE_INTERVAL)

  logger.info('Invoice overdue job started (runs every 24h)')
```

- [ ] **Step 3: Verify server starts without errors**

```bash
cd apps/api && node --experimental-vm-modules src/server.js &
sleep 3
curl -s http://localhost:3001/health | grep -o '"ok":true'
kill %1
```

Expected: `"ok":true`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/server.js
git commit -m "feat(notifications): register invoice overdue job on 24h interval"
```

---

## Task 8: Out-of-stock trigger in inventory.routes.js

**Files:**
- Modify: `apps/api/src/routes/inventory.routes.js`

- [ ] **Step 1: Add the import**

At the top of `inventory.routes.js`, add `notifyOutOfStock` to the existing notification service import:

```js
import {
  notifySupplierLowStock,
  notifyOutOfStock,
} from '../services/notification.service.js'
```

(If the file currently only imports `notifySupplierLowStock`, just add `notifyOutOfStock` to the destructure.)

- [ ] **Step 2: Add the out-of-stock trigger**

In the inventory adjustment route handler, immediately after the existing low-stock check block (after the closing `}` of the `if (settings.length > 0 && newQty < settings[0].low_stock_threshold)` block, around line 376), add:

```js
        // Out-of-stock trigger: fires once when qty transitions from >0 to 0
        if (newQty <= 0 && currentQty > 0) {
          const { rows: productNameRow } = await query('SELECT name FROM product WHERE id = $1', [productId])
          notifyOutOfStock({
            productId,
            warehouseId: adjustmentData.warehouseId || null,
            productName: productNameRow[0]?.name || null,
          }).catch((err) => logger.warn('Out-of-stock notification failed', { err: err.message }))
        }
```

- [ ] **Step 3: Run the inventory route tests to ensure nothing is broken**

```bash
cd apps/api && npx vitest run src/routes/inventory.routes.test.js
```

Expected: All existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/inventory.routes.js
git commit -m "feat(notifications): fire notifyOutOfStock when stock reaches zero"
```

---

## Task 9: Message-received trigger in chat.routes.js

**Files:**
- Modify: `apps/api/src/routes/chat.routes.js`

- [ ] **Step 1: Add the import**

At the top of `chat.routes.js`, add `notifyMessageReceived` to the notification service import (or add a new import if none exists):

```js
import { notifyMessageReceived } from '../services/notification.service.js'
```

- [ ] **Step 2: Add the notification call**

In the message-send route handler, after `await query('COMMIT')` (around line 752) and before the socket emit block, add:

```js
        // Notify the other party of the new message (fire-and-forget)
        notifyMessageReceived({
          conversationId,
          senderType: req.userData.role,
          messagePreview: messageData.content?.slice(0, 100) || '',
        }).catch((err) => logger.warn('Message received notification failed', { err: err.message }))
```

- [ ] **Step 3: Run the chat route tests to ensure nothing is broken**

```bash
cd apps/api && npx vitest run src/routes/chat.routes.test.js
```

Expected: All existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/chat.routes.js
git commit -m "feat(notifications): notify recipient on new chat message"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run all affected tests together**

```bash
cd apps/api && npx vitest run \
  src/services/whatsapp.service.test.js \
  src/services/notification.service.test.js \
  src/jobs/invoice-overdue.job.test.js \
  src/routes/inventory.routes.test.js \
  src/routes/chat.routes.test.js
```

Expected: All PASS, no failures.

- [ ] **Step 2: Run full test suite to catch regressions**

```bash
cd apps/api && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 3: Final commit if any straggler files remain unstaged**

```bash
git status
# If clean, nothing to do. If any files remain:
git add <any remaining files>
git commit -m "chore(notifications): final cleanup after hardening"
```
