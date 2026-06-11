import express from 'express'
import supportRouter from './support.js'
import adminRouter from './admin.js'
import conversationsRouter from './conversations.js'

const router = express.Router()

router.use(supportRouter)
router.use(adminRouter)
router.use(conversationsRouter)

export { router as chatRoutes }
