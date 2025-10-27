-- Create session table for connect-pg-simple
-- Note: connect-pg-simple automatically creates this table, but we ensure it exists
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP NOT NULL
);

-- Create index for faster session expiration cleanup
CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);

-- Ensure the table exists by running this SQL
-- The connect-pg-simple will use this table for session storage

