-- Migration: 0021_update_order_status_enum.sql
-- Description: Update order_status enum to ACKNOWLEDGED, PROCESSING, SHIPPED, COMPLETED

-- Step 1: Convert status column to TEXT temporarily
ALTER TABLE customer_order ALTER COLUMN status TYPE TEXT USING status::TEXT;

-- Step 2: Update existing values to new statuses
UPDATE customer_order SET status = 'COMPLETED' WHERE status = 'FULFILLING';
UPDATE customer_order SET status = 'ACKNOWLEDGED' WHERE status = 'CONFIRMED';
-- Keep PLACED as is, don't change to PROCESSING

-- Step 3: Drop old enum and create new one
DROP TYPE IF EXISTS order_status;

-- Step 4: Create new enum with correct values
CREATE TYPE order_status AS ENUM ('DRAFT', 'PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED');

-- Step 5: Update status column back to order_status type
ALTER TABLE customer_order ALTER COLUMN status TYPE order_status USING status::order_status;

-- Step 6: Add comments
COMMENT ON COLUMN customer_order.status IS 'Order status: DRAFT, PLACED, ACKNOWLEDGED, PROCESSING, SHIPPED, COMPLETED, CANCELLED';

