-- Migration: 0190_four_plan_pricing_model.sql
-- Four-plan commercial model. Preserve legacy plan codes; change public catalog names/limits.

ALTER TABLE subscription
  ADD COLUMN IF NOT EXISTS trial_target_plan_id UUID REFERENCES subscription_plan(id) ON DELETE SET NULL;

COMMENT ON COLUMN subscription.trial_target_plan_id IS
  'Selected paid plan mirrored by a time-limited trial; free plan rows remain internal compatibility rows.';

DO $$
DECLARE
  addon_constraint_name text;
BEGIN
  SELECT conname INTO addon_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'tenant_subscription_addon'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%addon_key%';

  IF addon_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE tenant_subscription_addon DROP CONSTRAINT %I', addon_constraint_name);
  END IF;

  ALTER TABLE tenant_subscription_addon
    ADD CONSTRAINT tenant_subscription_addon_addon_key_check
    CHECK (addon_key IN (
      'restaurant_extra_branch',
      'supplier_extra_branch',
      'supplier_extra_warehouse',
      'supplier_active_customer_locations_50'
    ));
END $$;

-- Restaurant Growth: preserve code silver for compatibility.
UPDATE subscription_plan
SET
  name = 'Restaurant Growth',
  description = 'Essential purchasing, receiving, inventory, costing, and AI tools for one restaurant location.',
  price_per_month = 49.00,
  price_per_year = 490.00,
  is_active = true,
  requires_admin_assignment = false,
  display_order = 20,
  limits = '{
    "branches": 1,
    "users": 5,
    "orders_per_day": -1,
    "suppliers_per_restaurant": -1,
    "restaurant_inventory_skus": -1,
    "chats_per_day": 500,
    "open_conversations": 30,
    "storage_mb": 2048,
    "quick_lists": -1,
    "quick_list_items": -1,
    "scheduled_quick_lists": -1,
    "deal_redemptions_per_day": -1,
    "scheduled_order_grace_per_day": 0,
    "ai_requests_per_day": 30
  }'::jsonb,
  features = '{
    "chat": "multi_supplier",
    "order_calendar": true,
    "quick_lists": "full_schedule",
    "receiving_quality": "photos_enabled",
    "disputes_returns": true,
    "finance_invoices": "record_payments",
    "inventory_management": "real_time",
    "recipe_costing": true,
    "waste_tracking": "analytics_dashboard",
    "supplier_deals": true,
    "supplier_deals_redeem": true,
    "supplier_reviews": true,
    "order_amendments": true,
    "notifications": "in_app_and_email",
    "push_notifications": true,
    "reports": "basic_kpis",
    "smart_reorder": "full_90day_trends",
    "ai_platform": true,
    "multi_branch": false,
    "custom_branding": false,
    "tenant_audit_log": false,
    "waitlist_auto_promo": false,
    "advanced_roles": false,
    "api_integrations": false,
    "feature_flags_access": false,
    "fulfillment_tools": false,
    "support_sla": "standard_72h"
  }'::jsonb,
  updated_at = now()
WHERE code = 'silver' AND tenant_type = 'RESTAURANT';

-- Restaurant Scale: preserve code gold for compatibility.
UPDATE subscription_plan
SET
  name = 'Restaurant Scale',
  description = 'Multi-location purchasing, advanced controls, reporting, and automation for restaurant groups.',
  price_per_month = 149.00,
  price_per_year = 1490.00,
  is_active = true,
  requires_admin_assignment = false,
  display_order = 30,
  limits = '{
    "branches": 3,
    "users": 20,
    "orders_per_day": -1,
    "suppliers_per_restaurant": -1,
    "restaurant_inventory_skus": -1,
    "chats_per_day": -1,
    "open_conversations": -1,
    "storage_mb": 10240,
    "quick_lists": -1,
    "quick_list_items": -1,
    "scheduled_quick_lists": -1,
    "deal_redemptions_per_day": -1,
    "scheduled_order_grace_per_day": 0,
    "ai_requests_per_day": 150
  }'::jsonb,
  features = '{
    "chat": "group_chat_files",
    "order_calendar": true,
    "quick_lists": "ai_smart_automation",
    "receiving_quality": "quality_scoring",
    "disputes_returns": true,
    "finance_invoices": "advanced_finance_dashboard",
    "inventory_management": "multi_branch_tracking",
    "recipe_costing": true,
    "waste_tracking": "analytics_dashboard",
    "supplier_deals": true,
    "supplier_deals_redeem": true,
    "supplier_reviews": true,
    "order_amendments": true,
    "notifications": "email_whatsapp_webhook",
    "push_notifications": true,
    "reports": "advanced_forecasting_custom_reports",
    "smart_reorder": "ai_forecast_seasonality",
    "ai_platform": true,
    "multi_branch": "central_purchasing",
    "custom_branding": "logo_colors",
    "tenant_audit_log": true,
    "waitlist_auto_promo": true,
    "advanced_roles": true,
    "api_integrations": "full_api_webhooks",
    "feature_flags_access": "addon_toggles",
    "fulfillment_tools": false,
    "support_sla": "priority_24h"
  }'::jsonb,
  updated_at = now()
WHERE code = 'gold' AND tenant_type = 'RESTAURANT';

-- Restaurant Platinum remains as hidden custom/legacy handling.
UPDATE subscription_plan
SET
  name = 'Restaurant Custom',
  description = 'Hidden custom handling for exceptional restaurant accounts.',
  is_active = false,
  requires_admin_assignment = true,
  display_order = 90,
  updated_at = now()
WHERE code = 'platinum' AND tenant_type = 'RESTAURANT';

-- Supplier Silver is retained only for legacy references; public Supplier Growth uses gold.
UPDATE subscription_plan
SET
  name = 'Supplier Legacy Growth',
  description = 'Hidden legacy supplier tier retained for compatibility.',
  is_active = false,
  requires_admin_assignment = true,
  display_order = 90,
  updated_at = now()
WHERE code = 'silver' AND tenant_type = 'SUPPLIER';

-- Supplier Growth: preserve code gold for compatibility.
UPDATE subscription_plan
SET
  name = 'Supplier Growth',
  description = 'Digital ordering, fulfillment, delivery, and customer intelligence for growing suppliers.',
  price_per_month = 149.00,
  price_per_year = 1490.00,
  is_active = true,
  requires_admin_assignment = false,
  display_order = 20,
  limits = '{
    "branches": 1,
    "warehouses": 1,
    "active_customer_locations_monthly": 50,
    "users": 10,
    "drivers": 5,
    "supplier_products_skus": -1,
    "chats_per_day": 500,
    "open_conversations": 30,
    "storage_mb": 5120,
    "promotions": 10,
    "ai_requests_per_day": 50
  }'::jsonb,
  features = '{
    "chat": "group_chat_files",
    "order_calendar": true,
    "reports": "basic_kpis",
    "smart_reorder": "full_90day_trends",
    "ai_platform": true,
    "multi_branch": false,
    "warehouses": true,
    "multi_warehouse": false,
    "fulfillment": true,
    "fulfillment_tools": "manual_orders_invoices",
    "driver_management": true,
    "disputes_returns": true,
    "finance_invoices": "record_payments",
    "quick_lists": true,
    "inventory_management": "real_time",
    "advanced_roles": false,
    "notifications": "in_app_and_email",
    "api_integrations": false,
    "support_sla": "standard_72h",
    "custom_branding": false,
    "feature_flags_access": false,
    "promotions": true,
    "push_notifications": true,
    "order_amendments": true,
    "tenant_audit_log": false,
    "supplier_growth": true
  }'::jsonb,
  updated_at = now()
WHERE code = 'gold' AND tenant_type = 'SUPPLIER';

-- Supplier Scale: preserve code platinum for compatibility.
UPDATE subscription_plan
SET
  name = 'Supplier Scale',
  description = 'Advanced multi-location fulfillment, logistics, analytics, and AI tools for larger supplier operations.',
  price_per_month = 349.00,
  price_per_year = 3490.00,
  is_active = true,
  requires_admin_assignment = false,
  display_order = 30,
  limits = '{
    "branches": 3,
    "warehouses": 3,
    "active_customer_locations_monthly": 200,
    "users": 30,
    "drivers": 20,
    "supplier_products_skus": -1,
    "chats_per_day": -1,
    "open_conversations": -1,
    "storage_mb": 30720,
    "promotions": 50,
    "ai_requests_per_day": 300
  }'::jsonb,
  features = '{
    "chat": "real_time_media_read_receipts",
    "order_calendar": true,
    "reports": "advanced_forecasting_custom_reports",
    "smart_reorder": "ai_forecast_seasonality",
    "ai_platform": true,
    "multi_branch": true,
    "warehouses": true,
    "multi_warehouse": true,
    "fulfillment": true,
    "fulfillment_tools": "routing_full_suite",
    "driver_management": true,
    "disputes_returns": true,
    "finance_invoices": "advanced_finance_dashboard",
    "quick_lists": true,
    "inventory_management": "lot_expiry_tracking",
    "advanced_roles": true,
    "notifications": "email_whatsapp_webhook",
    "api_integrations": "full_api_webhooks",
    "support_sla": "priority_24h",
    "custom_branding": "logo_colors",
    "feature_flags_access": "addon_toggles",
    "promotions": true,
    "push_notifications": true,
    "order_amendments": true,
    "tenant_audit_log": true,
    "supplier_growth": true
  }'::jsonb,
  updated_at = now()
WHERE code = 'platinum' AND tenant_type = 'SUPPLIER';

-- Trial remains an internal free row; user-facing APIs hide it except for current trial tenants.
UPDATE subscription_plan sp_free
SET
  name = '30-day Free Trial',
  description = 'Time-limited evaluation of the selected Growth plan; not a permanent public free plan.',
  price_per_month = 0,
  price_per_year = 0,
  trial_days = 30,
  is_active = true,
  requires_admin_assignment = false,
  display_order = 10,
  features = sp_growth.features,
  limits = CASE
    WHEN sp_free.tenant_type = 'RESTAURANT' THEN sp_growth.limits || '{"storage_mb": 2048, "ai_requests_per_day": 0}'::jsonb
    ELSE sp_growth.limits || '{"storage_mb": 5120, "ai_requests_per_day": 0}'::jsonb
  END,
  updated_at = now()
FROM subscription_plan sp_growth
WHERE sp_free.code = 'free'
  AND sp_growth.tenant_type = sp_free.tenant_type
  AND sp_growth.code = CASE WHEN sp_free.tenant_type = 'RESTAURANT' THEN 'silver' ELSE 'gold' END;

-- Set default trial target for existing free subscriptions when none was recorded.
UPDATE subscription s
SET trial_target_plan_id = sp_target.id,
    updated_at = now()
FROM subscription_plan sp_target
WHERE s.trial_target_plan_id IS NULL
  AND s.tenant_type = sp_target.tenant_type
  AND s.plan_id IN (SELECT id FROM subscription_plan WHERE code = 'free')
  AND sp_target.code = CASE WHEN s.tenant_type = 'RESTAURANT' THEN 'silver' ELSE 'gold' END;

-- Move active Supplier Silver subscriptions to Supplier Growth (gold) while preserving subscription IDs and billing dates.
WITH supplier_silver_remap AS (
  SELECT
    s.id AS subscription_id,
    s.plan_id AS from_plan_id,
    sp_growth.id AS to_plan_id
  FROM subscription s
  JOIN subscription_plan sp_current ON sp_current.id = s.plan_id
  JOIN subscription_plan sp_growth
    ON sp_growth.tenant_type = s.tenant_type
   AND sp_growth.code = 'gold'
  WHERE s.tenant_type = 'SUPPLIER'
    AND sp_current.code = 'silver'
    AND s.status <> 'CANCELLED'
)
INSERT INTO subscription_change_log (subscription_id, from_plan_id, to_plan_id, reason)
SELECT
  subscription_id,
  from_plan_id,
  to_plan_id,
  'four_plan_pricing_model: supplier_silver_to_supplier_growth'
FROM supplier_silver_remap ssr
WHERE ssr.from_plan_id IS DISTINCT FROM ssr.to_plan_id
  AND NOT EXISTS (
    SELECT 1
    FROM subscription_change_log scl
    WHERE scl.subscription_id = ssr.subscription_id
      AND scl.from_plan_id = ssr.from_plan_id
      AND scl.to_plan_id = ssr.to_plan_id
      AND scl.reason = 'four_plan_pricing_model: supplier_silver_to_supplier_growth'
  );

WITH supplier_silver_remap AS (
  SELECT
    s.id AS subscription_id,
    sp_growth.id AS to_plan_id,
    sp_growth.name AS to_plan_name
  FROM subscription s
  JOIN subscription_plan sp_current ON sp_current.id = s.plan_id
  JOIN subscription_plan sp_growth
    ON sp_growth.tenant_type = s.tenant_type
   AND sp_growth.code = 'gold'
  WHERE s.tenant_type = 'SUPPLIER'
    AND sp_current.code = 'silver'
    AND s.status <> 'CANCELLED'
)
UPDATE subscription s
SET
  previous_plan_code = 'silver',
  plan_id = ssr.to_plan_id,
  plan_name = ssr.to_plan_name,
  updated_at = now()
FROM supplier_silver_remap ssr
WHERE s.id = ssr.subscription_id;

-- Move active Restaurant Platinum subscriptions to Restaurant Scale (gold) while preserving subscription IDs and billing dates.
WITH restaurant_platinum_remap AS (
  SELECT
    s.id AS subscription_id,
    s.plan_id AS from_plan_id,
    sp_scale.id AS to_plan_id
  FROM subscription s
  JOIN subscription_plan sp_current ON sp_current.id = s.plan_id
  JOIN subscription_plan sp_scale
    ON sp_scale.tenant_type = s.tenant_type
   AND sp_scale.code = 'gold'
  WHERE s.tenant_type = 'RESTAURANT'
    AND sp_current.code = 'platinum'
    AND s.status <> 'CANCELLED'
)
INSERT INTO subscription_change_log (subscription_id, from_plan_id, to_plan_id, reason)
SELECT
  subscription_id,
  from_plan_id,
  to_plan_id,
  'four_plan_pricing_model: restaurant_platinum_to_restaurant_scale'
FROM restaurant_platinum_remap rpr
WHERE rpr.from_plan_id IS DISTINCT FROM rpr.to_plan_id
  AND NOT EXISTS (
    SELECT 1
    FROM subscription_change_log scl
    WHERE scl.subscription_id = rpr.subscription_id
      AND scl.from_plan_id = rpr.from_plan_id
      AND scl.to_plan_id = rpr.to_plan_id
      AND scl.reason = 'four_plan_pricing_model: restaurant_platinum_to_restaurant_scale'
  );

WITH restaurant_platinum_remap AS (
  SELECT
    s.id AS subscription_id,
    sp_scale.id AS to_plan_id,
    sp_scale.name AS to_plan_name
  FROM subscription s
  JOIN subscription_plan sp_current ON sp_current.id = s.plan_id
  JOIN subscription_plan sp_scale
    ON sp_scale.tenant_type = s.tenant_type
   AND sp_scale.code = 'gold'
  WHERE s.tenant_type = 'RESTAURANT'
    AND sp_current.code = 'platinum'
    AND s.status <> 'CANCELLED'
)
UPDATE subscription s
SET
  previous_plan_code = 'platinum',
  plan_id = rpr.to_plan_id,
  plan_name = rpr.to_plan_name,
  updated_at = now()
FROM restaurant_platinum_remap rpr
WHERE s.id = rpr.subscription_id;
-- Preserve existing paid subscription plan_name labels after catalog rename.
UPDATE subscription s
SET plan_name = sp.name,
    updated_at = now()
FROM subscription_plan sp
WHERE s.plan_id = sp.id
  AND s.status <> 'CANCELLED'
  AND s.plan_name IS DISTINCT FROM sp.name;

-- Preview table for operators; idempotently refreshes non-confidential migration review data.
CREATE TABLE IF NOT EXISTS pricing_migration_preview (
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER')),
  current_plan_code TEXT,
  proposed_plan_code TEXT,
  current_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  preserved_addons JSONB NOT NULL DEFAULT '[]'::jsonb,
  preserved_overrides JSONB NOT NULL DEFAULT '[]'::jsonb,
  needs_manual_review BOOLEAN NOT NULL DEFAULT false,
  review_reasons TEXT[] NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tenant_type)
);

ALTER TABLE pricing_migration_preview
  ADD COLUMN IF NOT EXISTS required_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS preserved_addons JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preserved_overrides JSONB NOT NULL DEFAULT '[]'::jsonb;

TRUNCATE pricing_migration_preview;

INSERT INTO pricing_migration_preview (
  tenant_id,
  tenant_type,
  current_plan_code,
  proposed_plan_code,
  current_usage,
  target_limits,
  needs_manual_review,
  review_reasons
)
SELECT
  s.tenant_id,
  s.tenant_type,
  sp.code AS current_plan_code,
  CASE
    WHEN s.tenant_type = 'RESTAURANT' AND sp.code IN ('free', 'silver') THEN 'silver'
    WHEN s.tenant_type = 'RESTAURANT' AND sp.code IN ('gold', 'platinum') THEN 'gold'
    WHEN s.tenant_type = 'SUPPLIER' AND sp.code IN ('free', 'silver', 'gold') THEN 'gold'
    WHEN s.tenant_type = 'SUPPLIER' AND sp.code = 'platinum' THEN 'platinum'
    ELSE sp.code
  END AS proposed_plan_code,
  '{}'::jsonb AS current_usage,
  COALESCE(sp_target.limits, '{}'::jsonb) AS target_limits,
  sp.code IN ('enterprise') AS needs_manual_review,
  CASE WHEN sp.code IN ('enterprise') THEN ARRAY['custom_enterprise_account']::text[] ELSE ARRAY[]::text[] END
FROM subscription s
JOIN subscription_plan sp ON sp.id = s.plan_id
LEFT JOIN subscription_plan sp_target
  ON sp_target.tenant_type = s.tenant_type
 AND sp_target.code = CASE
    WHEN s.tenant_type = 'RESTAURANT' AND sp.code IN ('free', 'silver') THEN 'silver'
    WHEN s.tenant_type = 'RESTAURANT' AND sp.code IN ('gold', 'platinum') THEN 'gold'
    WHEN s.tenant_type = 'SUPPLIER' AND sp.code IN ('free', 'silver', 'gold') THEN 'gold'
    WHEN s.tenant_type = 'SUPPLIER' AND sp.code = 'platinum' THEN 'platinum'
    ELSE sp.code
  END
WHERE s.status <> 'CANCELLED';


-- Populate non-confidential current usage and flag obvious target-limit conflicts.
WITH usage_snapshot AS (
  SELECT
    pp.tenant_id,
    pp.tenant_type,
    pp.target_limits,
    CASE
      WHEN pp.tenant_type = 'RESTAURANT' THEN jsonb_build_object(
        'branches', (
          SELECT COUNT(*)::int
          FROM restaurant r
          JOIN restaurant root ON root.id = pp.tenant_id
          WHERE r.id = root.id
             OR (root.organization_id IS NOT NULL AND r.organization_id = root.organization_id)
        ),
        'users', (
          SELECT COUNT(DISTINCT tur.user_id)::int
          FROM tenant_user_roles tur
          JOIN restaurant r ON r.id = tur.tenant_id
          JOIN restaurant root ON root.id = pp.tenant_id
          WHERE tur.tenant_type = 'RESTAURANT'
            AND (r.id = root.id OR (root.organization_id IS NOT NULL AND r.organization_id = root.organization_id))
        )
      )
      ELSE jsonb_build_object(
        'branches', (
          SELECT COUNT(*)::int
          FROM supplier s
          JOIN supplier root ON root.id = pp.tenant_id
          WHERE s.id = root.id
             OR (root.organization_id IS NOT NULL AND s.organization_id = root.organization_id)
        ),
        'warehouses', (
          SELECT COUNT(*)::int
          FROM warehouse w
          JOIN supplier root ON root.id = pp.tenant_id
          JOIN supplier s ON s.id = w.supplier_id
          WHERE w.is_active = true
            AND (s.id = root.id OR (root.organization_id IS NOT NULL AND s.organization_id = root.organization_id))
        ),
        'active_customer_locations_monthly', (
          SELECT COUNT(DISTINCT COALESCE(o.branch_id, o.restaurant_id))::int
          FROM customer_order o
          JOIN order_item oi ON oi.order_id = o.id
          JOIN supplier root ON root.id = pp.tenant_id
          JOIN supplier s ON s.id = oi.supplier_id
          WHERE o.status::text IN (
            'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'DELIVERED',
            'RECEIVED_PARTIAL', 'RECEIVED_FULL', 'RECEIVED_WITH_DISPUTE',
            'INVOICED', 'COMPLETED'
          )
            AND COALESCE(o.placed_at, o.created_at) >= date_trunc('month', now() AT TIME ZONE 'UTC')
            AND COALESCE(o.placed_at, o.created_at) < (date_trunc('month', now() AT TIME ZONE 'UTC') + INTERVAL '1 month')
            AND (s.id = root.id OR (root.organization_id IS NOT NULL AND s.organization_id = root.organization_id))
        ),
        'users', (
          SELECT COUNT(DISTINCT tur.user_id)::int
          FROM tenant_user_roles tur
          JOIN supplier s ON s.id = tur.tenant_id
          JOIN supplier root ON root.id = pp.tenant_id
          WHERE tur.tenant_type = 'SUPPLIER'
            AND (s.id = root.id OR (root.organization_id IS NOT NULL AND s.organization_id = root.organization_id))
        ),
        'drivers', (
          SELECT COUNT(*)::int
          FROM drivers d
          JOIN supplier root ON root.id = pp.tenant_id
          JOIN supplier s ON s.id = d.supplier_id
          WHERE d.is_active = true
            AND (s.id = root.id OR (root.organization_id IS NOT NULL AND s.organization_id = root.organization_id))
        )
      )
    END AS current_usage
  FROM pricing_migration_preview pp
), flagged_usage AS (
  SELECT
    tenant_id,
    tenant_type,
    current_usage,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN COALESCE((target_limits->>'branches')::int, -1) >= 0
             AND COALESCE((current_usage->>'branches')::int, 0) > COALESCE((target_limits->>'branches')::int, -1)
           THEN 'branches_over_target' END,
      CASE WHEN COALESCE((target_limits->>'warehouses')::int, -1) >= 0
             AND COALESCE((current_usage->>'warehouses')::int, 0) > COALESCE((target_limits->>'warehouses')::int, -1)
           THEN 'warehouses_over_target' END,
      CASE WHEN COALESCE((target_limits->>'active_customer_locations_monthly')::int, -1) >= 0
             AND COALESCE((current_usage->>'active_customer_locations_monthly')::int, 0) > COALESCE((target_limits->>'active_customer_locations_monthly')::int, -1)
           THEN 'active_customer_locations_over_target' END,
      CASE WHEN COALESCE((target_limits->>'users')::int, -1) >= 0
             AND COALESCE((current_usage->>'users')::int, 0) > COALESCE((target_limits->>'users')::int, -1)
           THEN 'users_over_target' END,
      CASE WHEN COALESCE((target_limits->>'drivers')::int, -1) >= 0
             AND COALESCE((current_usage->>'drivers')::int, 0) > COALESCE((target_limits->>'drivers')::int, -1)
           THEN 'drivers_over_target' END
    ], NULL)::text[] AS review_reasons
  FROM usage_snapshot
)
UPDATE pricing_migration_preview pp
SET
  current_usage = fu.current_usage,
  required_overrides = jsonb_strip_nulls(jsonb_build_object(
    'branches', CASE WHEN 'branches_over_target' = ANY(fu.review_reasons) THEN fu.current_usage->'branches' END,
    'warehouses', CASE WHEN 'warehouses_over_target' = ANY(fu.review_reasons) THEN fu.current_usage->'warehouses' END,
    'active_customer_locations_monthly', CASE WHEN 'active_customer_locations_over_target' = ANY(fu.review_reasons) THEN fu.current_usage->'active_customer_locations_monthly' END,
    'users', CASE WHEN 'users_over_target' = ANY(fu.review_reasons) THEN fu.current_usage->'users' END,
    'drivers', CASE WHEN 'drivers_over_target' = ANY(fu.review_reasons) THEN fu.current_usage->'drivers' END
  )),
  preserved_addons = COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'addonKey', tsa.addon_key,
      'quantity', tsa.quantity,
      'unitPriceMonthly', tsa.unit_price_monthly,
      'status', tsa.status,
      'startsAt', tsa.starts_at,
      'endsAt', tsa.ends_at
    ) ORDER BY tsa.addon_key)
    FROM tenant_subscription_addon tsa
    WHERE tsa.tenant_id = pp.tenant_id
      AND tsa.tenant_type = pp.tenant_type
      AND tsa.status = 'active'
  ), '[]'::jsonb),
  preserved_overrides = COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'limitKey', tlo.limit_type,
      'overrideValue', tlo.override_value,
      'expirationDate', tlo.expiration_date,
      'reason', tlo.reason
    ) ORDER BY tlo.limit_type)
    FROM tenant_limit_override tlo
    WHERE tlo.tenant_id = pp.tenant_id
      AND tlo.tenant_type = pp.tenant_type
      AND tlo.is_active = true
      AND (tlo.expiration_date IS NULL OR tlo.expiration_date > now())
  ), '[]'::jsonb),
  needs_manual_review = pp.needs_manual_review OR COALESCE(array_length(fu.review_reasons, 1), 0) > 0,
  review_reasons = ARRAY(SELECT DISTINCT unnest(pp.review_reasons || fu.review_reasons)),
  generated_at = now()
FROM flagged_usage fu
WHERE fu.tenant_id = pp.tenant_id
  AND fu.tenant_type = pp.tenant_type;
COMMENT ON TABLE pricing_migration_preview IS
  'Dry-run review table for four-plan pricing migration. It intentionally stores IDs and plan codes only, not tenant names.';
