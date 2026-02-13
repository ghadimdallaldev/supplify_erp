/**
 * Admin impersonation: signed short-lived token and effective-tenant helper.
 * Used so admins can "view as" a Restaurant or Supplier without logging in as that tenant.
 */
import * as jose from 'jose'
import { config } from '../config/env.js'
import { logger } from './logger.js'

const COOKIE_NAME = 'impersonation_token'
const ALG = 'HS256'

/**
 * Create a signed impersonation token (JWT).
 * @param {{ adminUserId: string, tenantId: string, tenantType: string, tenantName: string }} payload
 * @returns {Promise<string>} JWT
 */
export async function createImpersonationToken(payload) {
  const secret = new TextEncoder().encode(config.IMPERSONATION_SECRET)
  const maxMin = config.IMPERSONATION_MAX_DURATION_MINUTES || 60
  const exp = Math.floor(Date.now() / 1000) + maxMin * 60
  const token = await new jose.SignJWT({
    adminUserId: payload.adminUserId,
    tenantId: payload.tenantId,
    tenantType: payload.tenantType,
    tenantName: payload.tenantName || '',
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret)
  return token
}

/**
 * Verify and decode impersonation token. Returns null if invalid or expired.
 * @param {string} token
 * @returns {Promise<{ adminUserId: string, tenantId: string, tenantType: string, tenantName: string, exp: number } | null>}
 */
export async function verifyImpersonationToken(token) {
  if (!token || typeof token !== 'string') return null
  try {
    const secret = new TextEncoder().encode(config.IMPERSONATION_SECRET)
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [ALG] })
    return {
      adminUserId: payload.adminUserId,
      tenantId: payload.tenantId,
      tenantType: payload.tenantType,
      tenantName: payload.tenantName || '',
      exp: payload.exp,
    }
  } catch (err) {
    logger.debug('Impersonation token verify failed', { reason: err.message })
    return null
  }
}

/**
 * Get the cookie name used for impersonation token.
 */
export function getImpersonationCookieName() {
  return COOKIE_NAME
}

/**
 * Get effective tenant for the request.
 * When an admin is impersonating, returns the impersonated tenant only if the current user is the admin who started it.
 * Otherwise returns null (caller should resolve tenant by email or other means).
 * @param {import('express').Request} req - Must have req.userData and optionally req.impersonationContext
 * @returns {{ tenantId: string, tenantType: string, tenantName: string } | null}
 */
export function getEffectiveTenant(req) {
  const ctx = req.impersonationContext
  if (!ctx || !req.userData) return null
  if (ctx.adminUserId !== req.userData.id) return null
  return {
    tenantId: ctx.tenantId,
    tenantType: ctx.tenantType,
    tenantName: ctx.tenantName || '',
  }
}
