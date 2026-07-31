import express from 'express'
import { z } from 'zod'
import { requireAuth } from '../lib/rbac.js'
import { completeTenantRegistration, userNeedsTenantSetup } from '../lib/register-account.js'
import { logger } from '../lib/logger.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { isUniqueViolation } from '../lib/identity-normalize.js'
import { config } from '../config/env.js'

const router = express.Router()

const legalAcceptanceSchema = z.object({
  packVersion: z.string().min(1).max(32),
  acceptedDocuments: z.array(z.string().min(1).max(80)).min(1),
  electronicSignatureAttestation: z.literal(true),
})

const completeSchema = z.object({
  accountType: z.enum(['RESTAURANT', 'SUPPLIER']),
  businessName: z.string().min(2).max(200),
  phone: z.string().max(30).optional(),
  referralToken: z.string().max(200).optional(),
  legalAcceptance: legalAcceptanceSchema,
})

router.get('/status', requireAuth, async (req, res) => {
  try {
    const needsSetup = await userNeedsTenantSetup(req.userData)
    res.json({
      ok: true,
      data: { needsSetup },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Register status error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to check registration status' },
      requestId: req.requestId,
    })
  }
})

router.post('/complete', requireAuth, async (req, res) => {
  try {
    const body = completeSchema.parse(req.body)
    const user = req.userData
    if (config.AUTH_EMAIL_OTP_ENABLED && req.user?.email_verified !== true) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'EMAIL_NOT_VERIFIED',
          message: 'Verify your email before completing registration',
        },
        requestId: req.requestId,
      })
    }

    const needsSetup = await userNeedsTenantSetup(user)
    if (!needsSetup) {
      return res.status(409).json({
        ok: false,
        data: null,
        error: { name: 'CONFLICT', message: 'Organization profile is already set up' },
        requestId: req.requestId,
      })
    }

    const { tenant, tenantType } = await completeTenantRegistration({
      userId: user.id,
      keycloakSub: user.keycloak_sub,
      email: user.email,
      accountType: body.accountType,
      businessName: body.businessName,
      phone: body.phone,
      referralToken: body.referralToken,
      legalAcceptance: body.legalAcceptance,
      ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
      userAgent: req.headers['user-agent'],
    })

    logger.info('Tenant registration completed', {
      userId: user.id,
      tenantType,
      tenantId: tenant.id,
    })

    res.status(201).json({
      ok: true,
      data: {
        tenantType,
        tenant,
      },
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
          message: 'Invalid registration data',
          details: error.errors,
        },
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
    if (isUniqueViolation(error)) {
      return res.status(409).json({
        ok: false,
        data: null,
        error: { name: 'IDENTITY_CONFLICT', message: 'An account with this email already exists' },
        requestId: req.requestId,
      })
    }
    if (error.name === 'ConflictError') {
      return res.status(409).json({
        ok: false,
        data: null,
        error: { name: 'CONFLICT', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Register complete error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to complete registration' },
      requestId: req.requestId,
    })
  }
})

export { router as registerRoutes }
