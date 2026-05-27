-- Approvals & budgets product surface removed; drop feature-flag entries so tenants are not nagged to upgrade.

DELETE FROM feature_flag_override WHERE feature_key = 'approvals_budgets';

DELETE FROM feature_flag WHERE feature_key = 'approvals_budgets';

UPDATE subscription_plan
SET
  features = features - 'approvals_budgets',
  updated_at = now()
WHERE features ? 'approvals_budgets';
