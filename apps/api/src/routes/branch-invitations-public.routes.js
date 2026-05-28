import express from 'express'
import { optionalAuth } from '../lib/rbac.js'
import { completeInviteAcceptSession } from '../lib/invite-login.js'
import { logger } from '../lib/logger.js'
import {
  acceptBranchInvitation,
  evaluateInvitationPublicState,
  getInvitationByToken,
} from '../lib/branch-invitations.js'
import {
  acceptRestaurantMemberInvitation,
  acceptRestaurantBranchInvitation,
  getRestaurantInvitationByToken,
} from '../lib/restaurant-invitations.js'
import { evaluateInvitationState, normalizeInviteType } from '../services/invitationTokens.js'
import { createActiveTenantToken, getActiveTenantCookieName } from '../lib/tenant-switch.js'
import { config } from '../config/env.js'
import { query } from '../lib/db.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { WorkspaceMembershipError } from '../lib/workspace-membership.js'
import { resolveInvitationAcceptIdentity } from '../lib/invitation-accept.js'
import { recordInviteLegalAcceptances } from '../lib/legal-acceptance.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const token = req.query.token
    const type = normalizeInviteType(req.query.type)
    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        ok: false,
        data: { valid: false, reason: 'invalid' },
        error: { name: 'VALIDATION_ERROR', message: 'token is required' },
        requestId: req.requestId,
      })
    }
    if (!type) {
      return res.status(400).json({
        ok: false,
        data: { valid: false, reason: 'invalid' },
        error: { name: 'VALIDATION_ERROR', message: 'type is required' },
        requestId: req.requestId,
      })
    }

    if (type === 'supplier_branch') {
      const invitation = await getInvitationByToken(token)
      const state = evaluateInvitationPublicState(invitation)
      return res.json({ ok: true, data: state, error: null, requestId: req.requestId })
    }

    const invitation = await getRestaurantInvitationByToken(token)
    const state = evaluateInvitationState(invitation)
    if (state.valid && type === 'restaurant_member') {
      return res.json({
        ok: true,
        data: {
          valid: true,
          restaurant_name: state.restaurant_name,
          invited_name: state.invited_name,
          role_name: state.role_name,
          invited_email: state.invited_email,
          expires_at: state.expires_at,
        },
        error: null,
        requestId: req.requestId,
      })
    }
    if (state.valid && type === 'restaurant_branch') {
      return res.json({
        ok: true,
        data: {
          valid: true,
          restaurant_name: state.restaurant_name,
          org_name: state.org_name,
          invited_name: state.invited_name,
          role_name: state.role_name,
          invited_email: state.invited_email,
          expires_at: state.expires_at,
        },
        error: null,
        requestId: req.requestId,
      })
    }
    if (
      invitation &&
      ((type === 'restaurant_member' && invitation.invitation_type !== 'member') ||
        (type === 'restaurant_branch' && invitation.invitation_type !== 'branch_manager'))
    ) {
      return res.json({
        ok: true,
        data: { valid: false, reason: 'invalid' },
        error: null,
        requestId: req.requestId,
      })
    }
    return res.json({ ok: true, data: state, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET public invitation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to validate invitation' },
      requestId: req.requestId,
    })
  }
})

function isKeycloakSetupError(error) {
  const msg = error?.message || ''
  return msg.includes('KEYCLOAK_ADMIN_PASSWORD') || msg.includes('Keycloak admin token failed')
}

function invitationAcceptErrorStatus(error) {
  if (error.code === 'expired') return 410
  if (error instanceof WorkspaceMembershipError) return 409
  if (isKeycloakSetupError(error)) return 503
  if (error instanceof ValidationError || error.code === 'email_mismatch') return 400
  return 400
}

function invitationAcceptErrorName(error) {
  if (error.code === 'expired') return 'INVITATION_EXPIRED'
  if (error instanceof WorkspaceMembershipError) return 'WORKSPACE_MEMBERSHIP_CONFLICT'
  if (error.code === 'email_mismatch') return 'INVITATION_EMAIL_MISMATCH'
  if (error.code === 'already_used') return 'INVITATION_ALREADY_USED'
  if (isKeycloakSetupError(error)) return 'KEYCLOAK_NOT_CONFIGURED'
  return 'INVITATION_INVALID'
}

router.post('/accept', optionalAuth, async (req, res) => {
  try {
    const { token, type: rawType, full_name: fullName, password, email, legalAcceptance } = req.body
    const type = normalizeInviteType(rawType)
    if (!token || !type) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'token and type are required' },
        requestId: req.requestId,
      })
    }

    const { existingUserId, existingUserEmail } = resolveInvitationAcceptIdentity(req.userData, {
      email,
      password,
    })
    if (!existingUserId && !password) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'password is required' },
        requestId: req.requestId,
      })
    }
    if (!legalAcceptance?.electronicSignatureAttestation) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'You must accept the legal agreements to continue',
        },
        requestId: req.requestId,
      })
    }

    const acceptMeta = {
      legalAcceptance,
      ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
      userAgent: req.headers['user-agent'],
    }

    const acceptEmail = existingUserId ? existingUserEmail : email

    if (type === 'supplier_branch') {
      return handleSupplierBranchAccept(req, res, {
        token,
        fullName,
        email: acceptEmail,
        password,
        existingUserId,
        existingUserEmail,
        ...acceptMeta,
      })
    }

    let result
    try {
      if (type === 'restaurant_member') {
        result = await acceptRestaurantMemberInvitation({
          token,
          fullName,
          email: acceptEmail,
          password,
          existingUserId,
          existingUserEmail,
        })
      } else {
        result = await acceptRestaurantBranchInvitation({
          token,
          fullName,
          email: acceptEmail,
          password,
          existingUserId,
          existingUserEmail,
        })
      }
    } catch (error) {
      const status = invitationAcceptErrorStatus(error)
      return res.status(status).json({
        ok: false,
        data: null,
        error: {
          name: invitationAcceptErrorName(error),
          message: error.message,
        },
        requestId: req.requestId,
      })
    }

    const { rows: branchRows } = await query(`SELECT name FROM restaurant WHERE id = $1`, [
      result.restaurantId,
    ])
    const tenantName = branchRows[0]?.name || 'Branch'

    const tenantToken = await createActiveTenantToken({
      userId: result.userId,
      tenantId: result.restaurantId,
      tenantType: 'RESTAURANT',
      tenantName,
    })

    res.cookie(getActiveTenantCookieName(), tenantToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    })

    const login = await completeInviteAcceptSession(res, { result, fullName, req })
    try {
      await recordInviteLegalAcceptances({
        userId: result.userId,
        acceptedDocuments: legalAcceptance.acceptedDocuments,
        electronicSignatureAttestation: legalAcceptance.electronicSignatureAttestation,
        packVersion: legalAcceptance.packVersion,
        ipAddress: acceptMeta.ipAddress,
        userAgent: acceptMeta.userAgent,
      })
    } catch (legalErr) {
      logger.warn('Invite legal acceptance not recorded', { error: legalErr.message })
    }
    return res.json({
      ok: true,
      data: {
        user: login.user,
        activeRestaurantId: result.restaurantId,
        needsManualLogin: login.needsManualLogin || undefined,
        loginMessage: login.loginMessage,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST public invitation accept error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: error.message || 'Failed to accept invitation' },
      requestId: req.requestId,
    })
  }
})

async function handleSupplierBranchAccept(
  req,
  res,
  {
    token,
    fullName,
    email,
    password,
    existingUserId,
    existingUserEmail,
    legalAcceptance,
    ipAddress,
    userAgent,
  }
) {
  let result
  try {
    result = await acceptBranchInvitation({
      token,
      fullName,
      email,
      password,
      existingUserId,
      existingUserEmail,
    })
  } catch (error) {
    const status = invitationAcceptErrorStatus(error)
    return res.status(status).json({
      ok: false,
      data: null,
      error: {
        name: invitationAcceptErrorName(error),
        message: error.message,
      },
      requestId: req.requestId,
    })
  }

  const { rows: branchRows } = await query(`SELECT name FROM supplier WHERE id = $1`, [
    result.supplierId,
  ])
  const tenantName = branchRows[0]?.name || 'Branch'

  const tenantToken = await createActiveTenantToken({
    userId: result.userId,
    tenantId: result.supplierId,
    tenantType: 'SUPPLIER',
    tenantName,
  })

  res.cookie(getActiveTenantCookieName(), tenantToken, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  })

  const login = await completeInviteAcceptSession(res, { result, fullName, req })
  try {
    await recordInviteLegalAcceptances({
      userId: result.userId,
      acceptedDocuments: legalAcceptance.acceptedDocuments,
      electronicSignatureAttestation: legalAcceptance.electronicSignatureAttestation,
      packVersion: legalAcceptance.packVersion,
      ipAddress,
      userAgent,
    })
  } catch (legalErr) {
    logger.warn('Supplier invite legal acceptance not recorded', { error: legalErr.message })
  }
  return res.json({
    ok: true,
    data: {
      user: login.user,
      activeSupplierId: result.supplierId,
      needsManualLogin: login.needsManualLogin || undefined,
      loginMessage: login.loginMessage,
    },
    error: null,
    requestId: req.requestId,
  })
}

router.get('/branch', async (req, res) => {
  try {
    const token = req.query.token
    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        ok: false,
        data: { valid: false, reason: 'invalid' },
        error: { name: 'VALIDATION_ERROR', message: 'token is required' },
        requestId: req.requestId,
      })
    }

    const invitation = await getInvitationByToken(token)
    const state = evaluateInvitationPublicState(invitation)
    res.json({
      ok: true,
      data: state,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('GET public branch invitation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to validate invitation' },
      requestId: req.requestId,
    })
  }
})

router.post('/branch/accept', optionalAuth, async (req, res) => {
  try {
    const { token, full_name: fullName, password, email, legalAcceptance } = req.body
    if (!token) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'token is required' },
        requestId: req.requestId,
      })
    }

    const { existingUserId, existingUserEmail } = resolveInvitationAcceptIdentity(req.userData, {
      email,
      password,
    })
    if (!existingUserId && !password) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'password is required' },
        requestId: req.requestId,
      })
    }
    if (!legalAcceptance?.electronicSignatureAttestation) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'You must accept the legal agreements to continue',
        },
        requestId: req.requestId,
      })
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    const userAgent = req.headers['user-agent']

    let result
    try {
      result = await acceptBranchInvitation({
        token,
        fullName,
        email: existingUserId ? existingUserEmail : email,
        password,
        existingUserId,
        existingUserEmail,
      })
    } catch (error) {
      const status = invitationAcceptErrorStatus(error)
      return res.status(status).json({
        ok: false,
        data: null,
        error: {
          name: invitationAcceptErrorName(error),
          message: error.message,
        },
        requestId: req.requestId,
      })
    }

    const { rows: branchRows } = await query(`SELECT name FROM supplier WHERE id = $1`, [
      result.supplierId,
    ])
    const tenantName = branchRows[0]?.name || 'Branch'

    const tenantToken = await createActiveTenantToken({
      userId: result.userId,
      tenantId: result.supplierId,
      tenantType: 'SUPPLIER',
      tenantName,
    })

    res.cookie(getActiveTenantCookieName(), tenantToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    })

    const login = await completeInviteAcceptSession(res, { result, fullName, req })
    try {
      await recordInviteLegalAcceptances({
        userId: result.userId,
        acceptedDocuments: legalAcceptance.acceptedDocuments,
        electronicSignatureAttestation: legalAcceptance.electronicSignatureAttestation,
        packVersion: legalAcceptance.packVersion,
        ipAddress,
        userAgent,
      })
    } catch (legalErr) {
      logger.warn('Branch invite legal acceptance not recorded', { error: legalErr.message })
    }
    res.json({
      ok: true,
      data: {
        user: login.user,
        activeSupplierId: result.supplierId,
        needsManualLogin: login.needsManualLogin || undefined,
        loginMessage: login.loginMessage,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST public branch invitation accept error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: error.message || 'Failed to accept invitation' },
      requestId: req.requestId,
    })
  }
})

export default router
