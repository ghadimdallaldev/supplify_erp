-- Restaurant team and branch manager invitations (link-based, no email delivery)

CREATE TABLE IF NOT EXISTS restaurant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES restaurant_organizations(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  invited_name VARCHAR(255),
  invited_email VARCHAR(255),
  invitation_type VARCHAR(20) NOT NULL DEFAULT 'member'
    CHECK (invitation_type IN ('member', 'branch_manager')),
  role_id UUID NOT NULL REFERENCES tenant_roles(id) ON DELETE RESTRICT,
  invited_by UUID NOT NULL REFERENCES app_user(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_invitations_token ON restaurant_invitations(token);
CREATE INDEX IF NOT EXISTS idx_restaurant_invitations_restaurant_status ON restaurant_invitations(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_restaurant_invitations_org_status ON restaurant_invitations(organization_id, status);

COMMENT ON TABLE restaurant_invitations IS 'Shareable invite links for restaurant staff onboarding (no email sent)';
