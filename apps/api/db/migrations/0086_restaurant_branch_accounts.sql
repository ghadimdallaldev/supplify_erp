-- Restaurant organizations: org-level roles and branch (restaurant) sub-tenants.

CREATE TABLE IF NOT EXISTS restaurant_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE restaurant
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES restaurant_organizations(id),
  ADD COLUMN IF NOT EXISTS is_main_branch BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS branch_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_branch_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS restaurant_org_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES restaurant_organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS restaurant_org_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES restaurant_org_roles(id) ON DELETE CASCADE,
  permission VARCHAR(100) NOT NULL,
  branch_scope VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (branch_scope IN ('all', 'assigned')),
  UNIQUE (role_id, permission)
);

CREATE TABLE IF NOT EXISTS restaurant_org_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES restaurant_organizations(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES restaurant_org_roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES app_user(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS restaurant_org_user_branch_access (
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES restaurant_organizations(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES app_user(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_organization_id ON restaurant(organization_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_org_user_roles_org_user ON restaurant_org_user_roles(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_org_user_branch_access_user_org ON restaurant_org_user_branch_access(user_id, organization_id);

COMMENT ON TABLE restaurant_organizations IS 'Parent org owning one or more restaurant branch tenants';
COMMENT ON COLUMN restaurant.is_main_branch IS 'Primary branch; cannot be deactivated or deleted';
COMMENT ON COLUMN restaurant.is_branch_active IS 'When false, branch is deactivated at org level';
