-- Adds reminder tracking columns to customer_order if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_order' AND column_name = 'reminder_count'
  ) THEN
    ALTER TABLE customer_order ADD COLUMN reminder_count integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_order' AND column_name = 'last_reminder_sent_at'
  ) THEN
    ALTER TABLE customer_order ADD COLUMN last_reminder_sent_at timestamptz;
  END IF;
END $$;


