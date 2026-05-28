-- Migration: 0122_tenant_subscription_addons.sql
-- Paid add-ons for extra branches/warehouses (admin-granted until billing integration).

CREATE TABLE IF NOT EXISTS tenant_subscription_addon (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER')),
  addon_key TEXT NOT NULL CHECK (
    addon_key IN (
      'restaurant_extra_branch',
      'supplier_extra_branch',
      'supplier_extra_warehouse'
    )
  ),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_monthly NUMERIC(14, 2),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_subscription_addon_active_key
  ON tenant_subscription_addon (tenant_id, tenant_type, addon_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_tenant_subscription_addon_tenant
  ON tenant_subscription_addon (tenant_id, tenant_type);

COMMENT ON TABLE tenant_subscription_addon IS
  'Manual or future-billed add-ons that increase branch/warehouse effective limits for the billing tenant (org main branch).';

DROP TRIGGER IF EXISTS update_tenant_subscription_addon_updated_at ON tenant_subscription_addon;
CREATE TRIGGER update_tenant_subscription_addon_updated_at
  BEFORE UPDATE ON tenant_subscription_addon
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
