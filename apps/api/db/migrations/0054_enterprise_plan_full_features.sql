-- Migration: 0054_enterprise_plan_full_features.sql
-- Ensure Enterprise plan has the full feature set (superset of Platinum) so upgrading
-- to Enterprise never incorrectly shows standard features as "disabled" in change-plan preview.

-- ========================================
-- 1) Enterprise RESTAURANT: add missing keys (approvals_budgets, feature_flags_access)
-- ========================================
UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{
    "approvals_budgets": "multi_level_approvals",
    "feature_flags_access": "all_experimental"
  }'::jsonb,
  updated_at = now()
WHERE code = 'enterprise' AND tenant_type = 'RESTAURANT';

-- ========================================
-- 2) Enterprise SUPPLIER: add full feature set (match Platinum-tier keys so upgrade never disables)
-- ========================================
UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{
    "quick_lists": "ai_smart_automation",
    "inventory_management": "lot_expiry_tracking",
    "waste_tracking": "cost_percentage_vs_sales",
    "receiving_quality": "supplier_performance_reports",
    "finance_invoices": "advanced_finance_dashboard",
    "approvals_budgets": "multi_level_approvals",
    "feature_flags_access": "all_experimental"
  }'::jsonb,
  updated_at = now()
WHERE code = 'enterprise' AND tenant_type = 'SUPPLIER';
