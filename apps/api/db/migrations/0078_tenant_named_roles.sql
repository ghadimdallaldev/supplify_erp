-- Migration: 0078_tenant_named_roles.sql
-- Per-tenant named roles (system + custom) with permission assignments.

CREATE TABLE IF NOT EXISTS tenant_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER')),
  tenant_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, tenant_type, name)
);

CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  permission VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, permission)
);

CREATE TABLE IF NOT EXISTS tenant_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER')),
  tenant_id UUID NOT NULL,
  assigned_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tenant_id, tenant_type)
);

CREATE INDEX IF NOT EXISTS idx_tenant_roles_tenant ON tenant_roles(tenant_id, tenant_type);
CREATE INDEX IF NOT EXISTS idx_tenant_user_roles_tenant_user ON tenant_user_roles(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_user_roles_role ON tenant_user_roles(role_id);

COMMENT ON TABLE tenant_roles IS 'Named roles per restaurant or supplier tenant';
COMMENT ON TABLE tenant_role_permissions IS 'Permission keys assigned to each tenant role';
COMMENT ON TABLE tenant_user_roles IS 'User role assignment within a tenant (one role per user per tenant)';
