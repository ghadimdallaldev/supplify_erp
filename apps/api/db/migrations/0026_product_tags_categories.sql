-- Migration: 0026_product_tags_categories.sql
-- Description: Add product tags, enhance categories, and price range filtering support

-- Add tags column to product table (JSONB array for flexibility)
ALTER TABLE product 
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Create index for tag searches (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_product_tags ON product USING GIN (tags);

-- Create categories table for better category management
CREATE TABLE IF NOT EXISTS product_category (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_category_id UUID REFERENCES product_category(id) ON DELETE SET NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for category lookups
CREATE INDEX IF NOT EXISTS idx_category_slug ON product_category(slug);
CREATE INDEX IF NOT EXISTS idx_category_active ON product_category(is_active) WHERE is_active = true;

-- Insert common categories
INSERT INTO product_category (name, slug, description, display_order) VALUES
  ('Vegetables', 'vegetables', 'Fresh and processed vegetables', 1),
  ('Meat & Poultry', 'meat-poultry', 'Fresh and frozen meat and poultry', 2),
  ('Seafood', 'seafood', 'Fresh and frozen seafood', 3),
  ('Grains & Legumes', 'grains-legumes', 'Rice, beans, lentils, and other grains', 4),
  ('Oils & Fats', 'oils-fats', 'Cooking oils, butter, and other fats', 5),
  ('Dairy', 'dairy', 'Milk, cheese, yogurt, and other dairy products', 6),
  ('Beverages', 'beverages', 'Drinks and beverages', 7),
  ('Spices & Seasonings', 'spices-seasonings', 'Spices, herbs, and seasonings', 8),
  ('Canned & Preserved', 'canned-preserved', 'Canned goods and preserved foods', 9),
  ('Bakery & Bread', 'bakery-bread', 'Bread, pastries, and baked goods', 10),
  ('Frozen Foods', 'frozen-foods', 'Frozen food products', 11),
  ('Snacks & Nuts', 'snacks-nuts', 'Snacks, nuts, and dried fruits', 12),
  ('Condiments & Sauces', 'condiments-sauces', 'Sauces, condiments, and dressings', 13),
  ('Cleaning Supplies', 'cleaning-supplies', 'Cleaning and sanitation products', 14),
  ('Paper & Disposables', 'paper-disposables', 'Paper products and disposables', 15),
  ('Other', 'other', 'Other products', 99)
ON CONFLICT (name) DO NOTHING;

-- Update product table to reference category if it exists
-- Keep the category TEXT field for backward compatibility, but also allow category_id
ALTER TABLE product 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES product_category(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_category_id ON product(category_id);

-- Add comment for documentation
COMMENT ON COLUMN product.tags IS 'Array of product tags for filtering and search (JSONB array of strings)';
COMMENT ON COLUMN product.category_id IS 'Reference to product_category table for standardized categories';
COMMENT ON TABLE product_category IS 'Standardized product categories for better organization and filtering';

