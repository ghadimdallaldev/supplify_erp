-- Migration: 0104_user_workspace_membership.sql
-- One active supplier OR restaurant workspace per user (security-critical).

CREATE TABLE IF NOT EXISTS user_workspace_membership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  workspace_type TEXT NOT NULL CHECK (workspace_type IN ('RESTAURANT', 'SUPPLIER')),
  organization_id UUID,
  home_tenant_id UUID NOT NULL,
  is_main_admin BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_workspace_membership_org
  ON user_workspace_membership (workspace_type, organization_id)
  WHERE status = 'active' AND organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_workspace_membership_home_tenant
  ON user_workspace_membership (workspace_type, home_tenant_id)
  WHERE status = 'active';

COMMENT ON TABLE user_workspace_membership IS
  'At most one active restaurant or supplier workspace per user. organization_id is the account boundary when set.';

-- Creators (contact_email on main branch)
INSERT INTO user_workspace_membership (user_id, workspace_type, organization_id, home_tenant_id, is_main_admin)
SELECT u.id, 'RESTAURANT', r.organization_id, r.id, true
FROM app_user u
JOIN restaurant r ON LOWER(TRIM(r.contact_email)) = LOWER(TRIM(u.email))
WHERE u.role = 'RESTAURANT'
  AND NOT EXISTS (SELECT 1 FROM user_workspace_membership m WHERE m.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_workspace_membership (user_id, workspace_type, organization_id, home_tenant_id, is_main_admin)
SELECT u.id, 'SUPPLIER', s.organization_id, s.id, true
FROM app_user u
JOIN supplier s ON LOWER(TRIM(s.contact_email)) = LOWER(TRIM(u.email))
WHERE u.role = 'SUPPLIER'
  AND NOT EXISTS (SELECT 1 FROM user_workspace_membership m WHERE m.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- Staff with tenant roles but no membership row yet (first assignment wins)
INSERT INTO user_workspace_membership (user_id, workspace_type, organization_id, home_tenant_id, is_main_admin)
SELECT DISTINCT ON (tur.user_id)
  tur.user_id,
  tur.tenant_type,
  COALESCE(r.organization_id, s.organization_id),
  tur.tenant_id,
  EXISTS (
    SELECT 1 FROM tenant_user_roles tur2
    JOIN tenant_roles tr ON tr.id = tur2.role_id AND tr.name = 'Owner'
    WHERE tur2.user_id = tur.user_id AND tur2.tenant_id = tur.tenant_id AND tur2.tenant_type = tur.tenant_type
  )
FROM tenant_user_roles tur
LEFT JOIN restaurant r ON r.id = tur.tenant_id AND tur.tenant_type = 'RESTAURANT'
LEFT JOIN supplier s ON s.id = tur.tenant_id AND tur.tenant_type = 'SUPPLIER'
WHERE NOT EXISTS (SELECT 1 FROM user_workspace_membership m WHERE m.user_id = tur.user_id)
ORDER BY tur.user_id, tur.assigned_at ASC NULLS LAST
ON CONFLICT (user_id) DO NOTHING;
