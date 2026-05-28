-- Free tier = time-limited testing sandbox (admin-configurable duration).

CREATE TABLE IF NOT EXISTS platform_setting (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_setting (key, value)
VALUES ('free_sandbox_days', '7'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE subscription
  ADD COLUMN IF NOT EXISTS free_sandbox_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN subscription.free_sandbox_expires_at IS
  'When set, free-plan workspace auto-locks after this time (testing sandbox).';

CREATE INDEX IF NOT EXISTS idx_subscription_free_sandbox_expires
  ON subscription (free_sandbox_expires_at)
  WHERE free_sandbox_expires_at IS NOT NULL;

-- Backfill active free workspaces (use current platform default days).
UPDATE subscription s
SET free_sandbox_expires_at = now() + (
  COALESCE(
    (SELECT (value #>> '{}')::int FROM platform_setting WHERE key = 'free_sandbox_days'),
    7
  ) * INTERVAL '1 day'
)
FROM subscription_plan sp
WHERE s.plan_id = sp.id
  AND sp.code = 'free'
  AND s.status IN ('TRIALING', 'ACTIVE')
  AND s.free_sandbox_expires_at IS NULL;
