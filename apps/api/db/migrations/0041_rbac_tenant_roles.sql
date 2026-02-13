-- Migration: 0041_rbac_tenant_roles.sql
-- Tenant-scoped RBAC: roles, permissions, role_permissions, user_roles.
-- Foundation for mapping subscription features/limits later.

-- ========================================
-- ROLES
-- ========================================
CREATE TABLE IF NOT EXISTS role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tenant_type TEXT CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER', 'ADMIN')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_tenant_type ON role(tenant_type);
CREATE INDEX IF NOT EXISTS idx_role_code ON role(code);

-- ========================================
-- PERMISSIONS
-- ========================================
CREATE TABLE IF NOT EXISTS permission (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permission_domain ON permission(domain);
CREATE INDEX IF NOT EXISTS idx_permission_code ON permission(code);

-- ========================================
-- ROLE -> PERMISSIONS
-- ========================================
CREATE TABLE IF NOT EXISTS role_permission (
  role_id UUID NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permission(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permission_role ON role_permission(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permission_permission ON role_permission(permission_id);

-- ========================================
-- USER -> ROLES (tenant-scoped)
-- ========================================
CREATE TABLE IF NOT EXISTS user_role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  tenant_id UUID,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER', 'ADMIN')),
  branch_id UUID,
  warehouse_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id, tenant_id, tenant_type)
);

CREATE INDEX IF NOT EXISTS idx_user_role_user_tenant ON user_role(user_id, tenant_type, tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_role_role ON user_role(role_id);
CREATE INDEX IF NOT EXISTS idx_user_role_tenant ON user_role(tenant_id, tenant_type);

COMMENT ON TABLE role IS 'RBAC roles: tenant-scoped (RESTAURANT/SUPPLIER) or admin (ADMIN)';
COMMENT ON TABLE permission IS 'Permission keys for feature gating and subscription mapping';
COMMENT ON TABLE role_permission IS 'Which permissions each role has';
COMMENT ON TABLE user_role IS 'User assignments to roles within a tenant (tenant_id + tenant_type)';
