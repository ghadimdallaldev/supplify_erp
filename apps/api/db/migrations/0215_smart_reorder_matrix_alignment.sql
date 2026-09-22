-- Migration: 0215_smart_reorder_matrix_alignment.sql
-- Align `smart_reorder` with the launch entitlement matrix.
--
-- Growth is specified as "basic reorder suggestions"; demand forecasting,
-- stockout prediction, and smart reorder quantities belong to Intelligence and
-- above. Both Growth plans currently carry "full_90day_trends", which
-- resolveSmartReorderCapabilities() maps to the forecast-capable tier, so
-- Growth tenants get forecasting the matrix does not sell them.
--
-- `suggestions_only` falls through resolveSmartReorderCapabilities() to the
-- `basic` tier: assistance on, forecast off. It is named for the capability
-- rather than a time window on purpose — no code restricts history length, and
-- the legacy `limited_7day_history` label implied a data cap that does not
-- exist and that we do not want to introduce.
--
-- Prices and billing mechanics are unchanged.

-- Restaurant Growth: deterministic low-stock and cadence suggestions, no forecast.
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb) || '{"smart_reorder":"suggestions_only"}'::jsonb,
    updated_at = now()
WHERE code = 'silver' AND tenant_type = 'RESTAURANT';

-- Supplier Growth: reorder and inventory alerts, no demand forecasting.
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb) || '{"smart_reorder":"suggestions_only"}'::jsonb,
    updated_at = now()
WHERE code = 'gold' AND tenant_type = 'SUPPLIER';

-- Intelligence and both Scale plans keep ai_forecast_seasonality, set in 0212
-- for restaurants. Assert it explicitly for Supplier Scale so the ladder is
-- monotonic regardless of which catalog migrations a database has seen.
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb)
      || '{"smart_reorder":"ai_forecast_seasonality"}'::jsonb,
    updated_at = now()
WHERE code = 'platinum' AND tenant_type = 'SUPPLIER';

-- Trials mirror their tenant's Growth plan, so refresh them after the change.
-- Keep the assistant and reorder-LLM keys off, as 0212 does.
UPDATE subscription_plan trial_plan
SET features = growth_plan.features || '{"ai_assistant":false,"ai_platform":false}'::jsonb,
    updated_at = now()
FROM subscription_plan growth_plan
WHERE trial_plan.code = 'free'
  AND trial_plan.tenant_type = growth_plan.tenant_type
  AND growth_plan.code = CASE WHEN trial_plan.tenant_type = 'RESTAURANT' THEN 'silver' ELSE 'gold' END;
