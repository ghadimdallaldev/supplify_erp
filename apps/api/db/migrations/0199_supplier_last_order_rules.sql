-- Supplier last-order / delivery rollover rules for restaurant B2B ordering

ALTER TABLE supplier
  ADD COLUMN IF NOT EXISTS last_order_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (last_order_mode IN ('none', 'cutoff')),
  ADD COLUMN IF NOT EXISTS last_order_cutoff_type TEXT
    CHECK (
      last_order_cutoff_type IS NULL
      OR last_order_cutoff_type IN ('absolute_time', 'minutes_before_window')
    ),
  ADD COLUMN IF NOT EXISTS last_order_cutoff_time TEXT,
  ADD COLUMN IF NOT EXISTS last_order_cutoff_minutes INTEGER
    CHECK (last_order_cutoff_minutes IS NULL OR last_order_cutoff_minutes BETWEEN 1 AND 1440),
  ADD COLUMN IF NOT EXISTS last_order_rollover_days INTEGER NOT NULL DEFAULT 1
    CHECK (last_order_rollover_days BETWEEN 1 AND 14),
  ADD COLUMN IF NOT EXISTS last_order_timezone TEXT NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN supplier.last_order_mode IS
  'none = restaurants may order anytime for next delivery day; cutoff = late orders roll delivery forward';
COMMENT ON COLUMN supplier.last_order_rollover_days IS
  'When past cutoff, requested delivery shifts forward by this many calendar days (1=tomorrow, 2=day after, etc.)';

ALTER TABLE customer_order
  ADD COLUMN IF NOT EXISTS requested_delivery_date DATE;

COMMENT ON COLUMN customer_order.requested_delivery_date IS
  'Restaurant-requested delivery day after supplier last-order rules are applied';
