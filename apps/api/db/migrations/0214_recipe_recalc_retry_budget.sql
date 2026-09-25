-- Migration: 0214_recipe_recalc_retry_budget.sql
-- The recalc worker used to DELETE a dirty row whose recalculation threw, which
-- silently dropped the pending work. Keeping the row instead is correct, but a
-- permanently failing row is then re-selected on every tick, and because the
-- batch is `ORDER BY created_at ASC LIMIT 50` a handful of poison rows can
-- starve the whole queue. Give each row a bounded retry budget so failures are
-- retried, then parked for operators instead of blocking healthy work.

ALTER TABLE recipe_recalc_dirty
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

COMMENT ON COLUMN recipe_recalc_dirty.attempts IS
  'Consecutive failed recalculation attempts for this dirty scope.';
COMMENT ON COLUMN recipe_recalc_dirty.failed_at IS
  'Set once the retry budget is exhausted; parked rows are skipped by the worker.';

-- Only unparked rows are claimable, so the partial index matches the worker query.
CREATE INDEX IF NOT EXISTS idx_recipe_recalc_dirty_pending
  ON recipe_recalc_dirty (created_at)
  WHERE failed_at IS NULL;
