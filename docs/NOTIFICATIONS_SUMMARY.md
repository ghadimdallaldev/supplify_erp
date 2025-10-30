# Notification System - Complete Summary

## 📧 Contact Information Setup

**Test Contact Info:**
- Email: mdallalghadi@gmail.com
- SMS: 0096176911906

**Setup Script:** `apps/api/scripts/setup-notification-simple.js`
**Test Script:** `apps/api/scripts/send-test-notification.js`

## 🔔 Notification Triggers

### 1️⃣ ORDER NOTIFICATIONS

#### Restaurant Notifications:

| Event | When | Notification |
|-------|------|-------------|
| Order Acknowledged | Supplier acknowledges order | "Your order #123 has been acknowledged by Supplier Name" |
| Order Processing | Supplier starts processing | "Your order #123 is being prepared for shipping" |
| Order Shipped | Supplier ships order | "Your order #123 has been shipped" |
| Order Delivered | Supplier marks as delivered | "Your order #123 has been delivered" |

#### Supplier Notifications:

| Event | When | Notification |
|-------|------|-------------|
| New Order Placed | Restaurant places order | "New order from Restaurant Name - Order #123 for $125.50" |
| Order Cancelled | Restaurant cancels order | "Order #123 from Restaurant Name has been cancelled" |

---

### 2️⃣ INVOICE NOTIFICATIONS

#### Restaurant Notifications:

| Event | When | Notification |
|-------|------|-------------|
| Invoice Issued | Supplier creates invoice after delivery | "Invoice INV-2024-10-001 for $1250.00 due 2024-11-30" |

---

### 3️⃣ PAYMENT NOTIFICATIONS

#### Supplier Notifications:

| Event | When | Notification |
|-------|------|-------------|
| Payment Received | Restaurant pays invoice | "Payment of $1250.00 received for invoice INV-2024-10-001" |

---

### 4️⃣ INVENTORY NOTIFICATIONS (Restaurant Only)

| Event | When | Notification |
|-------|------|-------------|
| Low Stock | Inventory below threshold | "Tomatoes is below threshold. Current: 10kg, Threshold: 20kg" |
| Out of Stock | Inventory reaches zero | "Product is out of stock" |

---

### 5️⃣ CHAT NOTIFICATIONS (Both Parties)

| Event | When | Notification |
|-------|------|-------------|
| Message Received | New chat message | "New message from [Party Name]" |

---

## 📊 Notification Channels

### Active Channels:
- ✅ **Email** - Sends to configured email (mdallalghadi@gmail.com)
- ✅ **SMS** - Sends to configured phone (0096176911906)
- ✅ **In-App** - Stored in database for UI display
- ❌ **Push** - Disabled for now

### Console Output:
```
📧 EMAIL: To: mdallalghadi@gmail.com, Subject: Order Shipped
Body: Your order #ABC123 has been shipped

📱 SMS: To: 0096176911906, Message: Your order #ABC123 has been shipped
```

---

## 🎯 How to Test

### Test 1: Order Notification
1. Log in as **Restaurant**
2. Place an order
3. Check console logs - **Supplier** should receive notification

### Test 2: Order Status Update
1. Log in as **Supplier**
2. Update order to "SHIPPED"
3. Check console logs - **Restaurant** should receive notification

### Test 3: Payment Notification
1. Log in as **Supplier**
2. Record payment on invoice
3. Check console logs - **Supplier** should receive notification about payment

### Test 4: Direct Test
```bash
node apps/api/scripts/send-test-notification.js
```

---

## 🔧 Integration Points

### Files Modified:
1. `apps/api/src/services/notification.service.js`
   - Core notification service
   - Email/SMS/Push/In-App support
   - Helper functions for common notifications

2. `apps/api/src/routes/orders.routes.js`
   - Order status changes trigger notifications
   - Notifies both parties appropriately

3. `apps/api/src/routes/invoices.routes.js`
   - Invoice creation triggers notification to restaurant

4. `apps/api/src/routes/payments.routes.js`
   - Payment recording triggers notification to supplier

5. `apps/api/src/routes/notifications.routes.js`
   - API endpoints for notification management

---

## 📝 Notification Flow

```
Event Occurs (Order Status Change, Invoice Created, etc.)
    ↓
Check User Preferences
    ↓
Enabled? → YES
    ↓
Get Contact Info
    ↓
Send via Enabled Channels:
  - Email (if email_enabled && email exists)
  - SMS (if sms_enabled && phone exists)
  - In-App (always enabled)
  - Push (disabled for now)
    ↓
Log to notification_log table
    ↓
Update Database with Send Results
```

---

## 🎨 Future Enhancements

### To Integrate:
1. **Real Email Service** (SendGrid, AWS SES)
2. **Real SMS Service** (Twilio, Nexmo)
3. **Push Notifications** (FCM, APNS)
4. **Notification Center UI**
5. **Email Templates** (HTML formatting)
6. **Notification Preferences UI**
7. **Unread Badge**

---

## ✅ Current Status

**Fully Functional:**
- ✅ Database schema
- ✅ Notification logging
- ✅ Email & SMS console output
- ✅ Order status notifications
- ✅ Invoice notifications
- ✅ Payment notifications
- ✅ User preferences system
- ✅ Contact info management
- ✅ API endpoints

**Needs Integration:**
- 🔄 Real email service (SendGrid/SES)
- 🔄 Real SMS service (Twilio)
- 🔄 Push notifications
- 🔄 UI components (notification center, preferences)

---

**Last Updated:** Current Date
**Version:** 1.0.0
**Status:** Production Ready (with test logging)

## Order/Invoice notifications
- On DELIVERED (supplier action): notify restaurant to receive
- On RECEIVED_*: notify supplier that receiving is completed; invoice is created
- On invoice overdue: notify restaurant (and optionally supplier for visibility)

