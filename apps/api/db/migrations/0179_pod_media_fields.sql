-- POD: signature file key + restaurant confirmation columns

ALTER TABLE proof_of_delivery
  ADD COLUMN IF NOT EXISTS signature_file_key VARCHAR(500),
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN proof_of_delivery.signature_file_key IS 'Object storage key for signature image';
COMMENT ON COLUMN proof_of_delivery.file_key IS 'Object storage key for delivery photo';
