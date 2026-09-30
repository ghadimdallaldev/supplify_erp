import express from 'express'
import { z } from 'zod'
import { requireAuth } from '../lib/rbac.js'
import {
  closeOrganization,
  deletePersonalAccount,
  getDeletionStatus,
  OWNER_BLOCKER_CODE,
  transferOrganizationOwnership,
} from '../services/account-deletion.service.js'

export const accountRoutes = express.Router()

accountRoutes.use(requireAuth)

function ok(req, res, data, status = 200) {
  res.status(status).json({ ok: true, data, error: null, requestId: req.requestId })
}

accountRoutes.get('/deletion-status', async (req, res, next) => {
  try {
    const status = await getDeletionStatus(req.userData.id)
    ok(req, res, status)
  } catch (err) {
    next(err)
  }
})

accountRoutes.post('/transfer-ownership', async (req, res, next) => {
  try {
    const body = z
      .object({
        organizationId: z.string().uuid(),
        workspaceType: z.enum(['SUPPLIER', 'RESTAURANT']),
        newOwnerUserId: z.string().uuid(),
      })
      .parse(req.body)
    const result = await transferOrganizationOwnership({
      requesterId: req.userData.id,
      ...body,
    })
    ok(req, res, result)
  } catch (err) {
    next(err)
  }
})

accountRoutes.post('/close-organization', async (req, res, next) => {
  try {
    const body = z
      .object({
        organizationId: z.string().uuid(),
        workspaceType: z.enum(['SUPPLIER', 'RESTAURANT']),
        confirmationName: z.string().min(1).max(255),
        reason: z.string().max(500).nullable().optional(),
      })
      .parse(req.body)
    const result = await closeOrganization({
      requesterId: req.userData.id,
      organizationId: body.organizationId,
      workspaceType: body.workspaceType,
      confirmationName: body.confirmationName,
      reason: body.reason ?? null,
    })
    ok(req, res, result)
  } catch (err) {
    next(err)
  }
})

accountRoutes.delete('/', async (req, res, next) => {
  try {
    const body = z
      .object({
        confirmation: z.literal('DELETE'),
        reason: z.string().max(500).optional(),
      })
      .parse(req.body ?? {})
    const result = await deletePersonalAccount(req.userData.id, { reason: body.reason })
    ok(req, res, result)
  } catch (err) {
    if (err.code === OWNER_BLOCKER_CODE) {
      return res.status(409).json({
        ok: false,
        data: null,
        error: {
          name: OWNER_BLOCKER_CODE,
          message: err.message,
          details: err.details || null,
        },
        requestId: req.requestId,
      })
    }
    next(err)
  }
})
