-- Migration: 0144_supplier_finance_invoices_plan_features.sql
-- Restore finance_invoices on SUPPLIER paid tiers (dropped accidentally in 0117/0119/0120).
-- Restaurant tiers kept this key; supplier invoice routes gate on finance_invoices.

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"finance_invoices": "record_payments"}'::jsonb,
  updated_at = now()
WHERE code = 'silver'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true
  AND NOT (COALESCE(features, '{}'::jsonb) ? 'finance_invoices');

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"finance_invoices": "expense_analytics"}'::jsonb,
  updated_at = now()
WHERE code = 'gold'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true
  AND NOT (COALESCE(features, '{}'::jsonb) ? 'finance_invoices');

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"finance_invoices": "advanced_finance_dashboard"}'::jsonb,
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true
  AND NOT (COALESCE(features, '{}'::jsonb) ? 'finance_invoices');
