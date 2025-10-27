# Restaurant Features - Implementation Summary

## 🎯 Overview
Supplify provides a comprehensive restaurant procurement and inventory management platform, enabling restaurants to discover suppliers, place orders, manage inventory, and track finances.

---

## 🚀 CURRENT IMPLEMENTATION STATUS

### ✅ **ALREADY IMPLEMENTED** (from existing work):

1. **Authentication & Authorization** ✅
   - Keycloak OIDC integration
   - Restaurant role support
   - Secure cookie-based sessions

2. **Product Browsing** ✅
   - View all products from suppliers
   - Filter by supplier
   - Search functionality
   - Product detail pages

3. **Shopping Cart** ✅
   - Add products to cart
   - Multi-supplier carts
   - Quantity adjustments
   - Place orders

4. **Order Management** ✅
   - View orders
   - Order status tracking
   - Order detail pages

5. **Chat System** ✅
   - 1:1 chat with suppliers
   - Message history
   - Real-time communication

6. **Quick Lists** ✅
   - Create lists for recurring orders
   - Add products to lists
   - One-click "Order Now" adds all items to cart
   - Schedule recurring orders (daily/weekly/monthly)
   - View list items with prices

7. **Receiving & Quality Control** ✅
   - Dedicated receiving screen
   - Match deliveries with orders
   - Quality status tracking
   - Auto-update restaurant inventory
   - Receiving history

8. **Restaurant Inventory** ✅
   - Track received stock
   - Low stock alerts
   - Multi-unit support
   - Movement history
   - CSV import/export
   - Stock adjustments
   - Pin items to top

---

## 📋 TO IMPLEMENT (Detailed Breakdown)

---

## 1️⃣ **ONBOARDING & ACCOUNT SETUP**

### Business Profile
- Company name, type (restaurant, café, hotel, catering)
- Business registration number
- Tax ID / VAT number
- Contact information (owner, manager, finance, kitchen)
- Address and delivery instructions
- Operating hours
- Logo upload

### Multi-Branch Management
- Create/edit branches
- Assign team members to branches
- View consolidated reports

### Subscription & Billing
- View current plan (Free/Bronze/Gold/Platinum)
- Upgrade/downgrade
- Billing history
- Renewal dates

### Database Schema Needed:
```sql
-- restaurant table extension
ALTER TABLE restaurant ADD COLUMN business_type TEXT;
ALTER TABLE restaurant ADD COLUMN registration_number TEXT;
ALTER TABLE restaurant ADD COLUMN tax_id TEXT;
ALTER TABLE restaurant ADD COLUMN logo_url TEXT;
ALTER TABLE restaurant ADD COLUMN operating_hours JSONB;
ALTER TABLE restaurant ADD COLUMN delivery_instructions TEXT;
ALTER TABLE restaurant ADD COLUMN subscription_tier TEXT DEFAULT 'FREE';
ALTER TABLE restaurant ADD COLUMN subscription_renewal_date TIMESTAMPTZ;

-- branches table
CREATE TABLE branch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurant(id),
  name TEXT NOT NULL,
  address_json JSONB,
  contact_info JSONB,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- restaurant_team table
CREATE TABLE restaurant_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurant(id),
  branch_id UUID REFERENCES branch(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT, -- 'owner', 'manager', 'purchasing', 'finance', 'kitchen'
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### UI Components:
- Settings page with tabs: Profile, Branches, Team, Subscription
- Form for business details
- Branch management interface
- Team member addition/removal

---

## 2️⃣ **SUPPLIER DISCOVERY & RELATIONSHIP MANAGEMENT**

### Browse Suppliers
- List all suppliers (public catalog)
- Filter by category, rating, distance
- Search suppliers
- View supplier profiles

### Supplier Profiles
- Company information
- Product catalog
- Rating and reviews
- Delivery terms (min order, lead time)
- Contact information

### Supplier Actions
- Follow/Pin suppliers (favorites)
- View mutual favorites
- Request quotes
- Send inquiries via chat
- Block/blacklist suppliers

### Database Schema Needed:
```sql
CREATE TABLE supplier_follow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurant(id),
  supplier_id UUID REFERENCES supplier(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(restaurant_id, supplier_id)
);

CREATE TABLE supplier_blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurant(id),
  supplier_id UUID REFERENCES supplier(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(restaurant_id, supplier_id)
);
```

### UI Components:
- Supplier catalog page
- Supplier detail page
- Favorites/Following interface
- Block/unblock functionality

---

## 3️⃣ **QUICK LISTS / RECURRING ORDERS**

### Quick Lists Feature
- Create named lists (e.g., "Weekly Produce")
- Add products to lists
- Edit quantities
- One-click ordering from lists
- Reorder past orders
- "Frequently Ordered" section

### Database Schema Needed:
```sql
CREATE TABLE quick_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurant(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE quick_list_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quick_list_id UUID REFERENCES quick_list(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product(id),
  quantity NUMERIC(14,3) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### UI Components:
- Quick Lists page
- Create/edit list dialog
- Add products to list
- "Order from List" button

---

## 4️⃣ **RECEIVING & QUALITY CONTROL**

### Receiving Screen
- Match deliveries with orders
- Record received quantities
- Mark damaged/expired items
- Photo attachments
- Generate receiving report
- Auto-update inventory

### Database Schema Needed:
```sql
-- Already exists: restaurant_inventory table
-- Need: receiving_log table

CREATE TABLE receiving_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES customer_order(id),
  restaurant_id UUID REFERENCES restaurant(id),
  product_id UUID REFERENCES product(id),
  ordered_qty NUMERIC(14,3) NOT NULL,
  received_qty NUMERIC(14,3) NOT NULL,
  damaged_qty NUMERIC(14,3) DEFAULT 0,
  notes TEXT,
  photos TEXT[], -- Array of photo URLs
  received_by UUID, -- restaurant_team member ID
  received_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE receiving_discrepancy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_log_id UUID REFERENCES receiving_log(id),
  type TEXT, -- 'SHORTAGE', 'DAMAGE', 'WRONG_ITEM', 'OVERAGE'
  description TEXT,
  quantity NUMERIC(14,3),
  photo_url TEXT,
  reported_to_supplier BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### UI Components:
- Receiving page
- Match order with delivery form
- Quantity input fields
- Photo upload
- Discrepancy reporting

---

## 5️⃣ **INVOICE MANAGEMENT**

### Restaurant-Side Invoice Viewing
- View invoices from suppliers
- Invoice details (items, totals, tax)
- Download PDFs
- Mark as paid
- Payment tracking

### Database Schema Needed:
```sql
-- invoices table already exists in supplier context
-- Need: restaurant-side tracking

CREATE TABLE restaurant_payment_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoice(id),
  restaurant_id UUID REFERENCES restaurant(id),
  payment_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'PAID', 'DISPUTED'
  paid_amount NUMERIC(14,3),
  paid_date TIMESTAMPTZ,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### UI Components:
- Invoices page
- Invoice detail view
- Payment status tracking
- "Mark as Paid" button

---

## 6️⃣ **ANALYTICS & INSIGHTS**

### Dashboard
- Total spend (monthly, YTD)
- Top suppliers by spend
- Top categories
- Order count
- Average delivery time
- Order accuracy rate

### Database Schema Needed:
```sql
-- Use existing tables with aggregate queries
-- Add indexes for performance

CREATE INDEX idx_order_restaurant_date ON customer_order(restaurant_id, created_at);
CREATE INDEX idx_order_status ON customer_order(status);
CREATE INDEX idx_receiving_restaurant ON receiving_log(restaurant_id);
```

### UI Components:
- Analytics dashboard
- Charts (spend, categories, suppliers)
- Reports export
- Date range filters

---

## 7️⃣ **INVENTORY MANAGEMENT**

### Restaurant Inventory Module
- Track stock quantities (received)
- Manual adjustments (wastage, spoilage)
- Low-stock alerts
- Product-level view
- Multi-unit support
- Import/export CSV
- Transfer between branches

### Database Schema Needed:
```sql
-- Already exists: restaurant_inventory table
-- Need: inventory_movement_log

CREATE TABLE inventory_movement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurant(id),
  branch_id UUID REFERENCES branch(id),
  product_id UUID REFERENCES product(id),
  type TEXT NOT NULL, -- 'ADD', 'SUBTRACT', 'RECEIVED', 'WASTAGE', 'TRANSFER'
  quantity NUMERIC(14,3) NOT NULL,
  balance_before NUMERIC(14,3),
  balance_after NUMERIC(14,3),
  reason TEXT,
  reference_id UUID, -- order_id, adjustment_id, etc.
  reference_type TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE inventory_adjustment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurant(id),
  branch_id UUID REFERENCES branch(id),
  product_id UUID REFERENCES product(id),
  adjustment_type TEXT, -- 'WASTAGE', 'SPOILAGE', 'COUNT_CORRECTION', 'OTHER'
  quantity NUMERIC(14,3) NOT NULL,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add low_stock_threshold to restaurant_inventory
ALTER TABLE restaurant_inventory ADD COLUMN low_stock_threshold NUMERIC(14,3);
```

### UI Components:
- Inventory page
- Add/receive inventory
- Adjust inventory form
- Low-stock alerts
- Inventory history

---

## 8️⃣ **NOTIFICATIONS**

### Notification Types
- Order updates
- New messages from suppliers
- Invoice due reminders
- Low-stock alerts
- Quality control issues

### Database Schema Needed:
```sql
CREATE TABLE notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  type TEXT NOT NULL, -- 'ORDER', 'MESSAGE', 'INVOICE', 'STOCK', 'SYSTEM'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_id UUID, -- order_id, invoice_id, etc.
  reference_type TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notification_user_read ON notification(user_id, is_read);
```

### UI Components:
- Notification center
- Unread count badge
- In-app notifications
- Email/SMS integration (future)

---

## 9️⃣ **TEAM & ROLES**

### Role Management
- Assign roles to team members
- Permission-based access
- Multi-user support

### Database Schema Needed:
```sql
CREATE TABLE user_role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  restaurant_id UUID REFERENCES restaurant(id),
  role TEXT NOT NULL, -- 'owner', 'manager', 'purchasing', 'finance', 'viewer'
  permissions JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, restaurant_id)
);
```

### UI Components:
- Team management page
- Role assignment
- Invite members
- Remove members

---

## 🗺️ IMPLEMENTATION ROADMAP

### **Phase 1: Foundation (Priority 1)**
1. ✅ Authentication & Authorization
2. ✅ Basic Product Browsing
3. ✅ Shopping Cart & Orders
4. ✅ Chat System

### **Phase 2: Core Features (Priority 2)**
1. **Quick Lists / Recurring Orders**
   - Create lists
   - Add products
   - One-click ordering
   - Reorder from history

2. **Supplier Discovery & Following**
   - Supplier catalog
   - Follow/Pin suppliers
   - Block suppliers
   - Supplier profiles

3. **Enhanced Inventory Management**
   - Manual inventory adjustments
   - Low-stock alerts
   - Inventory history
   - Multi-branch support

### **Phase 3: Receiving & Quality (Priority 3)**
1. **Receiving Screen**
   - Match orders with deliveries
   - Record received quantities
   - Report discrepancies
   - Photo upload

2. **Quality Control**
   - Document damages
   - Supplier communication
   - Receiving reports

### **Phase 4: Finance & Analytics (Priority 4)**
1. **Invoice Management**
   - View supplier invoices
   - Payment tracking
   - Download PDFs

2. **Analytics Dashboard**
   - Spend tracking
   - Supplier analytics
   - Category analysis
   - Trends

### **Phase 5: Advanced Features (Priority 5)**
1. **Notifications**
   - Real-time alerts
   - Notification center
   - Email/SMS integration

2. **Multi-Branch Management**
   - Branch creation
   - Consolidated reporting
   - Transfer inventory

3. **Team & Roles**
   - User management
   - Permission system
   - Role assignment

---

## 🎨 UI/UX PRIORITIES

### **Most Critical Pages:**
1. **Quick Lists** - For recurring orders
2. **Receiving** - For delivery validation
3. **Inventory** - For stock management
4. **Suppliers** - For discovery and following
5. **Analytics** - For insights

---

## 📊 DATABASE MIGRATIONS NEEDED

### Priority 1 (Must Have):
- `0010_restaurant_onboarding.sql` - Business profile extensions
- `0011_quick_lists.sql` - Quick lists tables
- `0012_receiving_quality.sql` - Receiving logs
- `0013_supplier_relationships.sql` - Follow/Block tables

### Priority 2 (Should Have):
- `0014_inventory_enhancements.sql` - Movement logs, adjustments
- `0015_notifications.sql` - Notification system
- `0016_branches.sql` - Multi-branch support
- `0017_team_roles.sql` - Team management

### Priority 3 (Nice to Have):
- `0018_analytics_indexes.sql` - Performance optimization
- `0019_payment_tracking.sql` - Restaurant payment tracking

---

## 🚀 NEXT STEPS

### Immediate Actions:
1. Create Quick Lists feature (highest priority for restaurants)
2. Implement Receiving screen
3. Enhance Inventory Management
4. Add Supplier Following/Blocking
5. Build Analytics Dashboard

### API Endpoints to Create:
- `GET /api/restaurants/quick-lists`
- `POST /api/restaurants/quick-lists`
- `POST /api/restaurants/receiving`
- `GET /api/suppliers/followers`
- `POST /api/suppliers/follow`
- `POST /api/suppliers/block`
- `GET /api/analytics/spend`
- `PATCH /api/inventory/:id/adjust`

---

## 📝 NOTES

- **Focus on user value**: Quick lists and receiving are the most requested features
- **Iterative development**: Start with core features, add advanced later
- **API-first approach**: Backend first, then UI
- **Reuse existing components**: Chat, orders, products already work
- **Mobile-responsive**: All new UI should work on mobile

---

**Last Updated**: Current Date
**Version**: 1.0.0
