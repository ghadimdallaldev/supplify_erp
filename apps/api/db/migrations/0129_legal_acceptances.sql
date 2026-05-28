-- Legal agreement acceptances (registration, invites, checkout contexts)
CREATE TABLE IF NOT EXISTS legal_acceptance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  tenant_id UUID,
  tenant_type TEXT CHECK (tenant_type IS NULL OR tenant_type IN ('RESTAURANT', 'SUPPLIER')),
  context TEXT NOT NULL DEFAULT 'registration',
  document_slug TEXT NOT NULL,
  document_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptance_user ON legal_acceptance(user_id);
CREATE INDEX IF NOT EXISTS idx_legal_acceptance_user_context ON legal_acceptance(user_id, context);
CREATE INDEX IF NOT EXISTS idx_legal_acceptance_tenant ON legal_acceptance(tenant_id) WHERE tenant_id IS NOT NULL;
