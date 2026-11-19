import express from 'express'
import { resolveRestaurantBySlug } from '../../services/consumer-menu.service.js'
import { publicTenantFeatureGate } from '../../lib/tenant-feature-gate.js'
import { consumerMenuPublicRoutes, consumerMenuAdminRoutes } from './menu.routes.js'
import { consumerOrdersPublicRoutes, consumerOrdersAdminRoutes } from './orders.routes.js'
import {
  consumerFulfillmentPublicRoutes,
  consumerFulfillmentAdminRoutes,
} from './fulfillment.routes.js'
import { consumerAuthPublicRoutes } from './auth.routes.js'
import { consumerLoyaltyPublicRoutes } from './loyalty.routes.js'
import { consumerStorefrontPublicRoutes } from './storefront.routes.js'

/** Authenticated restaurant admin routes */
export const consumerRoutes = express.Router()

consumerRoutes.use('/menu', consumerMenuAdminRoutes)
consumerRoutes.use('/orders', consumerOrdersAdminRoutes)
consumerRoutes.use('/fulfillment', consumerFulfillmentAdminRoutes)

/** Public guest-facing routes — mount at /api/public/consumer/:restaurantSlug */
export const consumerPublicRoutes = express.Router({ mergeParams: true })

// Admin kill switch: storefront off for this restaurant → every public consumer route 404s.
consumerPublicRoutes.use(
  publicTenantFeatureGate('consumer_storefront', 'RESTAURANT', async (req) => {
    const restaurant = await resolveRestaurantBySlug(req.params.restaurantSlug)
    return restaurant?.id
  })
)

consumerPublicRoutes.use('/auth', consumerAuthPublicRoutes)
consumerPublicRoutes.use('/loyalty', consumerLoyaltyPublicRoutes)
consumerPublicRoutes.use('/menu', consumerMenuPublicRoutes)
consumerPublicRoutes.use('/orders', consumerOrdersPublicRoutes)
consumerPublicRoutes.use('/fulfillment-options', consumerFulfillmentPublicRoutes)
consumerPublicRoutes.use('/storefront', consumerStorefrontPublicRoutes)
