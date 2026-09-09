-- Conversational Supplify Assistant (read-only AI chatbot) storage.
-- Separate from human B2B chat and from reorder LLM ask/explain.

UPDATE feature_flag
SET feature_name = 'AI platform (assistant + reorder LLM)',
    description = 'LLM-assisted Supplify Assistant chatbot plus reorder explain/ask/recommend (requires API AI_ENABLED + provider key)'
WHERE feature_key = 'ai_platform';

CREATE TABLE IF NOT EXISTS assistant_conversation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER', 'ADMIN')),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversation_user_updated
  ON assistant_conversation (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_conversation_tenant
  ON assistant_conversation (tenant_id, tenant_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS assistant_message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES assistant_conversation(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  tool_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_message_conversation_created
  ON assistant_message (conversation_id, created_at ASC);
