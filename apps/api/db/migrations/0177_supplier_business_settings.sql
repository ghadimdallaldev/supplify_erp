-- Supplier business settings (operating hours & policies) — idempotent ensure columns

ALTER TABLE supplier ADD COLUMN IF NOT EXISTS business_hours_json JSONB DEFAULT '{}'::jsonb;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS return_policy TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS minimum_order_amount NUMERIC(12,2);
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;
