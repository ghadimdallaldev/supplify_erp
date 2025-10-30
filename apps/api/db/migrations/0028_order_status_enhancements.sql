-- Enhance order_status enum with delivery/receiving lifecycle
DO $$
BEGIN
  -- Add values if not present (Postgres doesn't support IF NOT EXISTS, so guard via catalog)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'DELIVERED'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'DELIVERED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'RECEIVED_PARTIAL'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'RECEIVED_PARTIAL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'RECEIVED_FULL'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'RECEIVED_FULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'INVOICED'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'INVOICED';
  END IF;
END $$;


