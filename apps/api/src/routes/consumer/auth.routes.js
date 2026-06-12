import express from 'express'
import { z } from 'zod'
import { query } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { resolveRestaurantBySlug } from '../../services/consumer-menu.service.js'
import {
  signupConsumer,
  loginConsumer,
  setConsumerAuthCookie,
  clearConsumerAuthCookie,
} from '../../services/consumer-auth.service.js'
import { getConsumerMemberBalance } from '../../services/loyalty.service.js'
import { optionalAuthConsumer } from '../../middlewares/consumerAuth.js'

function jsonOk(res, data, status = 200) {
  res.status(status).json({ ok: true, data, error: null, requestId: res.req.requestId })
}

function jsonError(res, status, name, message, details) {
  res.status(status).json({
    ok: false,
    data: null,
    error: { name, message, ...(details ? { details } : {}) },
    requestId: res.req.requestId,
  })
}

const signupSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
  displayName: z.string().min(1).max(128).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(32).optional(),
})

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

/** Public routes mounted at /api/public/consumer/:restaurantSlug/auth */
export const consumerAuthPublicRoutes = express.Router({ mergeParams: true })

consumerAuthPublicRoutes.post('/signup', async (req, res) => {
  try {
    const body = signupSchema.parse(req.body)
    const restaurant = await resolveRestaurantBySlug(req.params.restaurantSlug)
    if (!restaurant) {
      return jsonError(res, 404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found')
    }

    const { member, token } = await signupConsumer(restaurant.id, body)
    setConsumerAuthCookie(res, token)
    jsonOk(res, { member }, 201)
  } catch (error) {
    if (error.name === 'ZodError') {
      return jsonError(res, 400, 'VALIDATION_ERROR', 'Invalid signup payload', error.errors)
    }
    if (error.name === 'USERNAME_TAKEN' || error.name === 'EMAIL_TAKEN') {
      return jsonError(res, 409, error.name, error.message)
    }
    if (error.name === 'INVALID_USERNAME' || error.name === 'INVALID_PASSWORD') {
      return jsonError(res, 400, error.name, error.message)
    }
    logger.error('Consumer signup failed', { error: error.message })
    jsonError(res, 500, 'SIGNUP_ERROR', 'Unable to create account')
  }
})

consumerAuthPublicRoutes.post('/login', async (req, res) => {
  try {
    const body = loginSchema.parse(req.body)
    const restaurant = await resolveRestaurantBySlug(req.params.restaurantSlug)
    if (!restaurant) {
      return jsonError(res, 404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found')
    }

    const { member, token } = await loginConsumer(restaurant.id, body)
    setConsumerAuthCookie(res, token)
    jsonOk(res, { member })
  } catch (error) {
    if (error.name === 'ZodError') {
      return jsonError(res, 400, 'VALIDATION_ERROR', 'Invalid login payload', error.errors)
    }
    if (error.name === 'INVALID_CREDENTIALS') {
      return jsonError(res, 401, error.name, error.message)
    }
    logger.error('Consumer login failed', { error: error.message })
    jsonError(res, 500, 'LOGIN_ERROR', 'Unable to sign in')
  }
})

consumerAuthPublicRoutes.post('/logout', (req, res) => {
  clearConsumerAuthCookie(res)
  jsonOk(res, { loggedOut: true })
})

consumerAuthPublicRoutes.get('/me', optionalAuthConsumer, async (req, res) => {
  try {
    if (!req.consumerMember) {
      return jsonOk(res, { member: null, program: null, recentLedger: [], recentOrders: [] })
    }

    const restaurant = await resolveRestaurantBySlug(req.params.restaurantSlug)
    if (!restaurant) {
      return jsonError(res, 404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found')
    }

    const result = await getConsumerMemberBalance(restaurant.id, req.consumerMember.id)
    const { rows: recentOrders } = await query(
      `
      SELECT id, order_number, status, fulfillment_type, total_amount, created_at, receipt_token
      FROM consumer_order
      WHERE restaurant_id = $1 AND consumer_member_id = $2
      ORDER BY created_at DESC
      LIMIT 10
      `,
      [restaurant.id, req.consumerMember.id]
    )
    jsonOk(res, {
      member: req.consumerMember,
      program: result.program,
      recentLedger: result.recentLedger,
      recentOrders,
    })
  } catch (error) {
    logger.error('Consumer me failed', { error: error.message })
    jsonError(res, 500, 'ME_ERROR', 'Unable to load account')
  }
})
