import { resolveRestaurantBySlug } from '../services/consumer-menu.service.js'
import {
  getConsumerAuthCookieName,
  verifyConsumerFromCookie,
} from '../services/consumer-auth.service.js'

/**
 * Attach req.consumerMember when a valid consumer JWT cookie is present for this restaurant.
 * Does not fail when unauthenticated — use requireAuthConsumer for protected routes.
 */
export async function optionalAuthConsumer(req, res, next) {
  try {
    const token = req.cookies?.[getConsumerAuthCookieName()]
    if (!token) {
      req.consumerMember = null
      return next()
    }

    const restaurant = await resolveRestaurantBySlug(req.params.restaurantSlug)
    if (!restaurant) {
      req.consumerMember = null
      return next()
    }

    req.consumerMember = await verifyConsumerFromCookie(token, restaurant.id)
    next()
  } catch {
    req.consumerMember = null
    next()
  }
}

/** Require a valid consumer session scoped to the restaurant slug on the route. */
export async function requireAuthConsumer(req, res, next) {
  await optionalAuthConsumer(req, res, () => {
    if (!req.consumerMember) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'UNAUTHORIZED', message: 'Consumer authentication required' },
        requestId: req.requestId,
      })
    }
    next()
  })
}
