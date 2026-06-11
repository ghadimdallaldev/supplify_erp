import express from 'express'
import restaurantRouter from './restaurant.js'
import supplierRouter from './supplier.js'

const router = express.Router()

router.use(restaurantRouter)
router.use(supplierRouter)

export { router as promotionsRoutes }
export { loadActivePromotionsForSupplier } from '../../services/promotions.service.js'
