-- Free Trial (code: free): allow 1 deal redemption/day for evaluation (was 0 or missing → blocked at 0/0).

UPDATE subscription_plan
SET
  limits = COALESCE(limits, '{}'::jsonb) || '{"deal_redemptions_per_day": 1}'::jsonb,
  updated_at = now()
WHERE code = 'free'
  AND tenant_type = 'RESTAURANT'
  AND (
    limits->>'deal_redemptions_per_day' IS NULL
    OR (limits->>'deal_redemptions_per_day')::int <= 0
  );
