-- Migration: 0019_restaurant_pricing.sql
-- Description: Add restaurant-specific contract pricing tables


-- Create restaurant_pricing table for restaurant-specific contract pricing
CREATE TABLE IF NOT EXISTS restaurant_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES supplier(id) ON DELETE CASCADE NOT NULL,
  restaurant_id UUID REFERENCES restaurant(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES product(id) ON DELETE CASCADE NOT NULL,
  
  -- Pricing details
  price NUMERIC(14,3) NOT NULL,
  currency TEXT DEFAULT 'USD',
  
  -- Contract details
  contract_discount_percentage NUMERIC(5,2),
  contract_start_date DATE,
  contract_end_date DATE,
  
  -- Contract type/agreement
  agreement_type TEXT DEFAULT 'CUSTOM' CHECK (agreement_type IN ('VOLUME', 'RELATIONSHIP', 'CUSTOM', 'SPECIAL')),
  min_order_quantity NUMERIC(14,3), -- Minimum order quantity for this price
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(supplier_id, restaurant_id, product_id)
);

COMMENT ON TABLE restaurant_pricing IS 'Restaurant-specific contract pricing from suppliers';
COMMENT ON COLUMN restaurant_pricing.agreement_type IS 'Type of agreement: VOLUME (based on order size), RELATIONSHIP (loyal customer), CUSTOM (negotiated), SPECIAL (promotional)';
COMMENT ON COLUMN restaurant_pricing.is_active IS 'Whether this contract pricing is currently active';
COMMENT ON COLUMN restaurant_pricing.contract_discount_percentage IS 'Discount percentage from standard price';
COMMENT ON COLUMN restaurant_pricing.min_order_quantity IS 'Minimum order quantity required for this pricing to apply';

-- Create indexes for performance
CREATE INDEX idx_restaurant_pricing_supplier ON restaurant_pricing(supplier_id);
CREATE INDEX idx_restaurant_pricing_restaurant ON restaurant_pricing(restaurant_id);
CREATE INDEX idx_restaurant_pricing_product ON restaurant_pricing(product_id);
CREATE INDEX idx_restaurant_pricing_active ON restaurant_pricing(is_active, supplier_id, product_id);

-- Add foreign key constraint to pricing table (if needed)
-- Note: This allows linking standard prices with restaurant-specific prices

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON restaurant_pricing TO api_user;

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

