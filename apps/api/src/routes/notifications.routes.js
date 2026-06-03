import express from 'express'
import { requireAuth, resolveTenantContext } from '../lib/rbac.js'
import { notificationsMutationGuard } from '../lib/route-permissions.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { config } from '../config/env.js'
import { NotFoundError } from '../middlewares/errorHandler.js'
import { z } from 'zod'
import {
  ensureNotificationPreferences,
  invalidateNotificationPreferencesCache,
  getUserNotifications,
  getUserPreferences,
  sendNotification,
} from '../services/notification.service.js'

const router = express.Router()

router.use(requireAuth, resolveTenantContext, notificationsMutationGuard)

// Validation schemas
const updatePreferencesSchema = z.object({
  // Channels
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),

  // Notification types
  notifyOrderNew: z.boolean().optional(),
  notifyOrderAcknowledged: z.boolean().optional(),
  notifyOrderProcessing: z.boolean().optional(),
  notifyOrderShipped: z.boolean().optional(),
  notifyOrderDelivered: z.boolean().optional(),
  notifyOrderCancelled: z.boolean().optional(),
  notifyMessageReceived: z.boolean().optional(),
  notifyInvoiceIssued: z.boolean().optional(),
  notifyInvoiceOverdue: z.boolean().optional(),
  notifyPaymentReceived: z.boolean().optional(),
  notifyLowStock: z.boolean().optional(),
  notifyOutOfStock: z.boolean().optional(),
  notifySystemUpdates: z.boolean().optional(),
  notifyPromotions: z.boolean().optional(),
  notifyReservationCreated: z.boolean().optional(),
  notifyReservationWaitlist: z.boolean().optional(),
  notifyStaffPto: z.boolean().optional(),
  notifyStaffSwap: z.boolean().optional(),
  notifyStaffClock: z.boolean().optional(),
  notifyStaffAnnouncement: z.boolean().optional(),
  notifyStaffDocument: z.boolean().optional(),
  notifyScheduledOrder: z.boolean().optional(),
})

// Get user's notifications
router.get('/', async (req, res) => {
  try {
    const userId = req.userData.id
    const userType = req.userData.role
    const { limit = '50', offset = '0', unreadOnly = 'false' } = req.query

    const result = await getUserNotifications(userId, userType, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      unreadOnly: unreadOnly === 'true',
    })

    res.json({
      ok: true,
      data: result,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Get notifications error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get notifications',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Get notification preferences
router.get('/preferences', async (req, res) => {
  try {
    const userId = req.userData.id
    const userType = req.userData.role

    const prefs = await getUserPreferences(userId, userType)

    res.json({
      ok: true,
      data: { preferences: prefs },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Get preferences error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get preferences',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Update notification preferences
router.patch('/preferences', async (req, res) => {
  try {
    const userId = req.userData.id
    const userType = req.userData.role
    const updateData = updatePreferencesSchema.parse(req.body)

    await ensureNotificationPreferences(userId, userType)

    // Build update query dynamically
    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    Object.entries(updateData).forEach(([key, value]) => {
      // Convert camelCase to snake_case for database
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      updateFields.push(`${dbKey} = $${paramIndex++}`)
      updateValues.push(value)
    })

    if (updateFields.length === 0) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'No fields to update' },
        requestId: req.requestId,
      })
    }

    updateFields.push('updated_at = now()')
    updateValues.push(userId, userType)

    const { rowCount } = await query(
      `
      UPDATE notification_preferences
      SET ${updateFields.join(', ')}
      WHERE user_id = $${paramIndex} AND user_type = $${paramIndex + 1}
      RETURNING *
    `,
      updateValues
    )

    if (rowCount === 0) {
      throw new NotFoundError('Notification preferences not found')
    }

    await invalidateNotificationPreferencesCache(userId, userType)
    const prefs = await getUserPreferences(userId, userType)

    res.json({
      ok: true,
      data: { preferences: prefs },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid preferences data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error({
      message: 'Update preferences error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update preferences',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Mark notification as read
router.post('/:id/read', async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.userData.id

    await query(
      `
      UPDATE notification_log
      SET is_read = true, read_at = now()
      WHERE id = $1 AND user_id = $2
    `,
      [id, userId]
    )

    res.json({
      ok: true,
      data: { id },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Mark read error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to mark notification as read',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Mark all notifications as read
router.post('/read-all', async (req, res) => {
  try {
    const userId = req.userData.id
    const userType = req.userData.role

    const { rowCount } = await query(
      `
      UPDATE notification_log
      SET is_read = true, read_at = now()
      WHERE user_id = $1 AND user_type = $2 AND is_read = false
    `,
      [userId, userType]
    )

    res.json({
      ok: true,
      data: { markedRead: rowCount },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Mark all read error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to mark all as read',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Test notification endpoint (dev/debug only)
router.post('/test', async (req, res) => {
  if (!config.ENABLE_DEBUG_ROUTES) {
    return res.status(404).json({ ok: false, error: { name: 'NOT_FOUND', message: 'Not found' } })
  }
  try {
    const {
      title,
      message,
      notificationType = 'TEST',
      notificationCategory = 'test',
      emailTo,
    } = req.body

    if (emailTo) {
      const { sendTemplateEmail } = await import('../services/email/email.service.js')
      const emailResult = await sendTemplateEmail({
        to: emailTo,
        template: 'auth.test',
        subject: title || 'Supplify email test',
        data: { message: message || 'Test email from Supplify' },
        eventType: 'test',
        eventKey: `test:${emailTo}:${Date.now()}`,
        skipDedup: true,
      })
      return res.json({
        ok: true,
        data: { emailResult },
        error: null,
        requestId: req.requestId,
      })
    }

    const notification = await sendNotification({
      userId: req.userData.id,
      userType: req.userData.role,
      notificationType,
      notificationCategory,
      title,
      message,
      metadata: { test: true },
    })

    res.json({
      ok: true,
      data: { notification },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Test notification error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to send test notification',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

export { router as notificationsRoutes }
