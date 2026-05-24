-- Free tier: 1 open chat per tenant, 3 messages/day (not 10).
-- open_conversations = active conversation slots; chats_per_day = messages sent today.

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"open_conversations": 1, "chats_per_day": 3}'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type IN ('RESTAURANT', 'SUPPLIER');

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"promotions": 1}'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'SUPPLIER'
  AND COALESCE((limits->>'promotions')::int, 0) = 0;
