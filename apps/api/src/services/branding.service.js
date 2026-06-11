import { query } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { logger } from '../lib/logger.js'

let brandingSchemaReadyPromise = null

async function ensureBrandingSchemaReady() {
  if (!(await brandingColumnsExist('supplier')) || !(await brandingColumnsExist('restaurant'))) {
    if (!brandingSchemaReadyPromise) {
      brandingSchemaReadyPromise = import('../lib/ensure-tenant-branding-schema.js')
        .then((m) => m.ensureTenantBrandingSchema())
        .catch((err) => {
          brandingSchemaReadyPromise = null
          logger.warn('Tenant branding schema ensure failed', { error: err.message })
          throw err
        })
    }
    await brandingSchemaReadyPromise.catch(() => {
      /* allow fallback reads when DDL cannot run on this connection */
    })
  }
}

async function brandingColumnsExist(table) {
  const { brandingColumnsExist: exists } = await import('../lib/ensure-tenant-branding-schema.js')
  return exists(table)
}

async function loadBrandingRow(tenantId, tenantType) {
  const table = tenantType === 'RESTAURANT' ? 'restaurant' : 'supplier'
  await ensureBrandingSchemaReady()

  if (await brandingColumnsExist(table)) {
    const { rows } = await query(
      `SELECT logo_url, brand_primary, brand_accent, brand_display_name FROM ${table} WHERE id = $1`,
      [tenantId]
    )
    return rows[0]
  }

  const { rows } = await query(`SELECT logo_url FROM ${table} WHERE id = $1`, [tenantId])
  if (!rows[0]) return undefined
  return {
    logo_url: rows[0].logo_url,
    brand_primary: null,
    brand_accent: null,
    brand_display_name: null,
  }
}

/** @internal Test helper */
export function resetBrandingSchemaReadyForTests() {
  brandingSchemaReadyPromise = null
}

const DEFAULT_BRAND = {
  brandPrimary: '#5b21b6',
  brandMid: '#7c3aed',
  brandLight: '#a78bfa',
  brandPale: '#ede9fe',
  brandUltra: '#f8fafc',
  brandDisplayName: null,
  logoUrl: null,
}

const HEX_RE = /^#([0-9A-Fa-f]{6})$/

export function validateHexColor(value, fieldName) {
  if (value == null || value === '') return null
  const normalized = String(value).trim()
  if (!HEX_RE.test(normalized)) {
    throw new ValidationError(`${fieldName} must be a valid hex color (#RRGGBB)`)
  }
  return normalized.toLowerCase()
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function relativeLuminance({ r, g, b }) {
  const s = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1))
  const l2 = relativeLuminance(hexToRgb(hex2))
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function derivePalette(primary) {
  if (!primary || !HEX_RE.test(primary)) return { ...DEFAULT_BRAND }
  const { r, g, b } = hexToRgb(primary)
  const mid = `#${[Math.min(255, r + 20), Math.min(255, g + 10), Math.min(255, b + 30)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`
  const light = `#${[Math.min(255, r + 80), Math.min(255, g + 60), Math.min(255, b + 80)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`
  const pale = `#${[Math.min(255, r + 180), Math.min(255, g + 200), Math.min(255, b + 220)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`

  const safePrimary = contrastRatio(primary, '#ffffff') >= 3 ? primary : DEFAULT_BRAND.brandPrimary

  return {
    brandPrimary: safePrimary,
    brandMid: mid,
    brandLight: light,
    brandPale: pale,
    brandUltra: '#f8fafc',
  }
}

function mapRow(row) {
  if (!row) return { ...DEFAULT_BRAND, isDefault: true }
  const primary = row.brand_primary && HEX_RE.test(row.brand_primary) ? row.brand_primary : null
  const palette = primary ? derivePalette(primary) : { ...DEFAULT_BRAND }
  return {
    ...palette,
    brandAccent: row.brand_accent && HEX_RE.test(row.brand_accent) ? row.brand_accent : null,
    brandDisplayName: row.brand_display_name || null,
    logoUrl: row.logo_url || null,
    isDefault: !primary && !row.logo_url,
  }
}

export async function getTenantBranding(tenantId, tenantType) {
  const row = await loadBrandingRow(tenantId, tenantType)
  if (!row) throw new NotFoundError('Tenant not found')
  return mapRow(row)
}

export async function updateTenantBranding(tenantId, tenantType, payload) {
  const table = tenantType === 'RESTAURANT' ? 'restaurant' : 'supplier'
  await ensureBrandingSchemaReady()

  if (!(await brandingColumnsExist(table))) {
    throw new ValidationError(
      'Brand colors are not available on this server yet. Retry in a few minutes or contact support.'
    )
  }

  const sets = []
  const params = [tenantId]
  let idx = 2

  if (payload.brandPrimary !== undefined) {
    sets.push(`brand_primary = $${idx++}`)
    params.push(validateHexColor(payload.brandPrimary, 'brandPrimary'))
  }
  if (payload.brandAccent !== undefined) {
    sets.push(`brand_accent = $${idx++}`)
    params.push(validateHexColor(payload.brandAccent, 'brandAccent'))
  }
  if (payload.brandDisplayName !== undefined) {
    sets.push(`brand_display_name = $${idx++}`)
    params.push(
      payload.brandDisplayName === null || payload.brandDisplayName === ''
        ? null
        : String(payload.brandDisplayName).trim().slice(0, 120)
    )
  }

  if (sets.length === 0) {
    throw new ValidationError('No branding fields to update')
  }

  sets.push('updated_at = now()')

  const { rows } = await query(
    `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1 RETURNING logo_url, brand_primary, brand_accent, brand_display_name`,
    params
  )
  if (!rows[0]) throw new NotFoundError('Tenant not found')
  return mapRow(rows[0])
}

export { DEFAULT_BRAND, derivePalette }
