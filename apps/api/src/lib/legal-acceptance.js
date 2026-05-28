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
 * @param {import('pg').PoolClient | typeof query} db
 */
async function insertAcceptance(db, row) {
  const run = typeof db === 'function' ? db : db.query.bind(db)
  await run(
    `INSERT INTO legal_acceptance (
      user_id, tenant_id, tenant_type, context, document_slug, document_version,
      ip_address, user_agent, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      row.userId,
      row.tenantId ?? null,
      row.tenantType ?? null,
      row.context,
      row.documentSlug,
      row.documentVersion,
      row.ipAddress ?? null,
      row.userAgent ?? null,
      JSON.stringify(row.metadata ?? {}),
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
  for (const documentSlug of accepted) {
    await insertAcceptance(db, {
      userId,
      tenantId,
      tenantType,
      context: 'registration',
      documentSlug,
      documentVersion: packVersion || LEGAL_PACK_VERSION,
      ipAddress,
      userAgent,
      metadata: { packVersion: packVersion || LEGAL_PACK_VERSION },
    })
  }
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
  for (const documentSlug of accepted) {
    await insertAcceptance(db, {
      userId,
      context: 'invite',
      documentSlug,
      documentVersion: packVersion || LEGAL_PACK_VERSION,
      ipAddress,
      userAgent,
      metadata: { packVersion: packVersion || LEGAL_PACK_VERSION },
    })
  }
}
