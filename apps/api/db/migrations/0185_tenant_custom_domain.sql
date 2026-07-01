-- Platinum white-label: verified custom hostname for public supplier catalog.

CREATE TABLE IF NOT EXISTS tenant_custom_domain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  hostname TEXT NOT NULL,
  verification_token TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  ssl_status TEXT NOT NULL DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'active', 'failed')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tenant_type),
  UNIQUE (hostname)
);

CREATE INDEX IF NOT EXISTS idx_tenant_custom_domain_hostname
  ON tenant_custom_domain (lower(hostname))
  WHERE verified_at IS NOT NULL AND enabled = true;

COMMENT ON TABLE tenant_custom_domain IS
  'Verified custom hostname for tenant public surfaces (Platinum white_label_domain).';
