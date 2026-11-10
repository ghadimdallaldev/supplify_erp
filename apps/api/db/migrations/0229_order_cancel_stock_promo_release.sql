-- Legacy (non-warehouse) stock: marks that an order's placement reservation (inventory.reserved_qty)
-- was consumed when the order shipped. Makes the commit idempotent across failed-delivery re-ships
-- and lets a later cancel restore only available_qty instead of double-releasing reserved_qty.
ALTER TABLE customer_order
  ADD COLUMN IF NOT EXISTS legacy_stock_committed_at TIMESTAMPTZ;

COMMENT ON COLUMN customer_order.legacy_stock_committed_at IS
  'Set once inventory.reserved_qty was decremented for this order at dispatch (legacy suppliers only)';

-- Promotion redemptions are given back when the order is cancelled. The usage row is kept for
-- audit and marked released, which also makes the usage_count decrement idempotent.
ALTER TABLE promotion_usages
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

COMMENT ON COLUMN promotion_usages.released_at IS
  'Set when the order was cancelled and promotions.usage_count was decremented for this redemption';
