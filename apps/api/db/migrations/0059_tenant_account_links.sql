-- Linked branch accounts: each branch is a separate restaurant/supplier tenant owned by the same user.

CREATE TABLE IF NOT EXISTS tenant_account_link (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_tenant_id UUID NOT NULL,
  parent_tenant_type TEXT NOT NULL CHECK (parent_tenant_type IN ('RESTAURANT', 'SUPPLIER')),
  child_tenant_id UUID NOT NULL,
  child_tenant_type TEXT NOT NULL CHECK (child_tenant_type IN ('RESTAURANT', 'SUPPLIER')),
  branch_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (child_tenant_id, child_tenant_type)
);

CREATE INDEX IF NOT EXISTS idx_tenant_account_link_parent
  ON tenant_account_link (parent_tenant_id, parent_tenant_type);

COMMENT ON TABLE tenant_account_link IS 'Maps a paid-plan parent account to separately scoped child branch accounts';
