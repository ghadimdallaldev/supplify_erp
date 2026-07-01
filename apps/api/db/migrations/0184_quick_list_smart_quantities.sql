-- Platinum quick-list smart quantities: forecast-based adjustment on scheduled runs.

ALTER TABLE quick_list
  ADD COLUMN IF NOT EXISTS use_ai_quantities BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN quick_list.use_ai_quantities IS
  'When true (Platinum ai_smart_automation), scheduled order quantities use usage forecasts.';

ALTER TABLE quick_list_execution
  ADD COLUMN IF NOT EXISTS ai_adjustments JSONB;

COMMENT ON COLUMN quick_list_execution.ai_adjustments IS
  'Audit of per-product quantity adjustments applied during a smart-quantity scheduled run.';
