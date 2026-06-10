/**
 * Vitest global setup: stable defaults for API unit/route tests.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test'
process.env.CRONS_ENABLED = process.env.CRONS_ENABLED || 'false'
process.env.BILLING_GATEWAY = process.env.BILLING_GATEWAY || 'stub'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret'
process.env.IMPERSONATION_SECRET =
  process.env.IMPERSONATION_SECRET || 'test-impersonation-secret-for-api-tests'
