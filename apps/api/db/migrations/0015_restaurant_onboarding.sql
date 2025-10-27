-- Migration: 0015_restaurant_onboarding.sql
-- Description: Add restaurant onboarding and account setup fields

-- Add business profile fields to restaurant table
ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS business_type TEXT; -- 'restaurant', 'café', 'hotel', 'catering'
ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS vat_number TEXT;
ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS operating_hours JSONB; -- {monday: {open: "08:00", close: "22:00"}, ...}
ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS delivery_instructions TEXT;
ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'FREE'; -- 'FREE', 'BRONZE', 'GOLD', 'PLATINUM'
ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS subscription_renewal_date TIMESTAMPTZ;
ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'ACTIVE'; -- 'ACTIVE', 'SUSPENDED', 'CANCELLED'

-- Branches table (already exists from 0001_init.sql, but adding if needed)
CREATE TABLE IF NOT EXISTS branch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  address_json JSONB,
  delivery_instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Restaurant team members
CREATE TABLE IF NOT EXISTS restaurant_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branch(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL, -- 'owner', 'manager', 'purchasing', 'finance', 'kitchen'
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supplier preferences (follow/favorite)
CREATE TABLE IF NOT EXISTS supplier_follow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, supplier_id)
);

-- Supplier blocklist
CREATE TABLE IF NOT EXISTS supplier_blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, supplier_id)
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT true,
  sms_notifications BOOLEAN DEFAULT false,
  push_notifications BOOLEAN DEFAULT true,
  notification_types JSONB, -- {"order_updates": true, "new_messages": true, "invoice_reminders": false}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_branch_restaurant ON branch(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_team_restaurant ON restaurant_team(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_follow_restaurant ON supplier_follow(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_blocklist_restaurant ON supplier_blocklist(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_restaurant ON notification_preferences(restaurant_id);

-- Comments
COMMENT ON COLUMN restaurant.business_type IS 'Type of business: restaurant, café, hotel, catering';
COMMENT ON COLUMN restaurant.subscription_tier IS 'Subscription plan: FREE, BRONZE, GOLD, PLATINUM';
COMMENT ON COLUMN restaurant.account_status IS 'Account status: ACTIVE, SUSPENDED, CANCELLED';

