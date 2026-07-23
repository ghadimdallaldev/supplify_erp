-- 0191: Branch Account link invitations + lifecycle / billing ownership metadata
-- Non-destructive, idempotent. Does not drop legacy branch table or merge org schemas.

-- ---------------------------------------------------------------------------
-- Deactivation metadata on Branch Account tenants
-- ---------------------------------------------------------------------------
ALTER TABLE restaurant
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

ALTER TABLE supplier
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

COMMENT ON COLUMN restaurant.deactivated_at IS 'When this Branch Account was soft-deactivated (NULL if active)';
COMMENT ON COLUMN supplier.deactivated_at IS 'When this Branch Account was soft-deactivated (NULL if active)';

-- ---------------------------------------------------------------------------
-- Billing ownership / review flags on subscription (per tenant)
-- ---------------------------------------------------------------------------
ALTER TABLE subscription
  ADD COLUMN IF NOT EXISTS billing_review_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_review_reason TEXT,
  ADD COLUMN IF NOT EXISTS linked_billing_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS org_billing_suspended_at TIMESTAMPTZ;

COMMENT ON COLUMN subscription.billing_review_required IS
  'True when prepaid time or billing state could not be auto-resolved on org link/unlink (no invented refunds)';
COMMENT ON COLUMN subscription.billing_review_reason IS
  'Human-readable reason for billing_review_required';
COMMENT ON COLUMN subscription.linked_billing_snapshot IS
  'Snapshot of subscription state taken when tenant was linked under org billing';
COMMENT ON COLUMN subscription.org_billing_suspended_at IS
  'When child auto-renewal was suspended because org billing took ownership';

CREATE INDEX IF NOT EXISTS idx_subscription_billing_review
  ON subscription (tenant_id, tenant_type)
  WHERE billing_review_required = true;

-- ---------------------------------------------------------------------------
-- Polymorphic Branch Account link invitations (existing standalone → org)
-- Separate from staff invites in branch_invitations / restaurant_invitations.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_account_link_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_type VARCHAR(20) NOT NULL
    CHECK (org_type IN ('RESTAURANT', 'SUPPLIER')),
  organization_id UUID NOT NULL,
  target_tenant_type VARCHAR(20)
    CHECK (target_tenant_type IS NULL OR target_tenant_type IN ('RESTAURANT', 'SUPPLIER')),
  target_tenant_id UUID,
  target_owner_email VARCHAR(255),
  inviter_user_id UUID NOT NULL REFERENCES app_user(id),
  intended_org_role VARCHAR(64) NOT NULL DEFAULT 'Branch Manager',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  billing_impact_snapshot JSONB,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES app_user(id),
  rejected_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT branch_account_link_invitations_target_chk CHECK (
    target_tenant_id IS NOT NULL OR target_owner_email IS NOT NULL
  ),
  CONSTRAINT branch_account_link_invitations_type_match_chk CHECK (
    target_tenant_type IS NULL OR target_tenant_type = org_type
  )
);

CREATE INDEX IF NOT EXISTS idx_branch_acct_link_inv_token
  ON branch_account_link_invitations (token);

CREATE INDEX IF NOT EXISTS idx_branch_acct_link_inv_org
  ON branch_account_link_invitations (org_type, organization_id, status);

CREATE INDEX IF NOT EXISTS idx_branch_acct_link_inv_target
  ON branch_account_link_invitations (target_tenant_type, target_tenant_id)
  WHERE target_tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_branch_acct_link_inv_email
  ON branch_account_link_invitations (LOWER(TRIM(target_owner_email)))
  WHERE target_owner_email IS NOT NULL AND status = 'pending';

COMMENT ON TABLE branch_account_link_invitations IS
  'Invitations to link an existing standalone restaurant/supplier tenant as an org Branch Account';

-- ---------------------------------------------------------------------------
-- Link / unlink history for audit and billing review trails
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_account_link_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_type VARCHAR(20) NOT NULL CHECK (org_type IN ('RESTAURANT', 'SUPPLIER')),
  organization_id UUID NOT NULL,
  tenant_type VARCHAR(20) NOT NULL CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER')),
  tenant_id UUID NOT NULL,
  action VARCHAR(32) NOT NULL
    CHECK (action IN ('linked', 'unlinked', 'reactivated', 'deactivated', 'billing_review')),
  actor_user_id UUID REFERENCES app_user(id),
  invitation_id UUID REFERENCES branch_account_link_invitations(id) ON DELETE SET NULL,
  billing_snapshot JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branch_acct_link_hist_org
  ON branch_account_link_history (org_type, organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_acct_link_hist_tenant
  ON branch_account_link_history (tenant_type, tenant_id, created_at DESC);

COMMENT ON TABLE branch_account_link_history IS
  'Audit trail for Branch Account link/unlink/reactivate and billing-review events';

-- ---------------------------------------------------------------------------
-- Central purchasing drafts (per destination Branch Account; no org-owned orders)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS central_purchasing_draft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES restaurant_organizations(id) ON DELETE CASCADE,
  destination_restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'cancelled')),
  notes TEXT,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_central_purchasing_open_draft
  ON central_purchasing_draft (organization_id, destination_restaurant_id, created_by)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_central_purchasing_draft_org
  ON central_purchasing_draft (organization_id, created_by, status);

COMMENT ON TABLE central_purchasing_draft IS
  'Foundation drafts for central purchasing; one open draft per user per destination Branch Account';

-- ---------------------------------------------------------------------------
-- Verification queries (run manually after migrate):
-- SELECT COUNT(*) FROM information_schema.columns
--   WHERE table_name = 'subscription' AND column_name = 'billing_review_required';
-- SELECT COUNT(*) FROM information_schema.tables
--   WHERE table_name = 'branch_account_link_invitations';
-- SELECT COUNT(*) FROM information_schema.tables
--   WHERE table_name = 'central_purchasing_draft';
-- ---------------------------------------------------------------------------
