-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Role referenced by SQL migrations (GRANT statements)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'api_user') THEN
    CREATE ROLE api_user;
  END IF;
END
$$;

-- Create keycloak database
CREATE DATABASE keycloak;
