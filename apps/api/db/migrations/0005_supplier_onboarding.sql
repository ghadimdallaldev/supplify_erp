-- Migration: 0005_supplier_onboarding.sql
-- Description: Add supplier onboarding and profile fields

-- Extend supplier table with onboarding fields
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS vat_no TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS trade_license_no TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]'::jsonb;

-- Add contact information fields
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS sales_contact_email TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS sales_contact_phone TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS accounting_contact_email TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS accounting_contact_phone TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS logistics_contact_email TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS logistics_contact_phone TEXT;

-- Add business information fields
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS business_hours_json JSONB DEFAULT '{}'::jsonb;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS holiday_dates JSONB DEFAULT '[]'::jsonb;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS blackout_dates JSONB DEFAULT '[]'::jsonb;

-- Add policies and terms
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS return_policy TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS minimum_order_amount NUMERIC(12,2);
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;

-- Add subscription and status fields
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'BASIC';
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS subscription_limits JSONB DEFAULT '{}'::jsonb;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'ACTIVE';
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- Create warehouse table for supplier locations (0002 may have created a slimmer schema)
CREATE TABLE IF NOT EXISTS warehouse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address_json JSONB,
  delivery_coverage_zones JSONB DEFAULT '[]'::jsonb,
  is_main BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, code)
);

-- Extend warehouse when created by 0002_inventory_enhancements.sql
ALTER TABLE warehouse ADD COLUMN IF NOT EXISTS delivery_coverage_zones JSONB DEFAULT '[]'::jsonb;
ALTER TABLE warehouse ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT false;

-- Create indexes for warehouse
CREATE INDEX IF NOT EXISTS idx_warehouse_supplier ON warehouse(supplier_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_active ON warehouse(supplier_id) WHERE is_active = true;

-- Create delivery coverage zone table
CREATE TABLE IF NOT EXISTS delivery_zone (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouse(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  coverage_area_json JSONB NOT NULL,
  delivery_fee NUMERIC(12,2) DEFAULT 0,
  min_order_amount NUMERIC(12,2) DEFAULT 0,
  delivery_time_days INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for delivery zones
CREATE INDEX IF NOT EXISTS idx_delivery_zone_supplier ON delivery_zone(supplier_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zone_warehouse ON delivery_zone(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zone_active ON delivery_zone(supplier_id) WHERE is_active = true;

-- Add comments for documentation
COMMENT ON COLUMN supplier.subscription_tier IS 'Subscription tier: BASIC, PRO, ENTERPRISE';
COMMENT ON COLUMN supplier.account_status IS 'Account status: ACTIVE, SUSPENDED, INACTIVE, PENDING_VERIFICATION';
COMMENT ON COLUMN warehouse.delivery_coverage_zones IS 'Array of zone IDs where this warehouse delivers to';
COMMENT ON COLUMN delivery_zone.coverage_area_json IS 'GeoJSON or polygon coordinates for the delivery zone';
