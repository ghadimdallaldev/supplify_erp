import express from 'express'
import catalogRouter from './catalog.js'
import profileRouter from './profile.js'
import adminRouter from './admin.js'
import brandingRouter from './branding.js'
import manageRouter from './manage.js'
import relationshipsRouter from './relationships.js'

const router = express.Router()

router.use(catalogRouter)
// relationships (/followed, /:id/follow) before profile (/:id) — literal paths must win
router.use(relationshipsRouter)
router.use(profileRouter)
router.use(adminRouter)
router.use(brandingRouter)
router.use(manageRouter)

export { router as suppliersRoutes }
