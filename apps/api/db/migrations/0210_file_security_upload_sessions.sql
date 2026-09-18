-- Upload security boundary: opaque authenticated sessions and exact scan results.
CREATE TABLE IF NOT EXISTS file_upload_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash BYTEA NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  tenant_id UUID,
  tenant_type TEXT CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT', 'ADMIN')),
  organization_id UUID,
  destination_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  max_bytes BIGINT NOT NULL CHECK (max_bytes > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'processing', 'completed', 'rejected', 'failed')
  ),
  requested_sha256 CHAR(64),
  completed_sha256 CHAR(64),
  stored_etag TEXT,
  stored_version_id TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_file_upload_session_owner
  ON file_upload_session (user_id, tenant_id, tenant_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_upload_session_expiry
  ON file_upload_session (state, expires_at);
CREATE INDEX IF NOT EXISTS idx_file_upload_session_destination
  ON file_upload_session (destination_key, state);

CREATE TABLE IF NOT EXISTS file_security_scan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_session_id UUID REFERENCES file_upload_session(id) ON DELETE SET NULL,
  file_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_scan', 'clean', 'infected', 'scan_failed')),
  sha256 CHAR(64) NOT NULL,
  stored_etag TEXT,
  stored_version_id TEXT,
  scanner TEXT,
  scanner_signature TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scanned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_file_security_scan_file_version
  ON file_security_scan (file_key, sha256, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_security_scan_pending
  ON file_security_scan (status, created_at);

COMMENT ON TABLE file_upload_session IS
  'Authenticated, single-use upload capability. token_hash is never returned or logged.';
COMMENT ON TABLE file_security_scan IS
  'Virus-scan verdict bound to the exact stored object version and SHA-256.';
