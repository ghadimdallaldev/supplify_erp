-- Order lifecycle: received goods but restaurant has an open dispute with supplier.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'RECEIVED_WITH_DISPUTE'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'RECEIVED_WITH_DISPUTE';
  END IF;
END $$;
