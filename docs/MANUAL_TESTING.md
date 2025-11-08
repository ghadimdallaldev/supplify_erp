# Manual Testing Guide - Supplify Platform

This document provides a comprehensive manual testing checklist for all features implemented in the Supplify platform.

---

## 📋 Table of Contents
1. [Authentication & Authorization](#authentication--authorization)
2. [Restaurant Features](#restaurant-features)
3. [Supplier Features](#supplier-features)
4. [Admin Features](#admin-features)
5. [Order Management](#order-management)
6. [Chat System](#chat-system)
7. [Inventory Management](#inventory-management)
8. [Finance & Invoicing](#finance--invoicing)
9. [Subscription & Usage](#subscription--usage)
10. [Notifications](#notifications)

---

## 🔐 Authentication & Authorization

### Test Cases

#### TC-AUTH-001: User Login
- [ ] Navigate to `/login`
- [ ] Enter valid credentials
- [ ] Click "Log in"
- [ ] Verify redirect to appropriate dashboard (restaurant/supplier/admin)
- [ ] Verify user data is loaded correctly
- [ ] Verify session token is stored

#### TC-AUTH-002: Invalid Login
- [ ] Enter invalid email
- [ ] Enter invalid password
- [ ] Verify error message displays
- [ ] Verify no redirect occurs

#### TC-AUTH-003: Logout
- [ ] Click logout button
- [ ] Verify redirect to login page
- [ ] Verify session cleared
- [ ] Attempt to access protected route - verify redirect to login

#### TC-AUTH-004: JWT Expiration Handling
- [ ] Wait for token to expire (or manually expire)
- [ ] Attempt to make API request
- [ ] Verify redirect to login with `?expired=true`
- [ ] Verify error message displayed

#### TC-AUTH-005: Role-Based Access
- [ ] Login as Restaurant - verify restaurant sidebar items
- [ ] Login as Supplier - verify supplier sidebar items
- [ ] Login as Admin - verify admin sidebar items
- [ ] Attempt to access unauthorized routes - verify access denied

---

## 🍽️ Restaurant Features

### Test Cases

#### TC-REST-001: Restaurant Dashboard
- [ ] Access restaurant dashboard
- [ ] Verify dashboard loads without errors
- [ ] Verify key metrics display (if implemented)
- [ ] Verify navigation sidebar is present

#### TC-REST-002: Browse Suppliers
- [ ] Navigate to Suppliers page
- [ ] Verify supplier list loads
- [ ] Click on supplier card
- [ ] Verify supplier detail page opens
- [ ] Verify products for supplier display
- [ ] Test search functionality
- [ ] Test filter by category (if available)

#### TC-REST-003: Follow/Unfollow Supplier
- [ ] Navigate to supplier detail page
- [ ] Click "Follow" button
- [ ] Verify supplier is followed
- [ ] Verify followed suppliers appear in followed list
- [ ] Click "Unfollow"
- [ ] Verify supplier is unfollowed

#### TC-REST-004: Add Products to Cart
- [ ] Browse supplier products
- [ ] Click "Add to Cart" on multiple products
- [ ] Verify items appear in cart
- [ ] Verify quantities can be adjusted
- [ ] Verify items can be removed
- [ ] Verify cart totals calculate correctly

#### TC-REST-005: Place Order
- [ ] Add items to cart
- [ ] Navigate to Cart page
- [ ] Review order summary
- [ ] Click "Place Order"
- [ ] Verify order is created with status PLACED
- [ ] Verify redirect to orders page
- [ ] Verify order appears in orders list

#### TC-REST-006: Draft Orders
- [ ] Add items to cart
- [ ] Create order as DRAFT
- [ ] Verify draft order appears
- [ ] Edit draft order
- [ ] Convert draft to PLACED
- [ ] Verify status transition

#### TC-REST-007: Order Reminders
- [ ] Place an order (status: PLACED)
- [ ] Navigate to order detail page
- [ ] Verify "Send Reminder" button is visible
- [ ] Click "Send Reminder"
- [ ] Verify success message
- [ ] Verify reminder count increments
- [ ] Send multiple reminders - verify count updates
- [ ] Verify reminder button shows count after first reminder
- [ ] Verify supplier receives notification

#### TC-REST-008: Order Status Tracking
- [ ] View order with status PLACED
- [ ] Wait for supplier to acknowledge
- [ ] Verify status changes to ACKNOWLEDGED
- [ ] Verify notifications received
- [ ] Verify order detail page updates
- [ ] Track through: PROCESSING → SHIPPED → COMPLETED

#### TC-REST-009: Quick Lists
- [ ] Navigate to Quick Lists
- [ ] Create new quick list
- [ ] Add products to quick list
- [ ] Verify products save to list
- [ ] Edit quick list name
- [ ] Delete quick list
- [ ] Create order from quick list

#### TC-REST-010: Recurring Orders
- [ ] Create or select quick list
- [ ] Click "Schedule Recurring Order"
- [ ] Test each frequency:
  - [ ] DAILY - verify execution
  - [ ] WEEKLY - verify single day selection
  - [ ] WEEKLY_3X - verify multiple days (Mon, Wed, Fri default)
  - [ ] BIWEEKLY - verify schedule
  - [ ] MONTHLY - verify schedule
- [ ] Set preferred time
- [ ] Toggle auto-create order
- [ ] Verify schedule saves
- [ ] Verify badge shows "Scheduled"
- [ ] Pause scheduled order
- [ ] Resume scheduled order

#### TC-REST-011: Restaurant Inventory
- [ ] Navigate to Inventory page
- [ ] Verify inventory list loads
- [ ] Verify low stock indicators
- [ ] View inventory detail
- [ ] Verify movement history displays
- [ ] Test search functionality
- [ ] Test filter options

#### TC-REST-012: Smart Reorder Suggestions
- [ ] Navigate to Inventory
- [ ] Click "Reorder Suggestions" tab
- [ ] Verify suggestions calculate correctly
- [ ] Verify urgency levels (URGENT/HIGH/MEDIUM/LOW)
- [ ] Verify confidence scores display
- [ ] Verify days of stock remaining
- [ ] Test adding suggestion to cart
- [ ] Test adding to quick list

#### TC-REST-013: Inventory Adjustments
- [ ] Select product from inventory
- [ ] Click "Adjust"
- [ ] Test different adjustment types:
  - [ ] WASTAGE - verify waste category options
  - [ ] SPOILAGE - verify category tracking
  - [ ] COUNT_CORRECTION
  - [ ] OTHER
- [ ] Enter quantity and unit cost
- [ ] Verify total cost calculates
- [ ] Submit adjustment
- [ ] Verify inventory updates
- [ ] Verify movement log entry created

#### TC-REST-014: Waste Analytics
- [ ] Navigate to Inventory → Waste Analytics
- [ ] Verify summary cards display:
  - [ ] Total waste
  - [ ] Total cost
  - [ ] Incident count
- [ ] Verify top wasted products list
- [ ] Verify waste vs spoilage breakdown
- [ ] Verify category breakdown
- [ ] Verify trend analysis
- [ ] Test period filters (7/14/30 days)

#### TC-REST-015: Receiving Orders
- [ ] Wait for order status to be COMPLETED
- [ ] Navigate to Receiving page
- [ ] Verify pending orders list
- [ ] Click "Receive Now" on an order
- [ ] Verify receiving form opens
- [ ] Enter received quantities
- [ ] Select quality status for each item:
  - [ ] ACCEPTED
  - [ ] DAMAGED
  - [ ] EXPIRED
  - [ ] SHORTAGE
- [ ] Enter quality score (1-5)
- [ ] Add delivery notes
- [ ] Submit receiving report
- [ ] Verify inventory updates automatically
- [ ] Verify receiving report appears in history
- [ ] Verify "Receive Now" button becomes disabled after receiving

#### TC-REST-016: Receiving History
- [ ] Navigate to Receiving → History tab
- [ ] Verify all received orders display
- [ ] Verify filters work (date range, supplier, status)
- [ ] Click on receiving report
- [ ] Verify detailed view opens
- [ ] Verify line items display correctly
- [ ] Verify quality scores and notes visible

#### TC-REST-017: Invoices List
- [ ] Navigate to Invoices page
- [ ] Verify analytics cards display:
  - [ ] Total Invoices
  - [ ] Outstanding Amount
  - [ ] Overdue Count
  - [ ] Total Paid
- [ ] Verify invoice list loads
- [ ] Verify status badges display correctly
- [ ] Verify overdue indicators
- [ ] Test search functionality
- [ ] Test status filter
- [ ] Test supplier filter

#### TC-REST-018: Invoice Details
- [ ] Click on invoice card
- [ ] Verify invoice detail dialog opens
- [ ] Verify all invoice information displays:
  - [ ] Invoice number
  - [ ] Supplier name
  - [ ] Dates (invoice, due, issue)
  - [ ] Line items
  - [ ] Totals (subtotal, tax, total)
  - [ ] Balance due
  - [ ] Payment status
- [ ] Verify "Payment History" tab works
- [ ] Verify line items table displays correctly

#### TC-REST-019: Record Payment
- [ ] Open invoice detail
- [ ] Click "Pay Invoice"
- [ ] Test full payment:
  - [ ] Select "Full Payment" mode
  - [ ] Verify amount auto-fills
  - [ ] Enter payment method
  - [ ] Enter payment date
  - [ ] Enter reference number (optional)
  - [ ] Submit payment
  - [ ] Verify invoice status updates
  - [ ] Verify balance becomes zero
- [ ] Test partial payment:
  - [ ] Select "Partial Payment" mode
  - [ ] Enter partial amount
  - [ ] Submit payment
  - [ ] Verify balance reduces correctly
  - [ ] Verify invoice still shows as partially paid
- [ ] Test credit note application:
  - [ ] Select "Apply Credit" mode
  - [ ] Verify available credit notes list
  - [ ] Select credit note
  - [ ] Verify credit amount displays
  - [ ] Submit payment
  - [ ] Verify credit applied
  - [ ] Verify credit note balance updates
- [ ] Test HQ payment:
  - [ ] Check "Paid by HQ" checkbox
  - [ ] Enter HQ notes
  - [ ] Submit payment
  - [ ] Verify payment record created

#### TC-REST-020: Invoice Analytics
- [ ] Navigate to Invoices page
- [ ] Verify analytics display correctly:
  - [ ] Total invoices count
  - [ ] Outstanding amount
  - [ ] Overdue invoices count
  - [ ] Total paid amount
  - [ ] Average days to pay
- [ ] Test period filter (All time, This month, This year)
- [ ] Verify analytics update based on filter

#### TC-REST-021: Chat with Supplier
- [ ] Navigate to Chat page
- [ ] Verify conversations list loads
- [ ] Click on supplier conversation
- [ ] Send a message
- [ ] Verify message appears in chat
- [ ] Test file attachments
- [ ] Verify unread count updates
- [ ] Test quick replies (if implemented)

---

## 🏪 Supplier Features

### Test Cases

#### TC-SUP-001: Supplier Dashboard
- [ ] Access supplier dashboard
- [ ] Verify dashboard loads
- [ ] Verify key metrics display
- [ ] Verify navigation sidebar

#### TC-SUP-002: Product Management
- [ ] Navigate to Products page
- [ ] View product list
- [ ] Create new product:
  - [ ] Enter product details
  - [ ] Set SKU (unique)
  - [ ] Select category
  - [ ] Add description
  - [ ] Upload image (if available)
  - [ ] Save product
- [ ] Edit existing product
- [ ] Delete product
- [ ] Test search functionality
- [ ] Test filter by category

#### TC-SUP-003: Price Management
- [ ] Select product
- [ ] Add new price
- [ ] Set valid from/to dates
- [ ] Verify price displays in product list
- [ ] Test price history view
- [ ] Update price
- [ ] Verify old price archive

#### TC-SUP-004: Inventory Management
- [ ] Navigate to Inventory page
- [ ] View inventory list
- [ ] Update available quantity
- [ ] Update reserved quantity
- [ ] Test warehouse assignment
- [ ] View inventory history

#### TC-SUP-005: Warehouse Management
- [ ] Navigate to Warehouses (if available)
- [ ] Create warehouse
- [ ] Assign products to warehouse
- [ ] View warehouse inventory
- [ ] Edit warehouse details
- [ ] Delete warehouse

#### TC-SUP-006: Manual Order Creation
- [ ] Navigate to Orders
- [ ] Click "Create Manual Order"
- [ ] Step 1: Select Restaurant
- [ ] Step 2: Add Products
- [ ] Step 3: Review items
- [ ] Step 4: Create order
- [ ] Verify order created with status PLACED
- [ ] Verify inventory reserved

#### TC-SUP-007: Order Receipt
- [ ] Wait for order from restaurant (or create manually)
- [ ] Verify order appears in "New" tab
- [ ] Verify order shows as PLACED
- [ ] Click order card
- [ ] Verify order detail page opens

#### TC-SUP-008: Order Processing Workflow
- [ ] Receive order (status: PLACED)
- [ ] Click "Acknowledge"
  - [ ] Verify status changes to ACKNOWLEDGED
  - [ ] Verify restaurant receives notification
  - [ ] Verify button becomes disabled
- [ ] Click "Start Processing"
  - [ ] Verify status changes to PROCESSING
  - [ ] Verify notification sent
- [ ] Click "Mark as Shipped"
  - [ ] Verify status changes to SHIPPED
  - [ ] Verify notification sent
- [ ] Click "Complete Order"
  - [ ] Verify status changes to COMPLETED
  - [ ] Verify restaurant inventory updated
  - [ ] Verify invoice created automatically
  - [ ] Verify notification sent
  - [ ] Verify button becomes permanently disabled

#### TC-SUP-009: Order Reminder Receipt
- [ ] Receive order from restaurant (status: PLACED)
- [ ] Wait for restaurant to send reminder
- [ ] Verify notification received
- [ ] Verify notification title: "Order Reminder"
- [ ] Verify notification includes order details
- [ ] Verify reminder count tracked (in order details)

#### TC-SUP-010: Packing Slip
- [ ] Open order detail
- [ ] Navigate to "Packing Slip" tab
- [ ] Verify all order items display
- [ ] Verify quantities and prices correct
- [ ] Test print functionality
- [ ] Test download (if available)

#### TC-SUP-011: Invoice Generation
- [ ] Complete order (status: COMPLETED)
- [ ] Navigate to Invoices page
- [ ] Verify invoice automatically created
- [ ] Verify invoice number format (INV-YYYY-MM-XXXXXX)
- [ ] Verify line items match order items
- [ ] Verify totals calculate correctly
- [ ] Verify due date set (30 days default)

#### TC-SUP-012: Invoice Management
- [ ] View invoice list
- [ ] Open invoice detail
- [ ] Verify all invoice information
- [ ] Test invoice status updates:
  - [ ] ISSUED
  - [ ] PARTIALLY_PAID
  - [ ] PAID
  - [ ] VOID (if applicable)
- [ ] Test invoice filtering
- [ ] Test invoice search

#### TC-SUP-013: Fulfillment Management
- [ ] Navigate to Fulfillment page (if available)
- [ ] View pending deliveries
- [ ] Assign delivery driver
- [ ] Update delivery status
- [ ] Track delivery progress

#### TC-SUP-014: Chat with Restaurant
- [ ] Navigate to Chat page
- [ ] View conversations with restaurants
- [ ] Start new conversation
- [ ] Send message
- [ ] Receive message
- [ ] Test file attachments
- [ ] Verify unread count

---

## 👨‍💼 Admin Features

### Test Cases

#### TC-ADMIN-001: Admin Dashboard
- [ ] Login as admin
- [ ] Access admin dashboard
- [ ] Verify dashboard loads
- [ ] Verify key metrics:
  - [ ] Total Suppliers
  - [ ] Total Restaurants
  - [ ] Total Products
  - [ ] Total Orders
- [ ] Verify navigation sidebar shows admin items only

#### TC-ADMIN-002: Subscription Plans Management
- [ ] Navigate to Admin → Plans
- [ ] View all subscription plans
- [ ] Create new plan:
  - [ ] Enter plan details (name, price, interval)
  - [ ] Set limits JSONB (e.g., products, orders_per_day, warehouses)
  - [ ] Configure features JSONB (e.g., {"chat": "enabled", "multi_branch": true})
  - [ ] Save plan
- [ ] Edit existing plan:
  - [ ] Update plan limits
  - [ ] Update plan features JSONB
  - [ ] Save changes
- [ ] Verify plan updates reflect immediately in tenant subscriptions
- [ ] Delete plan (if allowed)

#### TC-ADMIN-003: Tenant Subscriptions
- [ ] Navigate to tenant subscriptions view
- [ ] View all tenant subscriptions
- [ ] Change tenant's plan:
  - [ ] Select tenant
  - [ ] Select new plan
  - [ ] Verify subscription updates
  - [ ] Verify limits update immediately
- [ ] View tenant usage meters
- [ ] View subscription history

#### TC-ADMIN-004: Plan Features (Subscription-Based)
- [ ] Navigate to Admin → Plans
- [ ] Select a plan (Free, Bronze, Gold, Platinum)
- [ ] Edit plan features JSONB field:
  - [ ] Add a feature: `{"feature_key": "enabled"}` or `{"feature_key": true}`
  - [ ] Remove a feature from JSONB
  - [ ] Update feature value (boolean or string)
- [ ] Save changes
- [ ] Verify changes are immediately reflected:
  - [ ] All tenants on the plan get access to new features
  - [ ] All tenants on the plan lose access to removed features
- [ ] Test feature access from tenant perspective:
  - [ ] Login as tenant on updated plan
  - [ ] Verify enabled features are accessible (UI shows, API allows)
  - [ ] Verify disabled features are not accessible (UI hidden, API blocks)
- [ ] Test `/api/subscriptions/features/:featureKey` endpoint:
  - [ ] Call endpoint as tenant
  - [ ] Verify response matches plan features JSONB

#### TC-ADMIN-005: Usage Meters
- [ ] Navigate to tenant usage view
- [ ] View usage meters for tenant
- [ ] Verify usage counts display correctly:
  - [ ] Products count
  - [ ] Orders per day
  - [ ] Branches/Warehouses count
  - [ ] Chat messages per day
- [ ] Verify limits display
- [ ] Verify percentage usage (80% warning, 100% block)
- [ ] Test usage reset (if available)

#### TC-ADMIN-006: Limit Overrides
- [ ] Navigate to tenant limit overrides
- [ ] View current overrides
- [ ] Create limit override:
  - [ ] Select tenant
  - [ ] Select limit type
  - [ ] Set override value (or unlimited)
  - [ ] Save override
- [ ] Verify override applies immediately
- [ ] Edit override
- [ ] Delete override
- [ ] Verify returns to plan default

#### TC-ADMIN-007: Audit Logs
- [ ] Navigate to Audit Logs
- [ ] View audit log list
- [ ] Test filters:
  - [ ] User filter
  - [ ] Action type filter
  - [ ] Date range filter
- [ ] Test search functionality
- [ ] View audit log detail
- [ ] Test pagination
- [ ] Test export (if available)

#### TC-ADMIN-008: Supplier Management
- [ ] Navigate to Admin → Suppliers
- [ ] View supplier list
- [ ] Create supplier
- [ ] Edit supplier details
- [ ] View supplier products
- [ ] View supplier orders
- [ ] View supplier analytics

#### TC-ADMIN-009: Restaurant Management
- [ ] Navigate to Admin → Restaurants
- [ ] View restaurant list
- [ ] Create restaurant
- [ ] Edit restaurant details
- [ ] View restaurant orders
- [ ] View restaurant inventory
- [ ] View restaurant analytics

#### TC-ADMIN-010: Chat Admin Mode
- [ ] Navigate to Chat
- [ ] Verify admin can view all conversations
- [ ] Join existing conversation:
  - [ ] Click on conversation
  - [ ] Verify admin indicator shows
  - [ ] Send message as admin
  - [ ] Verify message shows admin badge
- [ ] Start new conversation:
  - [ ] Select restaurant and supplier
  - [ ] Create conversation
  - [ ] Send initial message
  - [ ] Verify all parties added

---

## 📦 Order Management

### Test Cases

#### TC-ORD-001: Multi-Supplier Order Splitting
- [ ] Create order with items from multiple suppliers
- [ ] Verify order automatically splits:
  - [ ] One order per supplier created
  - [ ] Each order contains only items from that supplier
  - [ ] Order totals calculate correctly per supplier
- [ ] Verify each supplier sees only their order
- [ ] Verify restaurant sees all split orders

#### TC-ORD-002: Order Status Synchronization
- [ ] Restaurant places order (status: PLACED)
- [ ] Login as supplier
- [ ] Verify supplier sees order with status PLACED
- [ ] Supplier acknowledges order
- [ ] Login as restaurant
- [ ] Verify restaurant sees status ACKNOWLEDGED
- [ ] Test all status transitions:
  - [ ] PLACED → ACKNOWLEDGED
  - [ ] ACKNOWLEDGED → PROCESSING
  - [ ] PROCESSING → SHIPPED
  - [ ] SHIPPED → COMPLETED
- [ ] Verify both sides see same status

#### TC-ORD-003: Order Cancellation
- [ ] Restaurant places order
- [ ] Restaurant cancels order
- [ ] Verify order status changes to CANCELLED
- [ ] Verify supplier receives notification
- [ ] Verify inventory reservation released
- [ ] Verify supplier cannot complete cancelled order

#### TC-ORD-004: Order Search & Filtering
- [ ] Test order search by:
  - [ ] Order ID
  - [ ] Restaurant name (supplier view)
  - [ ] Supplier name (restaurant view)
- [ ] Test status filter
- [ ] Test date range filter
- [ ] Test supplier filter (admin/restaurant view)
- [ ] Test pagination

---

## 💬 Chat System

### Test Cases

#### TC-CHAT-001: Conversation Creation
- [ ] Restaurant navigates to Chat
- [ ] Click "New Conversation"
- [ ] Select supplier
- [ ] Send first message
- [ ] Verify conversation created
- [ ] Verify both parties can see conversation

#### TC-CHAT-002: Messaging
- [ ] Open conversation
- [ ] Send text message
- [ ] Verify message appears immediately
- [ ] Send message with attachment
- [ ] Verify attachment uploads
- [ ] Verify attachment displays
- [ ] Verify message timestamps

#### TC-CHAT-003: Message Limits
- [ ] Check plan limit for messages per day
- [ ] Send messages up to limit
- [ ] Verify warning at 80%
- [ ] Verify block at 100%
- [ ] Verify upgrade prompt displays

#### TC-CHAT-004: Unread Counts
- [ ] Send message from supplier to restaurant
- [ ] Verify restaurant sees unread count
- [ ] Restaurant opens conversation
- [ ] Verify unread count clears
- [ ] Verify notifications update

---

## 📊 Inventory Management

### Test Cases

#### TC-INV-001: Warehouse Inventory
- [ ] Supplier creates warehouse
- [ ] Assign products to warehouse
- [ ] Update inventory quantities
- [ ] Verify warehouse-specific inventory
- [ ] View warehouse inventory report

#### TC-INV-002: Inventory Reservations
- [ ] Supplier receives order
- [ ] Verify inventory reserved:
  - [ ] Available quantity decreases
  - [ ] Reserved quantity increases
- [ ] Supplier completes order
- [ ] Verify inventory released from reserved
- [ ] Verify available quantity updated

#### TC-INV-003: Low Stock Alerts
- [ ] Set low stock threshold
- [ ] Reduce inventory below threshold
- [ ] Verify low stock badge displays
- [ ] Verify alert notification (if implemented)

---

## 💰 Finance & Invoicing

### Test Cases

#### TC-FIN-001: Invoice Auto-Creation
- [ ] Supplier completes order
- [ ] Navigate to Invoices page
- [ ] Verify invoice automatically created
- [ ] Verify invoice number format
- [ ] Verify invoice links to order
- [ ] Verify line items match order items

#### TC-FIN-002: Invoice Numbering
- [ ] Complete multiple orders
- [ ] Verify invoice numbers sequential
- [ ] Verify format: INV-YYYY-MM-XXXXXX
- [ ] Verify no duplicates

#### TC-FIN-003: Tax Calculation
- [ ] Verify tax config exists for supplier
- [ ] Create order
- [ ] Complete order
- [ ] Verify invoice calculates tax correctly
- [ ] Verify subtotal + tax = total

#### TC-FIN-004: Payment Recording
- [ ] Restaurant receives invoice
- [ ] Record full payment
- [ ] Verify invoice status: PAID
- [ ] Verify balance: $0.00
- [ ] Record partial payment
- [ ] Verify invoice status: PARTIALLY_PAID
- [ ] Verify balance reduces

#### TC-FIN-005: Credit Notes
- [ ] Create credit note for restaurant
- [ ] Verify credit note appears
- [ ] Apply credit to invoice
- [ ] Verify credit applied
- [ ] Verify credit note balance updates
- [ ] Verify invoice balance reduces

#### TC-FIN-006: Overdue Tracking
- [ ] Create invoice with past due date
- [ ] Verify overdue badge displays
- [ ] Verify overdue amount calculated
- [ ] Verify overdue count in analytics
- [ ] Pay invoice
- [ ] Verify overdue status clears

#### TC-FIN-007: Financial Analytics
- [ ] Navigate to invoice analytics
- [ ] Verify all metrics calculate correctly:
  - [ ] Total invoices
  - [ ] Outstanding amount
  - [ ] Overdue count
  - [ ] Total paid
  - [ ] Average days to pay
- [ ] Test period filters
- [ ] Verify analytics update

---

## 📈 Subscription & Usage

### Test Cases

#### TC-SUB-000: Feature Checking API
- [ ] Login as Restaurant user
- [ ] Call `GET /api/subscriptions/features/:featureKey` for various features:
  - [ ] Test feature in plan: Verify response `{"featureKey": "chat", "isEnabled": true}`
  - [ ] Test feature not in plan: Verify response `{"featureKey": "advanced_analytics", "isEnabled": false}`
- [ ] Login as Supplier user
- [ ] Test same endpoint - verify supplier features checked correctly
- [ ] Test with tenant on Free plan - verify only Free plan features enabled
- [ ] Test with tenant on Platinum plan - verify all features enabled
- [ ] Test with tenant without subscription - verify all features disabled (returns false)

#### TC-SUB-001: Plan Enforcement (Limits & Features)
- [ ] Restaurant with Free plan
- [ ] Verify plan limits (orders_per_day, products, etc.)
- [ ] Verify plan features (check via `/api/subscriptions/features/:featureKey`)
- [ ] Place orders up to limit:
  - [ ] Verify orders_per_day limit enforced
  - [ ] Test 80% warning threshold (warning message appears)
  - [ ] Test 100% block threshold (order creation blocked)
  - [ ] Verify upgrade prompt displays when blocked
- [ ] Test feature access:
  - [ ] Attempt to access feature in plan - verify allowed
  - [ ] Attempt to access feature not in plan - verify blocked with upgrade prompt

#### TC-SUB-002: Usage Tracking
- [ ] Create product (for supplier)
- [ ] Verify products usage increments
- [ ] Create order
- [ ] Verify orders_per_day increments
- [ ] Verify usage resets daily

#### TC-SUB-003: Plan Upgrade
- [ ] Restaurant on Free plan
- [ ] Verify current plan features (check via `/api/subscriptions/features/:featureKey`)
- [ ] Attempt to access feature not in Free plan - verify blocked
- [ ] Attempt to exceed limit
- [ ] Click upgrade prompt
- [ ] Select new plan (e.g., Bronze → Gold)
- [ ] Verify subscription updates immediately
- [ ] Verify limits update immediately
- [ ] Verify new plan features unlock immediately:
  - [ ] Check feature endpoint returns enabled for new plan features
  - [ ] Verify UI elements appear for new features
  - [ ] Verify API endpoints allow access to new features

#### TC-SUB-004: Plan Downgrade
- [ ] Restaurant on Gold plan
- [ ] Verify current plan features (note which features are enabled)
- [ ] Use features available in Gold but not Bronze
- [ ] Downgrade to Bronze plan
- [ ] Verify subscription updates immediately
- [ ] Verify limits reduce immediately
- [ ] Verify disabled features lock immediately:
  - [ ] Check feature endpoint returns disabled for removed features
  - [ ] Verify UI elements hide for disabled features
  - [ ] Verify API endpoints block access to disabled features
- [ ] Verify existing data preserved (not deleted)
- [ ] Verify upgrade prompt shows for locked features

---

## 🔔 Notifications

### Test Cases

#### TC-NOTIF-001: Notification Receipt
- [ ] Place order as restaurant
- [ ] Verify supplier receives notification
- [ ] Supplier acknowledges order
- [ ] Verify restaurant receives notification
- [ ] Verify notification bell shows count

#### TC-NOTIF-002: Notification Preferences
- [ ] Navigate to Settings → Notifications
- [ ] Toggle email notifications
- [ ] Toggle SMS notifications
- [ ] Toggle in-app notifications
- [ ] Toggle specific notification types
- [ ] Verify preferences save

#### TC-NOTIF-003: Notification History
- [ ] Navigate to Notifications page
- [ ] View notification list
- [ ] Mark notification as read
- [ ] Mark all as read
- [ ] Filter by type
- [ ] Search notifications

#### TC-NOTIF-004: Order Reminder Notifications
- [ ] Restaurant sends reminder for order
- [ ] Verify supplier receives notification
- [ ] Verify notification title: "Order Reminder"
- [ ] Verify notification includes order details
- [ ] Click notification
- [ ] Verify navigates to order detail

---

## 🧪 Integration Tests

### Test Cases

#### TC-INT-001: Order → Receiving → Inventory Flow
- [ ] Restaurant places order
- [ ] Supplier completes order
- [ ] Verify order status: COMPLETED
- [ ] Verify order appears in Receiving
- [ ] Restaurant receives order
- [ ] Verify inventory updates automatically
- [ ] Verify movement log created

#### TC-INT-002: Order → Invoice → Payment Flow
- [ ] Supplier completes order
- [ ] Verify invoice auto-created
- [ ] Restaurant views invoice
- [ ] Restaurant records payment
- [ ] Verify invoice status updates
- [ ] Verify payment history tracked

#### TC-INT-003: Multi-Supplier Order Flow
- [ ] Restaurant adds products from 2 suppliers to cart
- [ ] Place order
- [ ] Verify 2 separate orders created
- [ ] Verify each supplier sees their order
- [ ] Complete both orders separately
- [ ] Verify 2 invoices created
- [ ] Verify restaurant sees both orders and invoices

---

## 🪑 Reservations Cockpit

### Test Cases

#### TC-RES-001: Reservations Board Status Lanes
- [ ] Navigate to Reservations page
- [ ] Confirm Pending, Confirmed, Seated, Waitlist columns render
- [ ] Verify each reservation appears under the correct status
- [ ] Check column counters match visible cards

#### TC-RES-002: Drag & Drop Status Update
- [ ] Drag a reservation from Pending to Confirmed
- [ ] Release card and verify success toast
- [ ] Refresh page; confirm reservation persists in Confirmed
- [ ] Repeat for Seated and Waitlist lanes

#### TC-RES-003: Add Table Preset
- [ ] Click a shape preset (e.g., Round)
- [ ] Confirm new table appears on the canvas with auto-generated name
- [ ] Verify active table and capacity summary updates
- [ ] Ensure table inspector opens with the new table selected

#### TC-RES-004: Drag, Resize, and Rotate Table
- [ ] Drag selected table across canvas; ensure it stays within bounds
- [ ] Resize via corner handle and confirm dimensions update smoothly
- [ ] Adjust rotation slider; verify canvas preview rotates
- [ ] Reset rotation via button and confirm zero degrees

#### TC-RES-005: Tag Table Metadata
- [ ] Change zone (e.g., VIP) and color swatch
- [ ] Toggle feature badges (Accessible, Window view)
- [ ] Enter note text
- [ ] Hover table to confirm feature badges display

#### TC-RES-006: Duplicate & Retire Table
- [ ] Click duplicate icon; verify copy appears offset with “copy” suffix
- [ ] Toggle Active off; ensure table hides from canvas
- [ ] Toggle Active on; confirm table reappears

#### TC-RES-007: Persist Layout Metadata
- [ ] Move, resize, rotate, recolor, and tag a table
- [ ] Click “Save layout”
- [ ] Refresh page; confirm all metadata remains intact

#### TC-RES-008: Guest Flow Intelligence Refresh
- [ ] Change analytics range (Day → Week)
- [ ] Confirm spinner shows then charts refresh
- [ ] Verify waitlist totals match board counts

#### TC-RES-009: Create Reservation Drawer
- [ ] Create new reservation via drawer
- [ ] Observe board auto-refreshes with new entry
- [ ] Confirm analytics metrics update after creation

#### TC-RES-010: Responsive Layout
- [ ] Resize viewport below 768px width
- [ ] Ensure inspector stacks beneath canvas
- [ ] Verify no horizontal scrolling is required for controls

---

## 🐛 Error Handling Tests

### Test Cases

#### TC-ERR-001: Network Errors
- [ ] Disconnect internet
- [ ] Attempt API call
- [ ] Verify error message displays
- [ ] Verify graceful degradation

#### TC-ERR-002: Validation Errors
- [ ] Submit form with invalid data
- [ ] Verify validation messages display
- [ ] Verify specific field errors highlight

#### TC-ERR-003: Permission Errors
- [ ] Attempt unauthorized action
- [ ] Verify 403 error handling
- [ ] Verify user-friendly message

#### TC-ERR-004: Not Found Errors
- [ ] Access invalid order ID
- [ ] Verify 404 error handling
- [ ] Verify redirect or message

---

## 📝 Notes

### Testing Best Practices
1. **Test with Real Data**: Use actual database data, not mocks
2. **Test Role Separation**: Verify restaurants cannot access supplier features and vice versa
3. **Test Edge Cases**: Zero quantities, null values, very large numbers
4. **Test Status Transitions**: Verify all valid transitions work
5. **Test Concurrency**: Multiple users acting on same resource
6. **Test Error States**: Invalid inputs, missing data, network failures
7. **Test Notifications**: Verify notifications sent at correct times
8. **Test Limits**: Verify plan limits enforced correctly
9. **Test Data Integrity**: Verify related data updates correctly (inventory, invoices, etc.)
10. **Test UI Responsiveness**: Verify all buttons, forms, dialogs work correctly

### Known Limitations
- PDF generation for invoices (planned)
- Email notifications (planned)
- Real-time chat updates (WebSocket planned)
- Advanced analytics dashboards (planned)

### Test Environment Setup
1. Ensure database is running
2. Ensure Keycloak is running
3. Seed test data (suppliers, restaurants, products)
4. Create test users for each role
5. Clear caches if needed

---

## ✅ Test Completion Checklist

After completing all manual tests, verify:
- [ ] All test cases executed
- [ ] All bugs documented
- [ ] Critical bugs fixed
- [ ] Regression tests passed
- [ ] Performance acceptable
- [ ] All features working as expected
- [ ] Documentation updated

---

**Last Updated**: 2024-12-19
**Version**: 2.0.0

**Recent Changes**:
- Removed feature flag system - features now controlled solely by subscription plan features JSONB field
- Added test cases for subscription-based feature checking (TC-SUB-000)
- Updated admin test cases to reflect plan features management via JSONB (TC-ADMIN-004)
- Enhanced plan upgrade/downgrade tests to verify feature access changes (TC-SUB-003, TC-SUB-004)
- Updated plan enforcement tests to include feature checking (TC-SUB-001)

