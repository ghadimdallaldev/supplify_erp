-- Migration: 0019_restaurant_pricing.sql
-- Description: Add restaurant-specific pricing tables for contract/tiered pricing

-- Create pricing_tier table for supplier's pricing tiers (Bronze, Silver, Gold, etc.)
CREATE TABLE IF NOT EXISTS pricing_tier (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES supplier(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  min_order_value NUMERIC(14,3),
  discount_percentage NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(supplier_id, name)
);

COMMENT ON TABLE pricing_tier IS 'Supplier-defined pricing tiers (e.g., Gold, Silver, Bronze)';
COMMENT ON COLUMN pricing_tier.min_order_value IS 'Minimum order value to qualify for this tier';
COMMENT ON COLUMN pricing_tier.discount_percentage IS 'Percentage discount for this tier';

-- Create restaurant_pricing table for restaurant-specific prices
CREATE TABLE IF NOT EXISTS restaurant_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES supplier(id) ON DELETE CASCADE NOT NULL,
  restaurant_id UUID REFERENCES restaurant(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES product(id) ON DELETE CASCADE NOT NULL,
  
  -- Pricing details
  price NUMERIC(14,3) NOT NULL,
  currency TEXT DEFAULT 'USD',
  
  -- Contract details
  pricing_tier_id UUID REFERENCES pricing_tier(id) ON DELETE SET NULL,
  contract_discount_percentage NUMERIC(5,2),
  contract_start_date DATE,
  contract_end_date DATE,
  
  -- Pricing type
  pricing_type TEXT DEFAULT 'CONTRACT' CHECK (pricing_type IN ('CONTRACT', 'VOLUME', 'RELATIONSHIP', 'CUSTOM')),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(supplier_id, restaurant_id, product_id)
);

COMMENT ON TABLE restaurant_pricing IS 'Restaurant-specific pricing for products from suppliers';
COMMENT ON COLUMN restaurant_pricing.pricing_type IS 'Type of pricing: CONTRACT, VOLUME, RELATIONSHIP, CUSTOM';
COMMENT ON COLUMN restaurant_pricing.is_active IS 'Whether this pricing is currently active';
COMMENT ON COLUMN restaurant_pricing.contract_discount_percentage IS 'Discount percentage from standard price';

-- Create indexes for performance
CREATE INDEX idx_restaurant_pricing_supplier ON restaurant_pricing(supplier_id);
CREATE INDEX idx_restaurant_pricing_restaurant ON restaurant_pricing(restaurant_id);
CREATE INDEX idx_restaurant_pricing_product ON restaurant_pricing(product_id);
CREATE INDEX idx_restaurant_pricing_active ON restaurant_pricing(is_active, supplier_id, product_id);
CREATE INDEX idx_pricing_tier_supplier ON pricing_tier(supplier_id);

-- Add foreign key constraint to pricing table (if needed)
-- Note: This allows linking standard prices with restaurant-specific prices

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON pricing_tier TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON restaurant_pricing TO api_user;

-- Create updated_at trigger for pricing_tier
CREATE OR REPLACE FUNCTION update_pricing_tier_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pricing_tier_updated_at
  BEFORE UPDATE ON pricing_tier
  FOR EACH ROW
  EXECUTE FUNCTION update_pricing_tier_updated_at();

-- Create updated_at trigger for restaurant_pricing
CREATE OR REPLACE FUNCTION update_restaurant_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_restaurant_pricing_updated_at
  BEFORE UPDATE ON restaurant_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_restaurant_pricing_updated_at();

