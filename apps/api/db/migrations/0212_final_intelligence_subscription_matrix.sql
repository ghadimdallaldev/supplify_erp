-- Migration: 0212_final_intelligence_subscription_matrix.sql
-- Final launch entitlement matrix. Prices and billing mechanics intentionally remain unchanged.
-- Restaurant Platinum was a hidden Custom plan under migration 0190. Preserve every
-- subscription referencing it in an inactive Custom compatibility row before exposing
-- Platinum as the self-serve Restaurant Scale plan.

INSERT INTO subscription_plan (
  code, name, description, price_per_month, price_per_year, type, tenant_type,
  limits, features, trial_days, is_active, display_order, requires_admin_assignment
)
SELECT
  'custom', 'Restaurant Custom',
  'Legacy custom restaurant plan retained for existing subscriptions.',
  price_per_month, price_per_year, type, tenant_type, limits, features, trial_days,
  false, 90, true
FROM subscription_plan
WHERE code = 'platinum' AND tenant_type = 'RESTAURANT'
ON CONFLICT (code, tenant_type) DO NOTHING;

WITH remap AS (
  SELECT s.id AS subscription_id, s.plan_id AS from_plan_id, custom_plan.id AS to_plan_id
  FROM subscription s
  JOIN subscription_plan old_plan ON old_plan.id = s.plan_id
  JOIN subscription_plan custom_plan
    ON custom_plan.code = 'custom' AND custom_plan.tenant_type = 'RESTAURANT'
  WHERE s.tenant_type = 'RESTAURANT' AND old_plan.code = 'platinum'
)
INSERT INTO subscription_change_log (subscription_id, from_plan_id, to_plan_id, reason)
SELECT subscription_id, from_plan_id, to_plan_id,
  'final_intelligence_matrix: preserve_restaurant_custom'
FROM remap r
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_change_log l
  WHERE l.subscription_id = r.subscription_id
    AND l.from_plan_id = r.from_plan_id
    AND l.to_plan_id = r.to_plan_id
    AND l.reason = 'final_intelligence_matrix: preserve_restaurant_custom'
);

UPDATE subscription s
SET plan_id = custom_plan.id,
    plan_name = custom_plan.name,
    previous_plan_code = COALESCE(s.previous_plan_code, 'platinum'),
    updated_at = now()
FROM subscription_plan old_plan
JOIN subscription_plan custom_plan
  ON custom_plan.code = 'custom' AND custom_plan.tenant_type = 'RESTAURANT'
WHERE s.plan_id = old_plan.id
  AND s.tenant_type = 'RESTAURANT'
  AND old_plan.code = 'platinum';

UPDATE subscription s
SET pending_plan_id = custom_plan.id,
    updated_at = now()
FROM subscription_plan old_plan
JOIN subscription_plan custom_plan
  ON custom_plan.code = 'custom' AND custom_plan.tenant_type = 'RESTAURANT'
WHERE s.pending_plan_id = old_plan.id
  AND s.tenant_type = 'RESTAURANT'
  AND old_plan.code = 'platinum';

-- Restaurant Growth: deterministic operational signals; no conversational assistant.
UPDATE subscription_plan
SET name = 'Restaurant Growth',
    description = 'Core purchasing intelligence for one restaurant location.',
    is_active = true,
    requires_admin_assignment = false,
    display_order = 20,
    features = COALESCE(features, '{}'::jsonb) || '{"intelligence":"basic","ai_assistant":false,"ai_platform":false}'::jsonb,
    updated_at = now()
WHERE code = 'silver' AND tenant_type = 'RESTAURANT';

-- Restaurant Intelligence: advanced deterministic forecasting and operational warnings.
-- Multi-branch moves up to Scale, so the branch allowance drops to a single
-- location. Leaving `branches: 3` behind a disabled `multi_branch` gate would
-- advertise an allowance the feature gate refuses to honour.
UPDATE subscription_plan
SET name = 'Restaurant Intelligence',
    description = 'Advanced deterministic purchasing, cost, waste, and supplier intelligence.',
    is_active = true,
    requires_admin_assignment = false,
    display_order = 30,
    limits = COALESCE(limits, '{}'::jsonb) || '{"branches":1}'::jsonb,
    features = COALESCE(features, '{}'::jsonb)
      || '{"intelligence":"advanced","ai_assistant":false,"ai_platform":false,"smart_reorder":"ai_forecast_seasonality","multi_branch":false}'::jsonb,
    updated_at = now()
WHERE code = 'gold' AND tenant_type = 'RESTAURANT';

-- Restaurant Scale: multi-branch insight and the read-only, authorized assistant.
-- Platinum was an inactive Custom row since 0190, so it never had to carry the
-- canonical limit/feature key set that `verify-tier-matrix` enforces on active
-- plans. Replace both JSON documents in full rather than merging a few keys.
-- Limits are the legacy Platinum values from 0120 plus the canonical
-- `ai_requests_per_day` meter; price stays $349/$3,490 and is not touched here.
-- `multi_branch` is deliberately plain `true`: Scale grants cross-branch
-- visibility and insight, never cross-branch buying.
UPDATE subscription_plan
SET name = 'Restaurant Scale',
    description = 'Multi-branch insight, advanced analytics, and Supplify AI Assistant.',
    is_active = true,
    requires_admin_assignment = false,
    display_order = 40,
    limits = '{
      "branches": -1,
      "users": -1,
      "orders_per_day": -1,
      "suppliers_per_restaurant": -1,
      "restaurant_inventory_skus": -1,
      "chats_per_day": -1,
      "open_conversations": -1,
      "storage_mb": 30720,
      "quick_lists": -1,
      "quick_list_items": -1,
      "scheduled_quick_lists": -1,
      "scheduled_order_grace_per_day": 0,
      "deal_redemptions_per_day": -1,
      "ai_requests_per_day": 300
    }'::jsonb,
    features = '{
      "chat": "real_time_media_read_receipts",
      "order_calendar": true,
      "reports": "advanced_forecasting_custom_reports",
      "smart_reorder": "ai_forecast_seasonality",
      "multi_branch": true,
      "receiving_quality": "supplier_performance_reports",
      "disputes_returns": true,
      "finance_invoices": "advanced_finance_dashboard",
      "quick_lists": "ai_smart_automation",
      "inventory_management": "lot_expiry_tracking",
      "recipe_costing": true,
      "waste_tracking": "cost_percentage_vs_sales",
      "advanced_roles": true,
      "notifications": "email_whatsapp_webhook",
      "api_integrations": "full_api_webhooks",
      "support_sla": "dedicated_same_day",
      "custom_branding": "white_label_domain",
      "feature_flags_access": "all_experimental",
      "supplier_reviews": true,
      "push_notifications": true,
      "order_amendments": true,
      "tenant_audit_log": true,
      "waitlist_auto_promo": true,
      "supplier_deals": true,
      "supplier_deals_redeem": true,
      "fulfillment_tools": false,
      "intelligence": "scale",
      "ai_assistant": true,
      "ai_platform": true
    }'::jsonb,
    updated_at = now()
WHERE code = 'platinum' AND tenant_type = 'RESTAURANT';

-- Supplier Growth keeps basic deterministic customer and inventory intelligence.
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb)
      || '{"intelligence":"basic","ai_assistant":false,"ai_platform":false}'::jsonb,
    updated_at = now()
WHERE code = 'gold' AND tenant_type = 'SUPPLIER';

-- Supplier Scale adds advanced deterministic intelligence and the authorized assistant.
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb)
      || '{"intelligence":"scale","ai_assistant":true,"ai_platform":true}'::jsonb,
    updated_at = now()
WHERE code = 'platinum' AND tenant_type = 'SUPPLIER';

-- Trials mirror their respective Growth plan and must never expose the Scale assistant.
UPDATE subscription_plan trial_plan
SET features = growth_plan.features || '{"ai_assistant":false,"ai_platform":false}'::jsonb,
    updated_at = now()
FROM subscription_plan growth_plan
WHERE trial_plan.code = 'free'
  AND trial_plan.tenant_type = growth_plan.tenant_type
  AND growth_plan.code = CASE WHEN trial_plan.tenant_type = 'RESTAURANT' THEN 'silver' ELSE 'gold' END;
