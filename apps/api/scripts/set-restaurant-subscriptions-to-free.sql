-- Point all ACTIVE/TRIALING RESTAURANT subscriptions to the Free plan (for UI / tier testing).
-- Run against your dev DB, e.g.: psql $DATABASE_URL -f scripts/set-restaurant-subscriptions-to-free.sql
--
-- After migration 0049_reduce_free_plan_revenue_focus.sql, RESTAURANT Free plan features resolve as:
--
-- ON (boolean true, or non-empty string tier values counted as "enabled" by the API):
--   chat
--   quick_lists          (plan value: basic_manual_only)
--   inventory_management (plan value: basic)
--   receiving_quality    (plan value: manual_only)
--   finance_invoices     (plan value: view_only)
--   notifications        (plan value: in_app_only)
--   support_sla          (plan value: community)
--
-- OFF (boolean false in plan JSON):
--   smart_reorder, reports, multi_branch, waste_tracking, api_integrations, custom_branding
--
-- OFF if still false from seed / not upgraded in plan JSON (typical):
--   approvals_budgets, feature_flags_access
--
-- Global or tenant feature_flag overrides still apply on top of this list.

UPDATE subscription s
SET
  plan_id = sp.id,
  plan_name = sp.name,
  updated_at = now()
FROM subscription_plan sp
WHERE sp.code = 'free'
  AND sp.tenant_type = 'RESTAURANT'
  AND sp.is_active = true
  AND s.tenant_type = 'RESTAURANT'
  AND s.status IN ('TRIALING', 'ACTIVE');

-- Optional: only one restaurant (replace UUID):
-- UPDATE subscription s
-- SET plan_id = sp.id, plan_name = sp.name, updated_at = now()
-- FROM subscription_plan sp
-- WHERE sp.code = 'free' AND sp.tenant_type = 'RESTAURANT' AND sp.is_active = true
--   AND s.tenant_id = 'YOUR-RESTAURANT-UUID'::uuid
--   AND s.tenant_type = 'RESTAURANT'
--   AND s.status IN ('TRIALING', 'ACTIVE');
