import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../config/env.js'
import { query } from './db.js'
import { getSupplierIdForRequest, getRestaurantIdForRequest } from './rbac.js'

const DEFAULT_SIGNED_URL_TTL_SEC = 86400

function computeObjectAccessSig(secret, fileKey, exp) {
  return createHmac('sha256', secret).update(`${fileKey}:${exp}`).digest('hex')
}

/**
 * @param {string} fileKey
 * @param {number} [expiresInSec]
 * @returns {{ exp: string; sig: string }}
 */
export function signObjectAccessParams(fileKey, expiresInSec = DEFAULT_SIGNED_URL_TTL_SEC) {
  const exp = String(Math.floor(Date.now() / 1000) + expiresInSec)
  const sig = computeObjectAccessSig(config.SESSION_SECRET, fileKey, exp)
  return { exp, sig }
}

/**
 * Append signed access params to an API proxy object URL.
 * @param {string} url
 * @param {string} fileKey
 */
export function appendObjectAccessSignature(url, fileKey) {
  const { exp, sig } = signObjectAccessParams(fileKey)
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}exp=${encodeURIComponent(exp)}&sig=${encodeURIComponent(sig)}`
}

function verifySignedObjectAccess(fileKey, expRaw, sigRaw) {
  if (!expRaw || !sigRaw || !config.SESSION_SECRET) return false
  const exp = Number.parseInt(String(expRaw), 10)
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false
  const expected = computeObjectAccessSig(config.SESSION_SECRET, fileKey, String(exp))
  try {
    const a = Buffer.from(String(sigRaw))
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

async function supplierHasPublicCatalog(supplierId) {
  const { rows } = await query(
    `SELECT public_catalog_enabled FROM supplier WHERE id = $1 LIMIT 1`,
    [supplierId]
  )
  if (!rows.length) return false
  // Fail closed, matching public-supplier-catalog.service.js (`= true`).
  return rows[0].public_catalog_enabled === true
}

async function restaurantHasCatalogAccess(restaurantId, supplierId) {
  const { rows } = await query(
    `
      SELECT 1
      FROM supplier_follow sf
      WHERE sf.supplier_id = $1
        AND sf.restaurant_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM supplier_blocklist sb
          WHERE sb.supplier_id = $1 AND sb.restaurant_id = $2
        )
      LIMIT 1
    `,
    [supplierId, restaurantId]
  )
  return rows.length > 0
}

async function userHasProductImageCatalogAccess(req, supplierId) {
  if (!req.userData) return false
  if (req.userData.role === 'ADMIN') return true
  if (req.userData.role === 'SUPPLIER') {
    const ownSupplierId = await getSupplierIdForRequest(req)
    return Boolean(ownSupplierId && ownSupplierId === supplierId)
  }
  if (req.userData.role === 'RESTAURANT') {
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) return false
    return restaurantHasCatalogAccess(restaurantId, supplierId)
  }
  return false
}

/**
 * Authorize read access to a stored object key.
 * @param {string} key Normalized uploads/... key
 * @param {import('express').Request} req
 */
export async function verifyObjectAccess(key, req) {
  if (verifySignedObjectAccess(key, req.query?.exp, req.query?.sig)) {
    return true
  }

  const userId = req.userData?.id
  if (userId && key.startsWith(`uploads/${userId}/`)) {
    return true
  }

  const productImageMatch = key.match(/^uploads\/([^/]+)\/products\//)
  if (productImageMatch) {
    const supplierId = productImageMatch[1]
    if (await supplierHasPublicCatalog(supplierId)) {
      return true
    }
    if (await userHasProductImageCatalogAccess(req, supplierId)) {
      return true
    }
  }

  return false
}
