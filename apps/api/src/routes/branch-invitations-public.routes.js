import express from 'express'
import { optionalAuth } from '../lib/rbac.js'
import { setAuthCookies } from '../lib/rbac.js'
import { exchangePasswordForTokens, getUserInfo } from '../lib/auth.js'
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

router.post('/accept', optionalAuth, async (req, res) => {
  try {
    const {
      token,
      type: rawType,
      full_name: fullName,
      password,
      email,
    } = req.body
    const type = normalizeInviteType(rawType)
    if (!token || !type) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'token and type are required' },
        requestId: req.requestId,
      })
    }

    const existingUserId = req.userData?.id || null
    if (!existingUserId && !password) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'password is required' },
        requestId: req.requestId,
      })
    }

    if (type === 'supplier_branch') {
      return handleSupplierBranchAccept(req, res, {
        token,
        fullName,
        email,
        password,
        existingUserId,
      })
    }

    let result
    try {
      if (type === 'restaurant_member') {
        result = await acceptRestaurantMemberInvitation({
          token,
          fullName,
          email,
          password,
          existingUserId,
        })
      } else {
        result = await acceptRestaurantBranchInvitation({
          token,
          fullName,
          email,
          password,
          existingUserId,
        })
      }
    } catch (error) {
      const status = error.code === 'expired' ? 410 : 400
      return res.status(status).json({
        ok: false,
        data: null,
        error: {
          name: error.code === 'expired' ? 'INVITATION_EXPIRED' : 'INVITATION_INVALID',
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

    if (result.needsLogin && result.password) {
      const tokens = await exchangePasswordForTokens(result.email, result.password)
      setAuthCookies(res, tokens.access_token, tokens.refresh_token)
      const userInfo = await getUserInfo(tokens.access_token, tokens.id_token)
      return res.json({
        ok: true,
        data: {
          user: {
            email: userInfo.email || result.email,
            displayName: fullName || userInfo.given_name,
          },
          activeRestaurantId: result.restaurantId,
        },
        error: null,
        requestId: req.requestId,
      })
    }

    return res.json({
      ok: true,
      data: {
        user: req.userData
          ? {
              id: req.userData.id,
              email: req.userData.email,
              displayName: req.userData.display_name,
            }
          : null,
        activeRestaurantId: result.restaurantId,
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

async function handleSupplierBranchAccept(req, res, { token, fullName, email, password, existingUserId }) {
  let result
  try {
    result = await acceptBranchInvitation({
      token,
      fullName,
      email,
      password,
      existingUserId,
    })
  } catch (error) {
    const status = error.code === 'expired' ? 410 : 400
    return res.status(status).json({
      ok: false,
      data: null,
      error: {
        name: error.code === 'expired' ? 'INVITATION_EXPIRED' : 'INVITATION_INVALID',
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

  if (result.needsLogin && result.password) {
    const tokens = await exchangePasswordForTokens(result.email, result.password)
    setAuthCookies(res, tokens.access_token, tokens.refresh_token)
    const userInfo = await getUserInfo(tokens.access_token, tokens.id_token)
    return res.json({
      ok: true,
      data: {
        user: {
          email: userInfo.email || result.email,
          displayName: fullName || userInfo.given_name,
        },
        activeSupplierId: result.supplierId,
      },
      error: null,
      requestId: req.requestId,
    })
  }

  return res.json({
    ok: true,
    data: {
      user: req.userData
        ? {
            id: req.userData.id,
            email: req.userData.email,
            displayName: req.userData.display_name,
          }
        : null,
      activeSupplierId: result.supplierId,
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
    const { token, full_name: fullName, password, email } = req.body
    if (!token) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'token is required' },
        requestId: req.requestId,
      })
    }

    const existingUserId = req.userData?.id || null
    if (!existingUserId && !password) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'password is required' },
        requestId: req.requestId,
      })
    }

    let result
    try {
      result = await acceptBranchInvitation({
        token,
        fullName,
        email,
        password,
        existingUserId,
      })
    } catch (error) {
      const status = error.code === 'expired' ? 410 : 400
      return res.status(status).json({
        ok: false,
        data: null,
        error: {
          name: error.code === 'expired' ? 'INVITATION_EXPIRED' : 'INVITATION_INVALID',
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

    if (result.needsLogin && result.password) {
      const tokens = await exchangePasswordForTokens(result.email, result.password)
      setAuthCookies(res, tokens.access_token, tokens.refresh_token)
      const userInfo = await getUserInfo(tokens.access_token, tokens.id_token)
      return res.json({
        ok: true,
        data: {
          user: {
            email: userInfo.email || result.email,
            displayName: fullName || userInfo.given_name,
          },
          activeSupplierId: result.supplierId,
        },
        error: null,
        requestId: req.requestId,
      })
    }

    res.json({
      ok: true,
      data: {
        user: req.userData
          ? {
              id: req.userData.id,
              email: req.userData.email,
              displayName: req.userData.display_name,
            }
          : null,
        activeSupplierId: result.supplierId,
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
