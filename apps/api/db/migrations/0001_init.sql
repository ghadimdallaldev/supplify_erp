-- Migration: 0001_init.sql
-- Description: Initial database schema for Supplify v2

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schema_migrations table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create app_user table
CREATE TABLE app_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keycloak_sub TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','SUPPLIER','RESTAURANT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create supplier table
CREATE TABLE supplier (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  vat_no TEXT,
  contact_email TEXT,
  phone TEXT,
  address_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create restaurant table
CREATE TABLE restaurant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  trade_license_no TEXT,
  contact_email TEXT,
  phone TEXT,
  address_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create catalog table
CREATE TABLE catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create product table
CREATE TABLE product (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  description_ar TEXT,
  brand TEXT,
  category TEXT,
  image_url TEXT,
  unit TEXT, -- kg, pack, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, sku)
);

-- Create indexes for product table
CREATE INDEX idx_product_supplier ON product(supplier_id);
CREATE INDEX idx_product_text ON product (LOWER(name));

-- Create price table
CREATE TABLE price (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  amount NUMERIC(12,3) NOT NULL CHECK (amount >= 0),
  min_qty NUMERIC(12,3) NOT NULL DEFAULT 1,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ
);

-- Create index for price table
CREATE INDEX idx_price_product_valid ON price(product_id, valid_from, COALESCE(valid_to, 'infinity'));

-- Create inventory table
CREATE TABLE inventory (
  product_id UUID PRIMARY KEY REFERENCES product(id) ON DELETE CASCADE,
  available_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create order_status enum
CREATE TYPE order_status AS ENUM ('DRAFT','PLACED','CONFIRMED','FULFILLING','COMPLETED','CANCELLED');

-- Create customer_order table
CREATE TABLE customer_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  status order_status NOT NULL DEFAULT 'DRAFT',
  total_amount NUMERIC(14,3) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  placed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create order_item table
CREATE TABLE order_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id),
  supplier_id UUID NOT NULL REFERENCES supplier(id),
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,3) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14,3) NOT NULL CHECK (line_total >= 0),
  notes TEXT
);

-- Create index for order_item table
CREATE INDEX idx_order_item_supplier ON order_item(supplier_id);

-- Create address table
CREATE TABLE address (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('SUPPLIER','RESTAURANT')),
  owner_id UUID NOT NULL,
  label TEXT,
  street TEXT, 
  city TEXT, 
  region TEXT, 
  country TEXT,
  coords JSONB
);

-- Create attachment table
CREATE TABLE attachment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL,
  owner_id UUID NOT NULL,
  url TEXT NOT NULL,
  type TEXT,
  meta JSONB
);

-- Create audit_log table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_sub TEXT,
  actor_role TEXT,
  ip TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  payload JSONB,
  status INTEGER NOT NULL,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for audit_log table
CREATE INDEX idx_audit_log_actor ON audit_log(actor_sub);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_resource ON audit_log(resource, resource_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
