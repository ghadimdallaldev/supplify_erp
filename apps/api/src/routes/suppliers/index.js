import express from 'express'
import catalogRouter from './catalog.js'
import profileRouter from './profile.js'
import adminRouter from './admin.js'
import brandingRouter from './branding.js'
import manageRouter from './manage.js'
import relationshipsRouter from './relationships.js'

const router = express.Router()

router.use(catalogRouter)
router.use(profileRouter)
router.use(adminRouter)
router.use(brandingRouter)
router.use(manageRouter)
router.use(relationshipsRouter)

export { router as suppliersRoutes }
