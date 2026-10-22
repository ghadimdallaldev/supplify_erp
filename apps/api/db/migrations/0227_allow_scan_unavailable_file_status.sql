-- Scanner-outage fallback stores magic-byte-valid uploads with an explicit
-- non-clean verdict. Keep the database constraint aligned with that runtime
-- state so delivery proof and other critical uploads can use the documented
-- degraded path without failing after object promotion.
ALTER TABLE file_security_scan
  DROP CONSTRAINT IF EXISTS file_security_scan_status_check;

ALTER TABLE file_security_scan
  ADD CONSTRAINT file_security_scan_status_check
  CHECK (status IN ('pending_scan', 'clean', 'infected', 'scan_failed', 'scan_unavailable'))
  NOT VALID;

ALTER TABLE file_security_scan
  VALIDATE CONSTRAINT file_security_scan_status_check;

COMMENT ON COLUMN file_security_scan.status IS
  'Upload verdict: clean/infected, scan_failed, or scan_unavailable for a magic-byte-valid degraded acceptance.';
