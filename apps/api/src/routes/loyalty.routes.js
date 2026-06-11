import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getSupplierIdForRequest,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import {
  getSupplierLoyaltyProgram,
  upsertSupplierLoyaltyProgram,
  getRestaurantLoyaltyBalance,
  listRestaurantLoyaltyBalances,
  listSupplierLoyaltyBalances,
  getLoyaltyLedger,
  validateLoyaltyRedeem,
  getConsumerLoyaltyProgram,
  upsertConsumerLoyaltyProgram,
  getConsumerMemberBalance,
} from '../services/loyalty.service.js'

const router = express.Router()

router.use(requireAuth, resolveTenantContext)

const supplierProgramSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  earnPointsPerCurrency: z.number().nonnegative().optional(),
  redeemCurrencyPerPoint: z.number().nonnegative().optional(),
  minRedeemPoints: z.number().int().nonnegative().optional(),
  maxRedeemPercent: z.number().min(0).max(100).optional(),
  rulesJson: z.record(z.unknown()).optional(),
})

const consumerProgramSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  earnPointsPerCurrency: z.number().nonnegative().optional(),
  redeemCurrencyPerPoint: z.number().nonnegative().optional(),
  minRedeemPoints: z.number().int().nonnegative().optional(),
  welcomeBonusPoints: z.number().int().nonnegative().optional(),
  maxRedeemPercent: z.number().min(0).max(100).optional(),
  rulesJson: z
    .object({
      fulfillment_multipliers: z
        .object({
          pickup: z.number().positive().optional(),
          delivery: z.number().positive().optional(),
          dine_in: z.number().positive().optional(),
        })
        .optional(),
    })
    .passthrough()
    .optional(),
})

const redeemPreviewSchema = z.object({
  supplierId: z.string().uuid(),
  pointsToRedeem: z.number().int().positive(),
  orderSubtotal: z.number().nonnegative(),
})

async function resolveSupplierId(req) {
  const fromContext = await getSupplierIdForRequest(req)
  if (fromContext) return fromContext
  if (req.tenantContext?.tenantType === 'SUPPLIER') return req.tenantContext.tenantId
  return null
}

async function resolveRestaurantId(req) {
  const fromContext = await getRestaurantIdForRequest(req)
  if (fromContext) return fromContext
  if (req.tenantContext?.tenantType === 'RESTAURANT') return req.tenantContext.tenantId
  return null
}

// ---------------------------------------------------------------------------
// D1: Supplier program CRUD
// ---------------------------------------------------------------------------

router.get(
  '/supplier/program',
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('CATALOG_VIEW'),
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
      const program = await getSupplierLoyaltyProgram(supplierId)
      res.json({
        ok: true,
        data: { program },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get supplier loyalty program error', { error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to load loyalty program' },
        requestId: req.requestId,
      })
    }
  }
)

router.put(
  '/supplier/program',
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('CATALOG_MANAGE'),
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
      const payload = supplierProgramSchema.parse(req.body)
      const program = await upsertSupplierLoyaltyProgram(supplierId, payload)
      res.json({
        ok: true,
        data: { program },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.errors[0]?.message },
          requestId: req.requestId,
        })
      }
      logger.error('Upsert supplier loyalty program error', { error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to save loyalty program' },
        requestId: req.requestId,
      })
    }
  }
)

router.get(
  '/supplier/balances',
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('ORDERS_VIEW'),
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
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
      const balances = await listSupplierLoyaltyBalances(supplierId, { limit, offset })
      res.json({
        ok: true,
        data: { balances },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('List supplier loyalty balances error', { error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to list balances' },
        requestId: req.requestId,
      })
    }
  }
)

router.get(
  '/supplier/balances/:restaurantId/ledger',
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('ORDERS_VIEW'),
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
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
      const ledger = await getLoyaltyLedger(supplierId, req.params.restaurantId, { limit, offset })
      res.json({
        ok: true,
        data: { ledger },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get supplier loyalty ledger error', { error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to load ledger' },
        requestId: req.requestId,
      })
    }
  }
)

// ---------------------------------------------------------------------------
// D1: Restaurant balance + checkout redeem preview
// ---------------------------------------------------------------------------

router.get(
  '/restaurant/balances',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('ORDERS_VIEW'),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      const balances = await listRestaurantLoyaltyBalances(restaurantId)
      res.json({
        ok: true,
        data: { balances },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('List restaurant loyalty balances error', { error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to list balances' },
        requestId: req.requestId,
      })
    }
  }
)

router.get(
  '/restaurant/balance/:supplierId',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('ORDERS_VIEW'),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      const result = await getRestaurantLoyaltyBalance(req.params.supplierId, restaurantId)
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100)
      const ledger = await getLoyaltyLedger(req.params.supplierId, restaurantId, { limit })
      res.json({
        ok: true,
        data: { ...result, ledger },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get restaurant loyalty balance error', { error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to load balance' },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/restaurant/redeem-preview',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('ORDERS_CREATE'),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      const payload = redeemPreviewSchema.parse(req.body)
      const preview = await validateLoyaltyRedeem({
        supplierId: payload.supplierId,
        restaurantId,
        pointsToRedeem: payload.pointsToRedeem,
        orderSubtotal: payload.orderSubtotal,
      })
      res.json({
        ok: true,
        data: { preview },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.errors[0]?.message },
          requestId: req.requestId,
        })
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.message },
          requestId: req.requestId,
        })
      }
      logger.error('Loyalty redeem preview error', { error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to preview redemption' },
        requestId: req.requestId,
      })
    }
  }
)

// ---------------------------------------------------------------------------
// D2: Consumer loyalty program + member balance
// ---------------------------------------------------------------------------

router.get(
  '/consumer/program',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('CATALOG_VIEW'),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      const program = await getConsumerLoyaltyProgram(restaurantId)
      res.json({
        ok: true,
        data: { program },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get consumer loyalty program error', { error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to load consumer loyalty program' },
        requestId: req.requestId,
      })
    }
  }
)

router.put(
  '/consumer/program',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('CATALOG_MANAGE'),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      const payload = consumerProgramSchema.parse(req.body)
      const program = await upsertConsumerLoyaltyProgram(restaurantId, payload)
      res.json({
        ok: true,
        data: { program },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.errors[0]?.message },
          requestId: req.requestId,
        })
      }
      logger.error('Upsert consumer loyalty program error', { error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to save consumer loyalty program' },
        requestId: req.requestId,
      })
    }
  }
)

router.get(
  '/consumer/members/:memberId/balance',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('ORDERS_VIEW'),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      const result = await getConsumerMemberBalance(restaurantId, req.params.memberId)
      res.json({
        ok: true,
        data: result,
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      logger.error('Get consumer member balance error', { error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to load member balance' },
        requestId: req.requestId,
      })
    }
  }
)

export { router as loyaltyRoutes }
