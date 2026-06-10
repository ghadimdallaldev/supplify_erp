-- Support / admin chat schema fixes

ALTER TABLE conversation ALTER COLUMN supplier_id DROP NOT NULL;
ALTER TABLE conversation ALTER COLUMN restaurant_id DROP NOT NULL;

ALTER TABLE conversation
  ADD COLUMN IF NOT EXISTS support_tenant_id UUID,
  ADD COLUMN IF NOT EXISTS support_tenant_type TEXT CHECK (support_tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  ADD COLUMN IF NOT EXISTS support_context JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE conversation DROP CONSTRAINT IF EXISTS conversation_supplier_id_restaurant_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_b2b_pair
  ON conversation (supplier_id, restaurant_id)
  WHERE supplier_id IS NOT NULL
    AND restaurant_id IS NOT NULL
    AND COALESCE(is_admin_conversation, false) = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_support_tenant
  ON conversation (support_tenant_id, support_tenant_type)
  WHERE is_admin_conversation = true AND support_tenant_id IS NOT NULL;

ALTER TABLE conversation_participant
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE conversation_participant DROP CONSTRAINT IF EXISTS conversation_participant_participant_type_check;
ALTER TABLE conversation_participant ADD CONSTRAINT conversation_participant_participant_type_check
  CHECK (participant_type IN ('SUPPLIER', 'RESTAURANT', 'ADMIN'));

ALTER TABLE message DROP CONSTRAINT IF EXISTS message_sender_type_check;
ALTER TABLE message ADD CONSTRAINT message_sender_type_check
  CHECK (sender_type IN ('SUPPLIER', 'RESTAURANT', 'ADMIN'));

CREATE INDEX IF NOT EXISTS idx_conversation_admin
  ON conversation (is_admin_conversation, last_message_at DESC NULLS LAST)
  WHERE is_admin_conversation = true;
