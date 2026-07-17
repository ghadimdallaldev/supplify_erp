import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import { query } from '../lib/db.js'
import { config } from '../config/env.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { hasBrandingCapability } from '../lib/branding-tier.js'
import { getEffectiveFeaturesForTenant } from '../lib/feature-flags.js'

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

function normalizeHostname(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
}

export function validateCustomHostname(hostname) {
  const normalized = normalizeHostname(hostname)
  if (!normalized || !HOSTNAME_RE.test(normalized)) {
    throw new ValidationError('hostname must be a valid domain name')
  }
  const platformHost = normalizeHostname(
    config.CUSTOM_DOMAIN_PLATFORM_HOST ||
      new URL(config.PUBLIC_FRONTEND_URL || 'http://localhost:5173').hostname
  )
  if (normalized === platformHost || normalized.endsWith(`.${platformHost}`)) {
    throw new ValidationError('hostname cannot be the platform domain')
  }
  return normalized
}

export async function assertCustomDomainAllowed(tenantId, tenantType) {
  const eff = await getEffectiveFeaturesForTenant(tenantId, tenantType)
  if (!hasBrandingCapability(eff?.features?.custom_branding, 'customDomain')) {
    throw new ValidationError('Custom domains are available on Scale')
  }
}

export async function getTenantCustomDomain(tenantId, tenantType) {
  try {
    const { rows } = await query(
      `
      SELECT id, tenant_id, tenant_type, hostname, verified_at, ssl_status, enabled,
             (verification_token IS NOT NULL) AS has_token
      FROM tenant_custom_domain
      WHERE tenant_id = $1 AND tenant_type = $2
      `,
      [tenantId, tenantType]
    )
    return rows[0] || null
  } catch (error) {
    if (error.code === '42P01') return null
    throw error
  }
}

export async function upsertTenantCustomDomain(tenantId, tenantType, hostname) {
  await assertCustomDomainAllowed(tenantId, tenantType)
  const normalized = validateCustomHostname(hostname)
  const token = crypto.randomBytes(16).toString('hex')

  const { rows } = await query(
    `
    INSERT INTO tenant_custom_domain (
      tenant_id, tenant_type, hostname, verification_token, verified_at, ssl_status, enabled
    ) VALUES ($1, $2, $3, $4, NULL, 'pending', false)
    ON CONFLICT (tenant_id, tenant_type) DO UPDATE SET
      hostname = EXCLUDED.hostname,
      verification_token = EXCLUDED.verification_token,
      verified_at = NULL,
      ssl_status = 'pending',
      enabled = false,
      updated_at = now()
    RETURNING id, tenant_id, tenant_type, hostname, verified_at, ssl_status, enabled
    `,
    [tenantId, tenantType, normalized, token]
  )

  const row = rows[0]
  return {
    ...row,
    verificationInstructions: buildVerificationInstructions(normalized, token),
  }
}

function buildVerificationInstructions(hostname, token) {
  const cnameTarget = config.CUSTOM_DOMAIN_CNAME_TARGET || 'cname.supplify.app'
  return {
    txtRecord: {
      name: `_supplify.${hostname}`,
      value: token,
    },
    cnameRecord: {
      name: hostname,
      value: cnameTarget,
    },
    note: 'Add the TXT record OR point a CNAME to the target, then call verify.',
  }
}

async function dnsTxtMatches(hostname, token) {
  const name = `_supplify.${hostname}`
  try {
    const records = await dns.resolveTxt(name)
    const flat = records.map((chunks) => chunks.join('')).join('')
    return flat.includes(token)
  } catch {
    return false
  }
}

async function dnsCnameMatches(hostname) {
  const target = (config.CUSTOM_DOMAIN_CNAME_TARGET || 'cname.supplify.app').toLowerCase()
  try {
    const records = await dns.resolveCname(hostname)
    return normalizeHostname(records) === target
  } catch {
    return false
  }
}

export async function verifyTenantCustomDomain(tenantId, tenantType) {
  const row = await getTenantCustomDomain(tenantId, tenantType)
  if (!row) throw new NotFoundError('Custom domain not configured')

  const { rows: full } = await query(
    `SELECT verification_token, hostname FROM tenant_custom_domain WHERE tenant_id = $1 AND tenant_type = $2`,
    [tenantId, tenantType]
  )
  const { verification_token: token, hostname } = full[0]

  const txtOk = await dnsTxtMatches(hostname, token)
  const cnameOk = await dnsCnameMatches(hostname)
  if (!txtOk && !cnameOk) {
    throw new ValidationError(
      'DNS verification failed. Add the TXT record or CNAME as shown in settings, then retry.'
    )
  }

  const { rows } = await query(
    `
    UPDATE tenant_custom_domain
    SET verified_at = now(), ssl_status = 'active', enabled = true, updated_at = now()
    WHERE tenant_id = $1 AND tenant_type = $2
    RETURNING id, tenant_id, tenant_type, hostname, verified_at, ssl_status, enabled
    `,
    [tenantId, tenantType]
  )
  return rows[0]
}

export async function resolveTenantByCustomHostname(hostname) {
  const normalized = normalizeHostname(hostname)
  if (!normalized) return null

  try {
    const { rows } = await query(
      `
      SELECT tcd.tenant_id, tcd.tenant_type, s.slug AS supplier_slug
      FROM tenant_custom_domain tcd
      LEFT JOIN supplier s ON s.id = tcd.tenant_id AND tcd.tenant_type = 'SUPPLIER'
      WHERE lower(tcd.hostname) = $1
        AND tcd.verified_at IS NOT NULL
        AND tcd.enabled = true
      LIMIT 1
      `,
      [normalized]
    )
    if (!rows[0]) return null
    return {
      tenantId: rows[0].tenant_id,
      tenantType: rows[0].tenant_type,
      slug: rows[0].supplier_slug,
    }
  } catch (error) {
    if (error.code === '42P01') return null
    throw error
  }
}
