import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({ query: vi.fn(), withTransaction: vi.fn() }))
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { config } from '../config/env.js'
import { signConsumerToken, verifyConsumerToken } from './consumer-auth.service.js'

const claims = { memberId: 'm1', restaurantId: 'r1', username: 'diner' }

describe('consumer auth signing secret', () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    consumer: config.CONSUMER_AUTH_SECRET,
    session: config.SESSION_SECRET,
    jwt: config.JWT_SECRET,
  }

  beforeEach(() => {
    config.CONSUMER_AUTH_SECRET = ''
    config.SESSION_SECRET = ''
    config.JWT_SECRET = ''
  })

  afterEach(() => {
    process.env.NODE_ENV = original.nodeEnv
    config.CONSUMER_AUTH_SECRET = original.consumer
    config.SESSION_SECRET = original.session
    config.JWT_SECRET = original.jwt
  })

  it('refuses the development fallback secret when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production'
    await expect(signConsumerToken(claims)).rejects.toThrow(/CONSUMER_AUTH_SECRET/)
  })

  it('refuses the literal development default even when explicitly configured in production', async () => {
    process.env.NODE_ENV = 'production'
    config.CONSUMER_AUTH_SECRET = 'dev-consumer-auth-secret'
    await expect(signConsumerToken(claims)).rejects.toThrow(/development default/)
  })

  it('still works with the development fallback outside production', async () => {
    process.env.NODE_ENV = 'test'
    const token = await signConsumerToken(claims)
    await expect(verifyConsumerToken(token)).resolves.toMatchObject(claims)
  })

  it('signs with a configured secret in production', async () => {
    process.env.NODE_ENV = 'production'
    config.CONSUMER_AUTH_SECRET = 'a-real-secret-that-is-long-enough-123456'
    const token = await signConsumerToken(claims)
    await expect(verifyConsumerToken(token)).resolves.toMatchObject(claims)
  })
})
