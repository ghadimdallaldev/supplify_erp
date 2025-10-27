-- Migration: 0008_add_reserved_qty.sql
-- Description: Add reserved_qty column to inventory table

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS reserved_qty NUMERIC(14,3) NOT NULL DEFAULT 0;

-- Update existing records to have 0 reserved quantity
UPDATE inventory SET reserved_qty = 0 WHERE reserved_qty IS NULL;

