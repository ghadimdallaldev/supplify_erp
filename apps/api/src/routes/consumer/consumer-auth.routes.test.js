import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllMocks } from '../../test/helpers.js'

vi.mock('../../services/consumer-menu.service.js', () => ({
  resolveRestaurantBySlug: vi.fn(),
}))

vi.mock('../../services/consumer-auth.service.js', () => ({
  signupConsumer: vi.fn(),
  loginConsumer: vi.fn(),
  setConsumerAuthCookie: vi.fn(),
  clearConsumerAuthCookie: vi.fn(),
  getConsumerAuthCookieName: vi.fn(() => 'consumer_auth_token'),
  verifyConsumerFromCookie: vi.fn(),
}))

vi.mock('../../services/loyalty.service.js', () => ({
  getConsumerMemberBalance: vi.fn(),
}))

import { consumerAuthPublicRoutes } from './auth.routes.js'
import { resolveRestaurantBySlug } from '../../services/consumer-menu.service.js'
import * as consumerAuthService from '../../services/consumer-auth.service.js'
import { getConsumerMemberBalance } from '../../services/loyalty.service.js'

const mockMember = {
  id: 'member-1',
  restaurantId: 'rest-1',
  username: 'diner1',
  displayName: 'Diner One',
  loyaltyPoints: 100,
}

describe('Consumer Auth Routes', () => {
  let app

  beforeEach(() => {
    clearAllMocks()
    vi.mocked(resolveRestaurantBySlug).mockResolvedValue({
      id: 'rest-1',
      slug: 'demo-bistro',
      name: 'Demo Bistro',
    })
    vi.mocked(consumerAuthService.signupConsumer).mockResolvedValue({
      member: mockMember,
      token: 'jwt-signup',
    })
    vi.mocked(consumerAuthService.loginConsumer).mockResolvedValue({
      member: mockMember,
      token: 'jwt-login',
    })
    vi.mocked(consumerAuthService.verifyConsumerFromCookie).mockResolvedValue(mockMember)
    vi.mocked(getConsumerMemberBalance).mockResolvedValue({
      member: mockMember,
      program: { enabled: true, earnPointsPerCurrency: 1 },
      recentLedger: [],
    })

    app = express()
    app.use(express.json())
    app.use(cookieParser())
    app.use((req, res, next) => {
      req.requestId = 'test-request-id'
      next()
    })
    app.use('/api/public/consumer/:restaurantSlug/auth', consumerAuthPublicRoutes)
  })

  it('POST /signup creates account and sets cookie', async () => {
    const res = await request(app)
      .post('/api/public/consumer/demo-bistro/auth/signup')
      .send({ username: 'diner1', password: 'password123', displayName: 'Diner One' })

    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.member.username).toBe('diner1')
    expect(consumerAuthService.signupConsumer).toHaveBeenCalledWith('rest-1', expect.any(Object))
    expect(consumerAuthService.setConsumerAuthCookie).toHaveBeenCalledWith(
      expect.any(Object),
      'jwt-signup'
    )
  })

  it('POST /login signs in and sets cookie', async () => {
    const res = await request(app)
      .post('/api/public/consumer/demo-bistro/auth/login')
      .send({ username: 'diner1', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.data.member.id).toBe('member-1')
    expect(consumerAuthService.loginConsumer).toHaveBeenCalled()
    expect(consumerAuthService.setConsumerAuthCookie).toHaveBeenCalledWith(
      expect.any(Object),
      'jwt-login'
    )
  })

  it('POST /logout clears cookie', async () => {
    const res = await request(app).post('/api/public/consumer/demo-bistro/auth/logout')

    expect(res.status).toBe(200)
    expect(res.body.data.loggedOut).toBe(true)
    expect(consumerAuthService.clearConsumerAuthCookie).toHaveBeenCalled()
  })

  it('GET /me returns member when cookie is valid', async () => {
    const res = await request(app)
      .get('/api/public/consumer/demo-bistro/auth/me')
      .set('Cookie', 'consumer_auth_token=valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.member.username).toBe('diner1')
    expect(consumerAuthService.verifyConsumerFromCookie).toHaveBeenCalledWith(
      'valid-token',
      'rest-1'
    )
  })

  it('GET /me returns guest-safe payload without valid session', async () => {
    vi.mocked(consumerAuthService.verifyConsumerFromCookie).mockResolvedValue(null)

    const res = await request(app).get('/api/public/consumer/demo-bistro/auth/me')

    expect(res.status).toBe(200)
    expect(res.body.data.member).toBeNull()
    expect(res.body.data.program).toBeNull()
    expect(res.body.data.recentLedger).toEqual([])
  })
})
