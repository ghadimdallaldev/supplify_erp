-- AI platform feature flag, request audit log, and plan limits for LLM reorder assistant.

INSERT INTO feature_flag (feature_key, feature_name, description, global_override)
VALUES (
  'ai_platform',
  'AI platform',
  'LLM-assisted reorder explanations and natural-language ask (requires API AI_ENABLED + provider key)',
  NULL
)
ON CONFLICT (feature_key) DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS reorder_ai_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL CHECK (endpoint IN ('explain', 'ask')),
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  latency_ms INT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reorder_ai_request_log_restaurant_created
  ON reorder_ai_request_log (restaurant_id, created_at DESC);

-- Gold / Platinum restaurant plans: enable ai_platform + daily AI request caps
UPDATE subscription_plan
SET features = features || '{"ai_platform": true}'::jsonb,
    limits = limits || '{"ai_requests_per_day": 20}'::jsonb,
    updated_at = now()
WHERE tenant_type = 'RESTAURANT'
  AND code = 'gold'
  AND is_active = true;

UPDATE subscription_plan
SET features = features || '{"ai_platform": true}'::jsonb,
    limits = limits || '{"ai_requests_per_day": 100}'::jsonb,
    updated_at = now()
WHERE tenant_type = 'RESTAURANT'
  AND code = 'platinum'
  AND is_active = true;

UPDATE subscription_plan
SET limits = limits || '{"ai_requests_per_day": 0}'::jsonb,
    updated_at = now()
WHERE tenant_type = 'RESTAURANT'
  AND code IN ('free', 'silver')
  AND is_active = true
  AND NOT (limits ? 'ai_requests_per_day');
