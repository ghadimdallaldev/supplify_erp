-- Allow PENDING role for users who signed up via Keycloak but have not chosen restaurant vs supplier yet.
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check
  CHECK (role IN ('ADMIN', 'SUPPLIER', 'RESTAURANT', 'PENDING'));

-- Users marked RESTAURANT/SUPPLIER without an organization should finish onboarding.
UPDATE app_user u
SET role = 'PENDING', updated_at = now()
WHERE u.role IN ('RESTAURANT', 'SUPPLIER')
  AND NOT EXISTS (
    SELECT 1 FROM restaurant r
    WHERE LOWER(TRIM(r.contact_email)) = LOWER(TRIM(u.email))
  )
  AND NOT EXISTS (
    SELECT 1 FROM supplier s
    WHERE LOWER(TRIM(s.contact_email)) = LOWER(TRIM(u.email))
  );
