-- Initial database setup
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- Set timezone
SET timezone = 'UTC';

-- Create additional databases for services if needed
-- (Or use single DB with schemas - we'll use single DB for simplicity)

