import dotenv from 'dotenv';

dotenv.config();

export const config = {
  PORT: process.env.PORT || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:5173',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
  KEYCLOAK_BASE_URL: process.env.KEYCLOAK_BASE_URL || 'http://localhost:8080',
  KEYCLOAK_REALM: process.env.KEYCLOAK_REALM || 'Supplify',
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID || 'supplify-api',
  KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET || 'changeme',
  SESSION_SECRET: process.env.SESSION_SECRET || 'supersecret',
  S3_ENDPOINT: process.env.S3_ENDPOINT || 'http://localhost:9000',
  S3_BUCKET: process.env.S3_BUCKET || 'supplify',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || 'minioadmin',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || 'minioadmin',
};
