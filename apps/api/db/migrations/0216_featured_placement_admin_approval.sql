-- Paid featured placements require explicit platform-admin approval.

ALTER TABLE supplier_featured_placements
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_featured_placements_pending_review
  ON supplier_featured_placements (created_at DESC)
  WHERE status = 'pending' AND payment_status IN ('paid', 'waived');

COMMENT ON COLUMN supplier_featured_placements.approved_at IS
  'Placement becomes visible and its paid term starts only after platform-admin approval.';
