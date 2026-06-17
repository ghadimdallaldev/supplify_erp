import express from 'express'
import { z } from 'zod'
import { requirePermission } from '../../lib/rbac.js'
import { logger } from '../../lib/logger.js'
import { resolveSupplierId } from './fulfillment.helpers.js'
import {
  generateWave,
  listWaves,
  getWave,
  updatePickListItem,
  completeWave,
} from '../../services/pick-lists.service.js'

const router = express.Router()

const generateBodySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  warehouse_id: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  order_ids: z.array(z.string().uuid()).optional(),
  orderIds: z.array(z.string().uuid()).optional(),
})

const updateItemBodySchema = z.object({
  quantity_picked: z.coerce.number().optional(),
  quantityPicked: z.coerce.number().optional(),
  notes: z.string().max(2000).optional().nullable(),
})

router.post('/waves/generate', requirePermission('FULFILLMENT_MANAGE'), async (req, res) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }

    const body = generateBodySchema.parse(req.body ?? {})
    const wave = await generateWave(supplierId, {
      date: body.date,
      warehouseId: body.warehouseId ?? body.warehouse_id,
      orderIds: body.orderIds ?? body.order_ids,
    })

    res.status(201).json({
      ok: true,
      data: { wave },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid request body' },
        requestId: req.requestId,
      })
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Generate pick wave error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to generate pick wave' },
      requestId: req.requestId,
    })
  }
})

router.get('/waves', async (req, res) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }

    const date =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : undefined
    const waves = await listWaves(supplierId, date)

    res.json({
      ok: true,
      data: { waves },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('List pick waves error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load pick waves' },
      requestId: req.requestId,
    })
  }
})

router.get('/waves/:id', async (req, res) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }

    const wave = await getWave(req.params.id, supplierId)

    res.json({
      ok: true,
      data: { wave },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Wave not found' },
        requestId: req.requestId,
      })
    }
    logger.error('Get pick wave error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load pick wave' },
      requestId: req.requestId,
    })
  }
})

router.patch(
  '/pick-lists/:id/items/:itemId',
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }

      const body = updateItemBodySchema.parse(req.body ?? {})
      const item = await updatePickListItem(supplierId, req.params.id, req.params.itemId, {
        quantityPicked: body.quantityPicked ?? body.quantity_picked,
        notes: body.notes,
      })

      res.json({
        ok: true,
        data: { item },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Invalid request body' },
          requestId: req.requestId,
        })
      }
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.message },
          requestId: req.requestId,
        })
      }
      if (error.name === 'NotFoundError') {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      logger.error('Update pick list item error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to update pick list item' },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/waves/:id/complete-picking',
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }

      const wave = await completeWave(req.params.id, supplierId)

      res.json({
        ok: true,
        data: { wave },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.message },
          requestId: req.requestId,
        })
      }
      if (error.name === 'NotFoundError') {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Wave not found' },
          requestId: req.requestId,
        })
      }
      logger.error('Complete pick wave error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to complete pick wave' },
        requestId: req.requestId,
      })
    }
  }
)

export default router
