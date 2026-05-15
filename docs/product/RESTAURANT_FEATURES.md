# Restaurant Features - Complete Implementation Summary

## 🎯 Overview

Supplify provides comprehensive restaurant procurement and inventory management, enabling restaurants to discover suppliers, place orders, manage inventory, track waste, and handle finances - ALL with real-time database data, NO mock data.

---

## 📋 Navigation & Access

### Restaurant Dashboard Sidebar Includes:

1. **Dashboard** - Overview of business metrics
2. **Quick Lists** - Create and schedule recurring orders
3. **Cart** - Shopping cart for orders
4. **Suppliers** - Browse and manage suppliers
5. **Inventory** - Real-time inventory tracking with smart suggestions
6. **Receiving** - Match deliveries and record quality
7. **Invoices** - View and pay supplier invoices
8. **Chat** - Communicate with suppliers
9. **Staff Roster** - Weekly scheduling, attendance, and labor cost tracking
10. **Settings** - Account and profile settings

---

## 🪑 Reservations Cockpit & Floor Builder

Supplify’s reservations module gives front-of-house teams a live operational command centre:

- **Drag-and-drop reservations board** with status swimlanes (Pending, Confirmed, Seated, Waitlist) and inline status transitions.
- **Full-width visual floor builder**:
  - Add preset table shapes (round, square, banquet, booth, chef’s table) and resize them to match reality.
  - Drag, rotate, recolor, and zone tables (main floor, patio, bar, VIP, private) with instant capacity totals.
  - Capture amenity tags (accessible, window view, high-top, power outlet, romantic, near music) and store notes per table.
  - Layout metadata (shape, rotation, size ratios, color, zone, notes) persists via the reservations API for consistent seat maps.
- **Guest flow intelligence** sits directly beneath the builder, surfacing hourly demand, waitlist load, and cancellation patterns.
- **Quick duplication & archival tools** to spin up seasonal layouts or retire tables without losing historical reservations.

---

## 👥 Staff App (Scheduling, Time & PTO)

The Staff App brings single-location labour management directly into Supplify:

- **Team directory** with contact details, wage types, hire dates, and live shift status (on/off clock).
- **Shift scheduling**:
  - Create, copy, and assign shifts with clear start/end times and role tagging.
  - Quick view of the upcoming week with unassigned coverage and notes.
- **Time & attendance**:
  - One-click web check-in/check-out with open-entry safeguards.
  - Track clock methods, break minutes, and notes; review recent punches instantly.
- **Foundational PTO & availability groundwork** (API-ready for future flows).
- **Payroll-ready groundwork** with structured time entries (breaks, overtime flags coming in later phases).

---

## 👥 Staff Roster & Scheduling

- Visual weekly grid to plan kitchen, floor, and cashier coverage per branch
- Assign roles to shifts and optionally send WhatsApp or in-app alerts
- Mobile-friendly check-in/out to capture attendance in real time
- Daily labor cost auto-calculated from scheduled vs actual hours

---

## 🔄 SYSTEM FLOWS

### **1. SMART REORDER SUGGESTIONS FLOW**

```
Restaurant views inventory
    ↓
[Backend Analysis]
  - Query inventory_movement_log for last 30 days
  - Calculate average daily usage
  - Compare 1-day, 3-day, 7-day, 10-day, 30-day, 60-day, 90-day usage
  - Analyze days between restocks (using LAG window function)
  - Identify usage trends (last 15 days vs previous 15 days)
  - Factor in supplier lead times
  - Check last order size and frequency
    ↓
Calculate Reorder Suggestions:
  - Days of stock remaining
  - Suggested reorder quantity
  - Urgency level (URGENT/HIGH/MEDIUM/LOW)
  - Confidence score (0-100)
    ↓
Display Smart Suggestions:
  - Show which items need reordering
  - Suggest quantity based on historical patterns
  - Alert on urgent items (< 3 days stock)
```

**Key Features:**

- Historical usage analysis (1, 3, 7, 10, 30, 60, 90 days)
- Average consumption between restocks
- Seasonality and trend detection
- Supplier lead times integration
- Last order size and frequency analysis
- Days of stock remaining calculation
- Confidence scoring for accuracy
- Urgency levels for prioritization

**API Endpoint:** `GET /api/restaurant-inventory/reorder-suggestions`

---

### **2. QUICK LISTS & RECURRING ORDERS FLOW**

#### A. Create Quick List

```
Navigate to Quick Lists → Click "Create Quick List"
    ↓
Dialog Opens:
  - Name (required)
  - Supplier (optional dropdown)
  - Description (optional)
    ↓
Click "Create"
    ↓
[API Call] POST /api/quick-lists
  - Create quick_list record
  - Link to restaurant
    ↓
List appears in Quick Lists page
    ↓
Click list to add products
```

#### B. Schedule Recurring Order

```
Click Quick List → "Schedule Recurring Order"
    ↓
Schedule Dialog Opens:
  - Frequency: Once per week, Three times per week, Biweekly, Monthly
  - Days of Week (checkbox grid):
    * Once per week: ONE day only (radio-like behavior)
    * Three times per week: Multiple days (default Mon, Wed, Fri)
    * Biweekly: Multiple days
    * Monthly: Not applicable
  - Preferred Time (HH:MM)
  - Auto-create Order (toggle)
    ↓
Click "Schedule"
    ↓
[API Call] POST /api/quick-lists/:id/schedule
  - Calculate next_execution_date based on frequency
  - Store scheduling params in quick_list table
  - Set is_scheduled = true
  - Set status = 'ACTIVE'
    ↓
Badge shows "Scheduled" on Quick List card
```

**Scheduling Frequencies Available:**

- `DAILY` - Every day at preferred time
- `WEEKLY` - Once per week on selected day (radio-like, one day only)
- `WEEKLY_3X` - Three times per week on selected days (default: Mon, Wed, Fri)
- `BIWEEKLY` - Every 2 weeks on selected days
- `MONTHLY` - Once per month

**Database Schema:**

```sql
ALTER TABLE quick_list ADD COLUMN supplier_id UUID REFERENCES supplier(id);
ALTER TABLE quick_list ADD COLUMN is_scheduled BOOLEAN DEFAULT false;
ALTER TABLE quick_list ADD COLUMN frequency TEXT CHECK (frequency IN ('DAILY', 'WEEKLY', 'WEEKLY_3X', 'BIWEEKLY', 'MONTHLY'));
ALTER TABLE quick_list ADD COLUMN days_of_week JSONB; -- ["MONDAY", "WEDNESDAY"]
ALTER TABLE quick_list ADD COLUMN preferred_time TIME;
ALTER TABLE quick_list ADD COLUMN next_execution_date DATE;
ALTER TABLE quick_list ADD COLUMN last_execution_date DATE;
ALTER TABLE quick_list ADD COLUMN status TEXT CHECK (status IN ('ACTIVE', 'PAUSED')) DEFAULT 'ACTIVE';
ALTER TABLE quick_list ADD COLUMN auto_create_order BOOLEAN DEFAULT true;
```

#### C. Order from Quick List

```
Click Quick List card → "Order Now"
    ↓
[API Call] GET /api/quick-lists/:id/items
  - Get all items in the list
  - Fetch current prices for each product
    ↓
Items added to cart automatically
    ↓
Navigate to Cart
    ↓
Review & place order (standard cart flow)
```

---

### **3. WASTE & SPOILAGE TRACKING FLOW**

#### A. Record Waste/Adjustment

```
Navigate to Inventory → Select Product → "Adjust"
    ↓
Adjustment Dialog:
  - Adjustment Type: WASTAGE / SPOILAGE / COUNT_CORRECTION / OTHER
  - Quantity (required)
  - Reason (optional)
  - Unit Cost (optional) - for cost tracking
  - Waste Category (if wastage/spoilage):
    * OVER_PRODUCTION
    * SPOILAGE
    * BREAKAGE
    * EXPIRED
    * OVERPORTIONING
    * OTHER
    ↓
Click "Record Adjustment"
    ↓
[API Call] POST /api/restaurant-inventory/adjust
  - Validate adjustment
  - Calculate total_cost = unit_cost × quantity
  - Create inventory_adjustment record
  - Update inventory quantity
  - Create inventory_movement_log entry
    ↓
Success notification
Inventory updated in real-time
```

#### B. View Waste Analytics

```
Navigate to Inventory → "Waste Analytics" tab
    ↓
[API Call] GET /api/restaurant-inventory/waste-analytics?period=30
  - Aggregate waste by product (last N days)
  - Calculate total waste quantity
  - Calculate total waste cost
  - Break down by wastage vs spoilage
  - Category breakdown (overproduction, breakage, etc.)
  - Calculate 7-day waste trend
    ↓
Display Waste Dashboard:
  - Summary cards: Total waste, Cost, Incidents
  - Top wasted products (by cost/quantity)
  - Waste vs Spoilage breakdown
  - Category breakdown
  - Trend analysis
  - Filter by period (7/14/30 days)
```

**Database Enhancements:**

```sql
ALTER TABLE inventory_adjustment ADD COLUMN unit_cost NUMERIC(14,3);
ALTER TABLE inventory_adjustment ADD COLUMN total_cost NUMERIC(14,3);
ALTER TABLE inventory_adjustment ADD COLUMN waste_category TEXT CHECK (waste_category IN ('OVER_PRODUCTION', 'SPOILAGE', 'BREAKAGE', 'EXPIRED', 'OVERPORTIONING', 'OTHER'));
```

**API Endpoints:**

- `POST /api/restaurant-inventory/adjust` - Record waste/adjustment
- `GET /api/restaurant-inventory/waste-analytics` - Get waste analytics

---

### **4. RESTAURANT INVENTORY MANAGEMENT FLOW**

#### A. View Inventory

```
Navigate to Inventory
    ↓
[API Call] GET /api/restaurant-inventory
  - Join restaurant_inventory with products
  - Join with suppliers
  - Calculate on-hand quantities
  - Check low stock status
  - Calculate average daily usage (last 30 days)
    ↓
Display Inventory Table:
  - Product Name, SKU, Supplier
  - Current Stock (quantity)
  - Low Stock Status (badge)
  - Average Daily Usage
  - Actions: Adjust, Pin, View History
```

#### B. Receive Stock

```
Order DELIVERED from supplier
    ↓
Navigate to Receiving
    ↓
[API Call] GET /api/receiving/pending-orders
  - Get orders with status DELIVERED
  - Group by delivery date
    ↓
Match delivery with order
    ↓
Click Order Card → "Receive Items"
    ↓
Receiving Form:
  - Product, ordered qty, received qty
  - Quality status: GOOD/DAMAGED/EXPIRED/SHORTAGE
  - Photos (optional)
  - Notes
    ↓
[API Call] POST /api/receiving/receive
  - Create receiving_log records
  - Auto-update restaurant_inventory
  - Create inventory_movement_log entries
  - Link receiving to order
    ↓
Inventory updated in real-time
```

#### C. Inventory History

```
Click Product → "View History"
    ↓
[API Call] GET /api/restaurant-inventory/history/:productId
  - Get inventory_movement_log for product
  - Filter by movement type (ADD, SUBTRACT, RECEIVED, WASTAGE)
    ↓
Display Timeline:
  - Date/Time
  - Movement Type
  - Quantity Change
  - Balance Before/After
  - Reason
  - Reference (order_id, adjustment_id)
```

---

### **5. FINANCE & INVOICING FLOW**

#### A. View Invoices

```
Navigate to Invoices
    ↓
[API Call] GET /api/restaurant-finance/invoices
  - Get all invoices for restaurant
  - Join with suppliers
  - Join with orders
  - Calculate total_paid, overdue_amount, days_overdue
    ↓
Display Invoice List:
  - Summary Cards: Total, Unpaid, Overdue, Total Amount
  - Invoice Cards:
    * Invoice number
    * Supplier name
    * Invoice/due dates
    * Total amount & balance due
    * Status badge
    * Order ID badge (if linked)
  - Filters: Status, Supplier
  - Search: Invoice number, supplier name
```

#### B. View Invoice Details

```
Click Invoice Card
    ↓
[API Call] GET /api/restaurant-finance/invoices/:id
  - Get invoice with line items
  - Get payment history
  - Get supplier details
    ↓
Invoice Detail Dialog:
  - Bill From (supplier info)
  - Invoice & Due dates
  - Line items table
  - Subtotal, Tax, Total
  - Payment History
  - Outstanding Balance
```

#### C. Record Payment

```
Click Invoice → "Record Payment"
    ↓
Payment Dialog:
  - Payment Date (default: today)
  - Payment Method: CASH / CHECK / BANK_TRANSFER / CREDIT_CARD / ACH / OTHER
  - Reference Number (optional)
  - Notes (optional)
    ↓
Click "Record Payment"
    ↓
[API Call] POST /api/restaurant-finance/invoices/:id/pay
  - Create payment record
  - Calculate remaining balance
  - Pay full remaining balance
  - Update invoice status
    ↓
Success notification
Invoice list refreshed
```

#### D. Overdue Alerts

```
[API Call] GET /api/restaurant-finance/overdue
  - Get invoices with due_date < CURRENT_DATE
  - Calculate days_overdue
  - Calculate amount_due
    ↓
Display Overdue List:
  - Invoice number & supplier
  - Days overdue (red badge)
  - Amount due
  - Payment due date
```

#### E. Expense Analytics

```
[API Call] GET /api/restaurant-finance/expenses?period=30
  - Aggregate expenses by supplier
  - Aggregate expenses by category
  - Calculate 12-month trend
    ↓
Display Expense Dashboard:
  - By Supplier: Count, Total Spent, Total Paid, Outstanding
  - By Category: Total Spent per category
  - Monthly Trend: 12-month spending chart
```

#### F. Supplier Statement

```
[API Call] GET /api/restaurant-finance/suppliers/:id/statement?startDate=&endDate=
  - Get all invoices for supplier in date range
  - Calculate opening/closing balance
  - Total charges & payments
    ↓
Display Account Statement:
  - Date range
  - All transactions (invoice numbers, dates, amounts)
  - Summary: Opening Balance, Charges, Payments, Closing Balance
```

---

### **6. RECEIVING & QUALITY CONTROL FLOW**

#### A. Match Delivery with Order

```
Navigate to Receiving
    ↓
[API Call] GET /api/receiving/pending-orders
  - Get orders with status: SHIPPED or DELIVERED
  - Group by expected delivery date
    ↓
Display Pending Orders:
  - Order ID and date
  - Supplier name
  - Expected delivery date
  - Status badge
    ↓
Click "Receive" button
```

#### B. Receive Items

```
Receiving Form Opens:
  - Products from order
  - Ordered quantity (read-only)
  - Received quantity (input)
  - Quality status dropdown:
    * GOOD
    * DAMAGED
    * EXPIRED
    * SHORTAGE
  - Photos upload
  - Notes
    ↓
Click "Record Receiving"
    ↓
[API Call] POST /api/receiving/receive
  - Create receiving_log for each item
  - For quality = GOOD: Update restaurant_inventory
  - Create inventory_movement_log entries
  - Link to order
    ↓
Generate Receiving Report:
  - Summary of received items
  - Quality issues highlighted
  - Photos attached (if any)
```

#### C. Receiving History

```
[API Call] GET /api/receiving/history
  - Get all receiving_log records
  - Filter by date range
    ↓
Display History:
  - Date & time
  - Order ID
  - Supplier
  - Products received
  - Quality status
  - Photos
```

---

## 🎯 FEATURE CATEGORIES

## 1️⃣ QUICK LISTS & RECURRING ORDERS

### Features Implemented:

#### ✅ Create & Manage Quick Lists

- Create named lists (e.g., "Weekly Produce")
- Add products to lists with quantities
- Edit list items
- Delete lists
- View list with current prices

#### ✅ Recurring Order Scheduling

- **Frequencies Available:**
  - Daily - Every day at preferred time
  - Once per week - Single day selection (radio-like)
  - Three times per week - Multiple days (default: Mon, Wed, Fri)
  - Biweekly - Every 2 weeks on selected days
  - Monthly - Once per month
- **Scheduling Features:**
  - Select days of week (checkbox grid)
  - Set preferred time (HH:MM)
  - Auto-create order toggle
  - Next execution date calculation
  - Status: ACTIVE / PAUSED
- **Navigation Restrictions:**
  - Once per week: Only ONE day selectable (replaces current)
  - Other frequencies: Multiple days selectable

#### ✅ One-Click Ordering

- "Order Now" adds all items to cart
- Fetches current prices in real-time
- Direct navigation to cart

### API Endpoints:

- `GET /api/quick-lists` - List all quick lists
- `GET /api/quick-lists/:id` - Get quick list details
- `POST /api/quick-lists` - Create quick list
- `PATCH /api/quick-lists/:id` - Update quick list
- `DELETE /api/quick-lists/:id` - Delete quick list
- `POST /api/quick-lists/:id/schedule` - Schedule recurring order
- `DELETE /api/quick-lists/:id/schedule` - Unschedule recurring order
- `GET /api/quick-lists/:id/items` - Get list items with current prices

---

## 2️⃣ SMART REORDER SUGGESTIONS

### Features Implemented:

#### ✅ Historical Usage Analysis

- 1-day, 3-day, 7-day, 10-day usage rates
- 30-day, 60-day, 90-day usage analysis
- Average consumption between restocks (window function)
- Usage trend detection (last 15 days vs previous 15 days)

#### ✅ Lead Time & Order Analysis

- Supplier lead times integration
- Last order size and frequency
- Days since last restock

#### ✅ Smart Suggestions

- Days of stock remaining calculation
- Suggested reorder quantity
- Urgency level (URGENT/HIGH/MEDIUM/LOW)
- Confidence score (0-100)

### API Endpoint:

- `GET /api/restaurant-inventory/reorder-suggestions` - Get smart suggestions

---

## 3️⃣ WASTE & SPOILAGE TRACKING

### Features Implemented:

#### ✅ Waste Recording

- Record adjustments (WASTAGE, SPOILAGE, COUNT_CORRECTION, OTHER)
- Quantity tracking
- Unit cost and total cost calculation
- Waste category classification:
  - OVER_PRODUCTION
  - SPOILAGE
  - BREAKAGE
  - EXPIRED
  - OVERPORTIONING
  - OTHER

#### ✅ Waste Analytics

- Aggregate waste by product
- Total waste quantity and cost
- Wastage vs Spoilage breakdown
- Category breakdown
- 7-day waste trend
- Top wasted products (by cost/quantity)
- Filter by period (7/14/30 days)

### API Endpoints:

- `POST /api/restaurant-inventory/adjust` - Record waste/adjustment
- `GET /api/restaurant-inventory/waste-analytics` - Get waste analytics

---

## 4️⃣ RESTAURANT INVENTORY MANAGEMENT

### Features Implemented:

#### ✅ Inventory Display

- Product-centric view
- Current stock quantities
- Supplier names
- Low stock alerts
- Average daily usage (last 30 days)
- Branch tracking (if multi-branch)

#### ✅ Inventory Actions

- **Pin Items** - Pin important items to top
- **Adjust Inventory** - Record waste/adjustments
- **View History** - Timeline of inventory movements
- **CSV Import/Export**

#### ✅ Inventory History

- **Receive Stock** - Auto-update on receiving
- Movement types: ADD, SUBTRACT, RECEIVED, WASTAGE
- Balance before/after tracking
- Reference tracking (order_id, adjustment_id)

### API Endpoints:

- `GET /api/restaurant-inventory` - Get inventory with products
- `GET /api/restaurant-inventory/history` - Get all movement history
- `GET /api/restaurant-inventory/history/:productId` - Get product history
- `POST /api/restaurant-inventory/adjust` - Adjust inventory
- `POST /api/restaurant-inventory/add` - Manually add inventory
- `GET /api/restaurant-inventory/reorder-suggestions` - Smart suggestions

---

## 5️⃣ RECEIVING & QUALITY CONTROL

### Features Implemented:

#### ✅ Receiving Process

- Match deliveries with orders
- Record received quantities
- Quality status tracking:
  - GOOD
  - DAMAGED
  - EXPIRED
  - SHORTAGE

#### ✅ Receiving Features

- Photo attachments
- Notes and discrepancies
- Auto-update inventory on receiving
- Receiving history
- Receiving reports

### API Endpoints:

- `GET /api/receiving/pending-orders` - Get orders awaiting receiving
- `POST /api/receiving/receive` - Record receiving
- `GET /api/receiving/history` - Get receiving history
- `POST /api/receiving/report` - Generate receiving report

---

## 6️⃣ FINANCE & INVOICING

### Features Implemented:

#### ✅ Invoice Viewing

- View all invoices from suppliers
- Filter by status (ALL, ISSUED, PARTIALLY_PAID, PAID, OVERDUE, VOID)
- Search by invoice number or supplier name
- Summary cards: Total, Unpaid, Overdue, Total Amount
- Invoice cards show:
  - Invoice number
  - Supplier name
  - Order ID badge (if linked to order)
  - Order status badge
  - Invoice date, due date
  - Total amount, balance due
  - Status badge

#### ✅ Invoice Details

- View full invoice with line items
- Subtotal, tax, total
- Payment history
- Outstanding balance
- Download PDF (planned)

#### ✅ Payment Recording

- Record payments with:
  - Payment date
  - Payment method (CASH, CHECK, BANK_TRANSFER, CREDIT_CARD, ACH, OTHER)
  - Reference number
  - Notes
- Auto-calculate remaining balance
- Update invoice status

#### ✅ Overdue Tracking

- View overdue invoices
- Days overdue calculation
- Amount due per invoice
- Total overdue amount

#### ✅ Expense Analytics

- By Supplier: Invoice count, total spent, total paid, outstanding
- By Category: Total spent per category
- Monthly trend: 12-month spending chart
- Period filtering (7/14/30 days)

#### ✅ Supplier Statements

- View account statement per supplier
- Opening/closing balance
- Total charges & payments
- Invoice list with dates

### API Endpoints:

- `GET /api/restaurant-finance/invoices` - List invoices (with filters)
- `GET /api/restaurant-finance/invoices/:id` - Get invoice details
- `POST /api/restaurant-finance/invoices/:id/pay` - Record payment
- `GET /api/restaurant-finance/overdue` - Get overdue invoices
- `GET /api/restaurant-finance/expenses` - Get expense analytics
- `GET /api/restaurant-finance/suppliers/:id/statement` - Get supplier statement

---

## 7️⃣ CART & ORDERING

### Features Implemented:

#### ✅ Shopping Cart

- Add products to cart
- Multi-supplier carts
- Quantity adjustments
- Remove items
- View cart total

#### ✅ Order Placement

- Place orders from cart
- Select delivery date
- Add special instructions
- Review order before placing

#### ✅ Order Tracking

- View order status
- Status transitions: PLACED → ACKNOWLEDGED → PROCESSING → SHIPPED → COMPLETED
- View order details
- Order items with prices
- **Draft Orders**: Create orders as DRAFT before placing
- **Packing Slip**: Download packing slip data (JSON format, PDF planned)

#### ✅ Order Reminders

- Send reminders to suppliers for unacknowledged orders
- Reminder button available on orders with status PLACED
- Reminder count tracking (shows number of reminders sent)
- Notifications sent to suppliers when reminder is triggered
- **API Endpoint**: `POST /api/orders/:id/remind`
- **Usage**: Restaurants can send friendly reminders if an order hasn't been acknowledged
- Reminders tracked per order (`reminder_count`, `last_reminder_sent_at`)

---

## 8️⃣ CHAT & COMMUNICATION

### Features Implemented:

#### ✅ Conversations

- 1:1 chat with suppliers
- View all conversations
- Last message preview
- Unread count badge
- Timestamp display

#### ✅ Messaging

- Send/receive messages
- View message history
- Real-time updates (planned)
- Attachments support

---

## 9️⃣ SUPPLIER DISCOVERY

### Features Implemented:

#### ✅ Browse Suppliers

- List all suppliers
- View supplier profiles
- Search suppliers
- Filter by category

#### ✅ Supplier Details

- Company information
- Product catalog
- Contact information
- Delivery terms

---

## 🔟 ONBOARDING (Planned)

### Features Planned:

#### 🔄 Restaurant Profile Setup

- Business information
- Contact details
- Operating hours
- Delivery instructions

#### 🔄 Multi-Branch Support

- Create/edit branches
- Assign team members
- Consolidated reporting

---

## 🧑‍🍽️ PUBLIC RESERVATION PORTAL

### Highlights

- Guest-facing `/reserve` experience with responsive design
- Self-service availability search by date, time, and party size
- Live capacity checks against active tables and bookings
- Instant confirmation with management token + follow-up email/SMS hooks
- Manage or cancel existing reservations via secure tokenised links
- Custom notes for seating preferences, allergies, or special occasions
- Tokenized management URL for cancellations or updates (no login required)

### Guest Flow

1. Select restaurant, date, and party size
2. Preview open time slots with live capacity indicators
3. Provide contact details and optional notes
4. Receive confirmation + management token for future changes

### Operational Impact

- Reservations flow directly into the restaurant’s reservations board
- Notifications fire for new bookings and waitlist events
- Works even when restaurant accounts are offline—guests can self-serve

---

## 👥 STAFF SELF-SERVICE PORTAL

### Highlights

- Dedicated `/staff` login via passwordless magic link
- Personal dashboard with upcoming shifts, announcements, and documents
- Submit PTO requests, log shift swaps, and review history
- Mobile-friendly UI for on-the-go access
- Secure session tokens (12-hour expiry) with audit-ready trails

### Staff Flow

1. Request a secure link using work email
2. Open the dashboard to review shifts and key updates
3. Submit PTO or swap requests that sync with manager tools
4. Access training docs, policies, and acknowledgment resources

### Operational Impact

- Reduces manager overhead for simple requests
- Keeps team in sync with announcements and staffing changes
- Extends Supplify beyond the back office into the front-of-house team

---

## 🔐 AUTHENTICATION & AUTHORIZATION

### Restaurant Role Access:

- **Can Access**:
  - Dashboard
  - Quick Lists & Scheduling
  - Cart & Orders
  - Suppliers
  - Inventory & Waste Tracking
  - Receiving & Quality Control
  - Invoices & Payments
  - Chat
  - Settings

- **Cannot Access**:
  - Supplier-specific features
  - Admin-only areas
  - Other restaurants' data

---

## 📊 KEY INTEGRATIONS

### Order → Receiving → Inventory → Finance:

1. **Order Placed** → Cart items create order
2. **Order Shipped** → Supplier ships order
3. **Order Delivered** → Auto-appears in Receiving
4. **Receive Items** → Record quality & quantities
5. **Inventory Updated** → Auto-update restaurant_inventory
6. **Invoice Created** → Auto-created by supplier on delivery
7. **Invoice Paid** → Record payment, update balance

### Smart Reorder Suggestions → Quick Lists:

1. **View Reorder Suggestions** → Identify items needing reorder
2. **Add to Quick List** → Create/update recurring lists
3. **Schedule Recurring Order** → Automate future orders
4. **One-Click Order** → Quick order from list

---

## ✅ IMPLEMENTATION STATUS

### Fully Implemented ✅:

1. ✅ Authentication & Authorization
2. ✅ Product Browsing
3. ✅ Shopping Cart & Orders
4. ✅ Chat System
5. ✅ Quick Lists
6. ✅ **Recurring Order Scheduling** (Daily, Weekly, Weekly 3x, Biweekly, Monthly)
7. ✅ Restaurant Inventory Management
8. ✅ Inventory Movement History
9. ✅ **Smart Reorder Suggestions** (AI-powered analysis)
10. ✅ **Waste & Spoilage Tracking** (with cost analysis)
11. ✅ **Receiving & Quality Control**
12. ✅ **Finance & Invoicing** (view invoices, record payments, overdue tracking)
13. ✅ **Expense Analytics** (by supplier, category, trends)
14. ✅ **Supplier Statements**
15. ✅ **Real-Time Database** (NO mock data, ALL data from DB)
16. ✅ **Draft Orders** - Create orders as drafts before placing
17. ✅ **Notifications System** - In-app notifications with bell icon
18. ✅ **Extended Session Timeout** - 1 hour session (was 5 minutes)
19. ✅ **Order Reminders** - Send reminders to suppliers for unacknowledged orders
20. ✅ **Public Reservation Portal** - Guest self-service booking with live availability
21. ✅ **Staff Self-Service Portal** - Passwordless access for schedules, PTO, swaps, docs, and **clock in/out** with recent time entries

### Partially Implemented 🔄:

1. 🔄 Supplier Discovery (needs follow/block functionality)
2. 🔄 Multi-Branch Support (schema exists, UI planned)
3. 🔄 PDF Export for invoices (planned)
4. 🔄 Email Notifications (planned)
5. 🔄 Real-time Chat (WebSocket planned)

---

## 🚀 KEY DIFFERENTIATORS

### Real-Time Data

- **NO mock data** - All features query live database
- Instant updates on all changes
- Accurate calculations (waste costs, overdue amounts)
- Real supplier data, real inventory, real invoices

### Smart Features

- **AI-powered reorder suggestions** - Analyze historical patterns
- **Automatic scheduling** - Calculate next execution dates
- **Waste analytics** - Track costs and trends
- **Urgency detection** - Prioritize critical items

### Comprehensive Tracking

- **Complete audit trail** - All movements logged
- **Payment history** - Track every payment
- **Receiving history** - All deliveries documented
- **Cost analysis** - Track every dollar

---

**Last Updated**: October 28, 2025
**Version**: 2.1.0
**Status**: Production Ready
**Latest Changes**:

- Order status workflow: ACKNOWLEDGED → PROCESSING → SHIPPED → COMPLETED
- Draft order functionality
- Notification system with bell icon
- Session timeout extended to 1 hour
- Database migration: order status enum updated

## Order lifecycle (restaurant)

- PLACED → supplier acknowledges and fulfills
- DELIVERED → supplier marked delivered; Restaurant should perform Receiving
- RECEIVED_FULL / RECEIVED_PARTIAL → created by Receiving; updates inventory
- INVOICED → system creates invoice from received quantities
- CLOSED → after invoice fully paid

Receiving creates inventory movements and triggers invoice creation. Use the Receiving page to record actual quantities.
