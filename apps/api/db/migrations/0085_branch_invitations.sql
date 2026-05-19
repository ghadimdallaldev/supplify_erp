-- Branch manager invitations (link-based, no email delivery)

CREATE TABLE IF NOT EXISTS branch_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES supplier_organizations(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  invited_name VARCHAR(255),
  invited_email VARCHAR(255),
  role_id UUID NOT NULL REFERENCES tenant_roles(id) ON DELETE RESTRICT,
  invited_by UUID NOT NULL REFERENCES app_user(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branch_invitations_token ON branch_invitations(token);
CREATE INDEX IF NOT EXISTS idx_branch_invitations_supplier_status ON branch_invitations(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_branch_invitations_org ON branch_invitations(organization_id, status);

COMMENT ON TABLE branch_invitations IS 'Shareable invite links for branch staff onboarding (no email sent)';
