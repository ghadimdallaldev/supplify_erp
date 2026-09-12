-- Ensure a browser/device push endpoint belongs to only one account.
-- Re-registering the same device transfers ownership to the currently authenticated user.

BEGIN;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY endpoint
      ORDER BY created_at DESC, id DESC
    ) AS row_number
  FROM push_subscriptions
)
DELETE FROM push_subscriptions ps
USING ranked
WHERE ps.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_subscriptions_endpoint
  ON push_subscriptions (endpoint);

COMMIT;
