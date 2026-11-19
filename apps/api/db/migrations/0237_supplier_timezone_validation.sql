-- Invalid historical timezone strings cannot be used by PostgreSQL date queries.
-- An empty setting follows the existing platform-default fallback in tenant reads.
UPDATE supplier AS s
SET last_order_timezone = '', updated_at = now()
WHERE NULLIF(TRIM(s.last_order_timezone), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names AS zone
    WHERE LOWER(zone.name) = LOWER(TRIM(s.last_order_timezone))
  );
