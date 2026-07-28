-- Phase 1 identity hardening.
-- Fail closed before normalization/index creation if duplicate normalized emails exist.
DO $$
DECLARE
  duplicate_groups INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_groups
  FROM (
    SELECT LOWER(TRIM(email)) AS normalized_email
    FROM app_user
    GROUP BY LOWER(TRIM(email))
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION
      'app_user email CI uniqueness blocked: % duplicate normalized email group(s); resolve duplicates before retrying',
      duplicate_groups;
  END IF;
END $$;

UPDATE app_user
SET email = LOWER(TRIM(email))
WHERE email <> LOWER(TRIM(email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_email_ci
  ON app_user (LOWER(TRIM(email)));

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_app_user_active_sub
  ON app_user (keycloak_sub)
  WHERE is_active = TRUE;
