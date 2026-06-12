import express from 'express'
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

consumerPublicRoutes.use('/auth', consumerAuthPublicRoutes)
consumerPublicRoutes.use('/loyalty', consumerLoyaltyPublicRoutes)
consumerPublicRoutes.use('/menu', consumerMenuPublicRoutes)
consumerPublicRoutes.use('/orders', consumerOrdersPublicRoutes)
consumerPublicRoutes.use('/fulfillment-options', consumerFulfillmentPublicRoutes)
consumerPublicRoutes.use('/storefront', consumerStorefrontPublicRoutes)
