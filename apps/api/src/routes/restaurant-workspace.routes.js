import express from 'express'
import { requireAuth, requireRole, resolveTenantContext } from '../lib/rbac.js'
import { getRestaurantIdForRequest } from '../lib/tenant-resolve.js'
import { withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { isSupplifyV2 } from '../config/supplifyModel.js'
import {
  getRestaurantWorkspaceMode,
  WORKSPACE_MODE_FULL,
  WORKSPACE_MODE_BUYER_ONLY,
} from '../lib/restaurant-workspace.js'
import { createPendingActivationSubscription } from '../lib/billing/subscription-activation.js'

const router = express.Router()

router.use(requireAuth, requireRole(['RESTAURANT']), resolveTenantContext)

router.get('/workspace', async (req, res) => {
  try {
    const restaurantId = await getRestaurantIdForRequest(req)
    const mode = await getRestaurantWorkspaceMode(restaurantId)
    res.json({
      ok: true,
      data: {
        workspaceMode: mode,
        supplifyModelVersion: isSupplifyV2() ? 'v2' : 'v1',
        canUpgrade: isSupplifyV2() && mode === WORKSPACE_MODE_BUYER_ONLY,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get restaurant workspace error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get workspace info' },
      requestId: req.requestId,
    })
  }
})

router.post('/upgrade-workspace', async (req, res) => {
  try {
    if (!isSupplifyV2()) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'V2_REQUIRED', message: 'Workspace upgrade is only used in Supplify V2' },
        requestId: req.requestId,
      })
    }

    const restaurantId = await getRestaurantIdForRequest(req)
    const mode = await getRestaurantWorkspaceMode(restaurantId)
    if (mode !== WORKSPACE_MODE_BUYER_ONLY) {
      return res.json({
        ok: true,
        data: { workspaceMode: WORKSPACE_MODE_FULL, alreadyFull: true },
        error: null,
        requestId: req.requestId,
      })
    }

    await withTransaction(async (client) => {
      await client.query(
        `
        UPDATE restaurant
        SET workspace_mode = $1,
            workspace_upgraded_at = COALESCE(workspace_upgraded_at, NOW()),
            updated_at = NOW()
        WHERE id = $2
        `,
        [WORKSPACE_MODE_FULL, restaurantId]
      )

      const { rows: subRows } = await client.query(
        `
        SELECT s.id, p.code
        FROM subscription s
        JOIN subscription_plan p ON p.id = s.plan_id
        WHERE s.tenant_id = $1 AND s.tenant_type = 'RESTAURANT'
        ORDER BY s.created_at DESC
        LIMIT 1
        `,
        [restaurantId]
      )
      const planCode = (subRows[0]?.code || '').toLowerCase()
      if (planCode === 'buyer_free') {
        await createPendingActivationSubscription(client, restaurantId, 'RESTAURANT', 'free')
      }
    })

    res.json({
      ok: true,
      data: {
        workspaceMode: WORKSPACE_MODE_FULL,
        upgraded: true,
        message:
          'Upgraded to full restaurant workspace. Activate or choose a paid plan for operational features.',
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Upgrade restaurant workspace error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to upgrade workspace' },
      requestId: req.requestId,
    })
  }
})

export default router
