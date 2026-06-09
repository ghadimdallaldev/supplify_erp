import { query } from './db.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import {
  LEGAL_PACK_VERSION,
  requiredInviteDocuments,
  requiredRegistrationDocuments,
} from './legal-documents.js'

/**
 * @param {object} params
 * @param {string[]} params.acceptedDocuments
 * @param {string[]} params.requiredDocuments
 * @param {boolean} params.electronicSignatureAttestation
 * @param {string} [params.packVersion]
 */
export function validateLegalAcceptancePayload({
  acceptedDocuments,
  requiredDocuments,
  electronicSignatureAttestation,
  packVersion,
}) {
  if (!electronicSignatureAttestation) {
    throw new ValidationError('You must accept the legal agreements to continue')
  }
  if (packVersion && packVersion !== LEGAL_PACK_VERSION) {
    throw new ValidationError(
      'Legal document versions have been updated. Refresh the page and review the latest agreements.'
    )
  }
  const accepted = new Set((acceptedDocuments || []).map((s) => String(s).trim()).filter(Boolean))
  const missing = requiredDocuments.filter((doc) => !accepted.has(doc))
  if (missing.length > 0) {
    throw new ValidationError('Please accept all required legal agreements before continuing')
  }
  return accepted
}

/**
 * Latest acceptance row per document slug for a user.
 * @param {string} userId
 */
export async function getLatestLegalAcceptancesForUser(userId) {
  const { rows } = await query(
    `SELECT DISTINCT ON (document_slug)
       document_slug, document_version, context, tenant_type, accepted_at
     FROM legal_acceptance
     WHERE user_id = $1
     ORDER BY document_slug, accepted_at DESC`,
    [userId]
  )
  return rows
}

/**
 * Which legal documents this user must keep current on login.
 * @param {object} params
 * @param {'ADMIN' | 'SUPPLIER' | 'RESTAURANT' | 'STAFF_PORTAL' | 'PENDING'} params.role
 * @param {'RESTAURANT' | 'SUPPLIER' | null | undefined} params.tenantType
 * @param {Array<{ context?: string, tenant_type?: string | null }>} params.rows
 * @returns {{ required: string[], variant: 'registration' | 'invite', accountType: 'RESTAURANT' | 'SUPPLIER' | null }}
 */
export function resolveRequiredLegalDocuments({ role, tenantType, rows }) {
  const hasRegistration = rows.some((row) => row.context === 'registration')
  const registrationTenantType =
    rows.find((row) => row.context === 'registration' && row.tenant_type)?.tenant_type || null

  if (hasRegistration && registrationTenantType) {
    return {
      required: requiredRegistrationDocuments(registrationTenantType),
      variant: 'registration',
      accountType: registrationTenantType,
    }
  }
  if ((role === 'RESTAURANT' || role === 'SUPPLIER') && tenantType) {
    return {
      required: requiredRegistrationDocuments(tenantType),
      variant: 'registration',
      accountType: tenantType,
    }
  }
  return {
    required: requiredInviteDocuments(),
    variant: 'invite',
    accountType: null,
  }
}

/**
 * @param {object} params
 * @param {string} params.userId
 * @param {'ADMIN' | 'SUPPLIER' | 'RESTAURANT' | 'STAFF_PORTAL' | 'PENDING'} params.role
 * @param {'RESTAURANT' | 'SUPPLIER' | null | undefined} params.tenantType
 */
export async function getUserLegalAcceptanceStatus({ userId, role, tenantType }) {
  if (role === 'PENDING') {
    return {
      needsReacceptance: false,
      currentPackVersion: LEGAL_PACK_VERSION,
      acceptedPackVersion: null,
      requiredDocuments: [],
      missingDocuments: [],
      variant: 'invite',
      accountType: null,
    }
  }

  const rows = await getLatestLegalAcceptancesForUser(userId)
  const { required, variant, accountType } = resolveRequiredLegalDocuments({
    role,
    tenantType,
    rows,
  })

  const missingDocuments = required.filter((slug) => {
    const row = rows.find((r) => r.document_slug === slug)
    return !row || row.document_version !== LEGAL_PACK_VERSION
  })

  const versionSet = new Set(
    rows.filter((row) => required.includes(row.document_slug)).map((row) => row.document_version)
  )
  const acceptedPackVersion = versionSet.size === 1 ? [...versionSet][0] : null

  return {
    needsReacceptance: missingDocuments.length > 0,
    currentPackVersion: LEGAL_PACK_VERSION,
    acceptedPackVersion,
    requiredDocuments: required,
    missingDocuments,
    variant,
    accountType,
  }
}

/**
 * Record refreshed legal acceptances after a pack version bump (login gate).
 * @param {object} params
 * @param {string} params.userId
 * @param {string} [params.tenantId]
 * @param {'RESTAURANT' | 'SUPPLIER' | null | undefined} params.tenantType
 * @param {'ADMIN' | 'SUPPLIER' | 'RESTAURANT' | 'STAFF_PORTAL'} params.role
 * @param {string[]} params.acceptedDocuments
 * @param {boolean} params.electronicSignatureAttestation
 * @param {string} [params.packVersion]
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @param {import('pg').PoolClient} [client]
 */
export async function recordLoginLegalReacceptances(
  {
    userId,
    tenantId,
    tenantType,
    role,
    acceptedDocuments,
    electronicSignatureAttestation,
    packVersion,
    ipAddress,
    userAgent,
  },
  client
) {
  const rows = await getLatestLegalAcceptancesForUser(userId)
  const { required } = resolveRequiredLegalDocuments({ role, tenantType, rows })
  const accepted = validateLegalAcceptancePayload({
    acceptedDocuments,
    requiredDocuments: required,
    electronicSignatureAttestation,
    packVersion,
  })
  const db = client || query
  const run = typeof db === 'function' ? db : db.query.bind(db)
  const slugs = [...accepted]
  const versions = slugs.map(() => packVersion || LEGAL_PACK_VERSION)
  const contexts = slugs.map(() => 'login_refresh')
  const metadataJson = JSON.stringify({
    packVersion: packVersion || LEGAL_PACK_VERSION,
  })
  await run(
    `INSERT INTO legal_acceptance (
      user_id, tenant_id, tenant_type, context, document_slug, document_version,
      ip_address, user_agent, metadata
    )
    SELECT $1, $2, $3, ctx, slug, ver, $7, $8, $9::jsonb
    FROM unnest($4::text[], $5::text[], $6::text[]) AS t(slug, ver, ctx)`,
    [
      userId,
      tenantId ?? null,
      tenantType ?? null,
      slugs,
      versions,
      contexts,
      ipAddress ?? null,
      userAgent ?? null,
      metadataJson,
    ]
  )
}

/**
 * Persist legal acceptances for registration.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} [params.tenantId]
 * @param {'RESTAURANT' | 'SUPPLIER'} [params.tenantType]
 * @param {string[]} params.acceptedDocuments
 * @param {string} [params.packVersion]
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @param {import('pg').PoolClient} [client]
 */
export async function recordRegistrationLegalAcceptances(
  {
    userId,
    tenantId,
    tenantType,
    acceptedDocuments,
    electronicSignatureAttestation,
    packVersion,
    ipAddress,
    userAgent,
  },
  client
) {
  const required = requiredRegistrationDocuments(tenantType)
  const accepted = validateLegalAcceptancePayload({
    acceptedDocuments,
    requiredDocuments: required,
    electronicSignatureAttestation,
    packVersion,
  })
  const db = client || query
  const run = typeof db === 'function' ? db : db.query.bind(db)
  const slugs = [...accepted]
  const versions = slugs.map(() => packVersion || LEGAL_PACK_VERSION)
  const contexts = slugs.map(() => 'registration')
  const metadataJson = JSON.stringify({
    packVersion: packVersion || LEGAL_PACK_VERSION,
  })
  await run(
    `INSERT INTO legal_acceptance (
      user_id, tenant_id, tenant_type, context, document_slug, document_version,
      ip_address, user_agent, metadata
    )
    SELECT $1, $2, $3, ctx, slug, ver, $7, $8, $9::jsonb
    FROM unnest($4::text[], $5::text[], $6::text[]) AS t(slug, ver, ctx)`,
    [
      userId,
      tenantId ?? null,
      tenantType ?? null,
      slugs,
      versions,
      contexts,
      ipAddress ?? null,
      userAgent ?? null,
      metadataJson,
    ]
  )
}

/**
 * @param {object} params
 * @param {string} params.userId
 * @param {string[]} params.acceptedDocuments
 * @param {boolean} params.electronicSignatureAttestation
 * @param {string} [params.packVersion]
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @param {import('pg').PoolClient} [client]
 */
export async function recordInviteLegalAcceptances(
  { userId, acceptedDocuments, electronicSignatureAttestation, packVersion, ipAddress, userAgent },
  client
) {
  const required = requiredInviteDocuments()
  const accepted = validateLegalAcceptancePayload({
    acceptedDocuments,
    requiredDocuments: required,
    electronicSignatureAttestation,
    packVersion,
  })
  const db = client || query
  const run = typeof db === 'function' ? db : db.query.bind(db)
  const slugs = [...accepted]
  const versions = slugs.map(() => packVersion || LEGAL_PACK_VERSION)
  const contexts = slugs.map(() => 'invite')
  const metadataJson = JSON.stringify({
    packVersion: packVersion || LEGAL_PACK_VERSION,
  })
  await run(
    `INSERT INTO legal_acceptance (
      user_id, tenant_id, tenant_type, context, document_slug, document_version,
      ip_address, user_agent, metadata
    )
    SELECT $1, NULL, NULL, ctx, slug, ver, $4, $5, $6::jsonb
    FROM unnest($2::text[], $3::text[], $7::text[]) AS t(slug, ver, ctx)`,
    [userId, slugs, versions, ipAddress ?? null, userAgent ?? null, metadataJson, contexts]
  )
}
