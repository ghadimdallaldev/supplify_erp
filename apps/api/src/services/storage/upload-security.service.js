import fs from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { config } from '../../config/env.js'
import { query, withTransaction } from '../../lib/db.js'
import {
  MAX_IMPORT_ZIP_BYTES,
  MAX_UPLOAD_BYTES,
  assertUploadFileBytes,
  normalizeUploadMime,
} from '../../lib/sanitize-upload.js'
import {
  scanQuarantineFile,
  securelyDeleteQuarantineFile,
  spoolInboundFile,
} from './malware-scanner.js'

const SESSION_TTL_SECONDS = 5 * 60
const READ_SCAN_TIMEOUT_MS = 15_000

function tokenHash(token) {
  return createHash('sha256').update(String(token)).digest()
}

function sha256(body) {
  return createHash('sha256').update(body).digest('hex')
}

function effectiveObjectMime(fileKey, contentType) {
  const normalized = normalizeUploadMime(contentType)
  if (normalized && normalized !== 'application/octet-stream') return normalized
  const extension = String(fileKey || '')
    .toLowerCase()
    .split('.')
    .pop()
  return (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      pdf: 'application/pdf',
      zip: 'application/zip',
      csv: 'text/csv',
    }[extension] || normalized
  )
}

function withEffectiveObjectMime(fileKey, object) {
  const contentType = effectiveObjectMime(fileKey, object?.contentType)
  return contentType && contentType !== object?.contentType ? { ...object, contentType } : object
}

function uploadError(name, message, code = name) {
  return Object.assign(new Error(message), { name, code })
}

function tenantMatches(session, tenantId, tenantType) {
  return (
    String(session.tenant_id || '') === String(tenantId || '') &&
    String(session.tenant_type || '') === String(tenantType || '')
  )
}

function assertDestinationKey(destinationKey, userId, tenantId) {
  const key = String(destinationKey || '').replace(/^\/+/, '')
  if (!key || key.includes('..') || key.includes('\\') || !/^(uploads|imports)\//.test(key)) {
    throw uploadError('UPLOAD_KEY_INVALID', 'Invalid upload destination')
  }
  if (key.startsWith(`uploads/${userId}/`)) return key
  if (tenantId && key.startsWith(`imports/${tenantId}/`)) return key
  throw uploadError('UPLOAD_KEY_INVALID', 'Invalid upload destination')
}

/** Create the only upload capability the API will issue. The raw token is never persisted. */
export async function createUploadSession({
  userId,
  tenantId = null,
  tenantType = null,
  organizationId = null,
  destinationKey,
  contentType,
  maxBytes,
  expiresIn = SESSION_TTL_SECONDS,
}) {
  if (!userId) throw uploadError('UPLOAD_SESSION_INVALID', 'Authenticated user is required')
  const key = assertDestinationKey(destinationKey, userId, tenantId)
  const mime = normalizeUploadMime(contentType)
  if (!mime) throw uploadError('UPLOAD_CONTENT_TYPE', 'Content-Type is required')
  const importUpload = key.startsWith('imports/')
  const hardMax = importUpload ? MAX_IMPORT_ZIP_BYTES : MAX_UPLOAD_BYTES
  const requestedMax = Number(maxBytes)
  const boundedMax =
    Number.isFinite(requestedMax) && requestedMax > 0
      ? Math.min(Math.floor(requestedMax), hardMax)
      : hardMax
  const ttl = Math.min(Math.max(Number(expiresIn) || SESSION_TTL_SECONDS, 30), 15 * 60)
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ttl * 1000)
  await query(
    `INSERT INTO file_upload_session (
       token_hash, user_id, tenant_id, tenant_type, organization_id,
       destination_key, content_type, max_bytes, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      tokenHash(token),
      userId,
      tenantId,
      tenantType,
      organizationId,
      key,
      mime,
      boundedMax,
      expiresAt,
    ]
  )
  return { token, destinationKey: key, contentType: mime, maxBytes: boundedMax, expiresAt }
}

function gatewayUploadUrl(token, { importUpload = false } = {}) {
  const base = String(config.API_PUBLIC_URL || '').replace(/\/$/, '')
  return `${base}/api/files/${importUpload ? 'upload-import' : 'upload'}/${token}`
}

/** Generate a gateway-only upload response while retaining legacy response field names. */
export async function createGatewayUpload(options) {
  const session = await createUploadSession({
    ...options,
    destinationKey: options.destinationKey || options.fileKey,
    contentType: options.contentType || options.fileType,
    maxBytes: options.maxBytes ?? options.fileSize,
  })
  const { getStorageProvider } = await import('./storage.service.js')
  const provider = getStorageProvider()
  const importUpload = session.destinationKey.startsWith('imports/')
  return {
    presignedUrl: gatewayUploadUrl(session.token, { importUpload }),
    url: gatewayUploadUrl(session.token, { importUpload }),
    publicUrl: provider.buildPublicUrl(session.destinationKey),
    fileKey: session.destinationKey,
    method: 'PUT',
    maxBytes: session.maxBytes,
  }
}

async function loadOwnedSession(token, userId) {
  const { rows } = await query(`SELECT * FROM file_upload_session WHERE token_hash = $1 LIMIT 1`, [
    tokenHash(token),
  ])
  const session = rows[0]
  if (!session) throw uploadError('UPLOAD_TOKEN_INVALID', 'Invalid or expired upload token')
  if (String(session.user_id) !== String(userId)) {
    throw uploadError('UPLOAD_SESSION_FORBIDDEN', 'Upload session does not belong to this user')
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    throw uploadError('UPLOAD_TOKEN_INVALID', 'Invalid or expired upload token')
  }
  return session
}

async function waitForProcessing(
  token,
  userId,
  tenantId,
  tenantType,
  bodyHash,
  timeoutMs = READ_SCAN_TIMEOUT_MS
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const session = await loadOwnedSession(token, userId)
    if (!tenantMatches(session, tenantId, tenantType)) {
      throw uploadError('UPLOAD_SESSION_FORBIDDEN', 'Upload session is not valid for this tenant')
    }
    if (session.state === 'completed') {
      if (session.completed_sha256 !== bodyHash) {
        throw uploadError('UPLOAD_REPLAY_CONFLICT', 'Upload replay conflicts with the stored file')
      }
      return { fileKey: session.destination_key, idempotent: true }
    }
    if (session.state === 'rejected') {
      throw uploadError(session.error_code || 'UPLOAD_REJECTED', 'Upload was rejected')
    }
    if (session.state === 'failed') {
      throw uploadError(
        session.error_code || 'MALWARE_SCAN_UNAVAILABLE',
        'Upload security processing failed'
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw uploadError('MALWARE_SCAN_UNAVAILABLE', 'Upload security processing is unavailable')
}

async function recordScanFailure(session, bodyHash, errorCode) {
  const { rowCount } = await query(
    `UPDATE file_security_scan
     SET status = 'scan_failed', error_code = $2, scanned_at = now()
     WHERE upload_session_id = $1 AND sha256 = $3 AND status = 'pending_scan'`,
    [session.id, errorCode, bodyHash]
  ).catch(() => ({ rowCount: 0 }))
  if (!rowCount) {
    await query(
      `INSERT INTO file_security_scan (
         upload_session_id, file_key, status, sha256, error_code, scanned_at
       ) VALUES ($1, $2, 'scan_failed', $3, $4, now())`,
      [session.id, session.destination_key, bodyHash, errorCode]
    ).catch(() => {})
  }
  await query(
    `UPDATE file_upload_session SET state = 'failed', error_code = $2, completed_at = now() WHERE id = $1`,
    [session.id, errorCode]
  )
}

/**
 * Authenticate, atomically claim, spool, scan, and promote one upload. A
 * claimed session is never allowed to replace an existing object on replay.
 */
export async function completeUploadSession({
  token,
  userId,
  tenantId = null,
  tenantType = null,
  body,
  contentType,
}) {
  if (!Buffer.isBuffer(body)) throw uploadError('UPLOAD_INVALID_FILE', 'Invalid upload body')
  const bodyHash = sha256(body)
  const initial = await loadOwnedSession(token, userId)
  if (!tenantMatches(initial, tenantId, tenantType)) {
    throw uploadError('UPLOAD_SESSION_FORBIDDEN', 'Upload session is not valid for this tenant')
  }
  const mime = normalizeUploadMime(contentType)
  if (initial.content_type !== mime) {
    throw uploadError('UPLOAD_CONTENT_TYPE', 'Content-Type mismatch')
  }
  if (body.length > Number(initial.max_bytes)) {
    throw uploadError('UPLOAD_TOO_LARGE', 'Upload exceeds allowed size')
  }
  if (initial.state === 'completed') {
    if (initial.completed_sha256 === bodyHash) {
      return { fileKey: initial.destination_key, idempotent: true }
    }
    throw uploadError('UPLOAD_REPLAY_CONFLICT', 'Upload replay conflicts with the stored file')
  }
  if (initial.state === 'processing') {
    return waitForProcessing(token, userId, tenantId, tenantType, bodyHash)
  }
  if (initial.state !== 'pending') {
    throw uploadError(initial.error_code || 'UPLOAD_REJECTED', 'Upload session is no longer usable')
  }

  const { rows: claimed } = await query(
    `UPDATE file_upload_session
     SET state = 'processing', claimed_at = now(), requested_sha256 = $3
     WHERE token_hash = $1 AND user_id = $2 AND state = 'pending' AND expires_at > now()
     RETURNING *`,
    [tokenHash(token), userId, bodyHash]
  )
  if (!claimed.length) return waitForProcessing(token, userId, tenantId, tenantType, bodyHash)
  const session = claimed[0]
  if (!tenantMatches(session, tenantId, tenantType)) {
    await query(
      `UPDATE file_upload_session SET state = 'failed', error_code = 'UPLOAD_SESSION_FORBIDDEN' WHERE id = $1`,
      [session.id]
    )
    throw uploadError('UPLOAD_SESSION_FORBIDDEN', 'Upload session is not valid for this tenant')
  }

  let spool
  try {
    spool = await spoolInboundFile(body, { maxBytes: Number(session.max_bytes) })
    await query(
      `INSERT INTO file_security_scan (upload_session_id, file_key, status, sha256)
       VALUES ($1, $2, 'pending_scan', $3)`,
      [session.id, session.destination_key, bodyHash]
    )
    const scan = await scanQuarantineFile(spool.filePath, { maxBytes: Number(session.max_bytes) })
    if (scan.status === 'infected') {
      await query(
        `UPDATE file_security_scan
         SET status = 'infected', scanner = $2, scanner_signature = $3, scanned_at = now(), error_code = 'UPLOAD_MALWARE_DETECTED'
         WHERE upload_session_id = $1 AND sha256 = $4`,
        [session.id, scan.scanner, scan.signature, bodyHash]
      )
      await query(
        `UPDATE file_upload_session SET state = 'rejected', error_code = 'UPLOAD_MALWARE_DETECTED', completed_at = now() WHERE id = $1`,
        [session.id]
      )
      throw uploadError('UPLOAD_MALWARE_DETECTED', 'Upload failed security scanning')
    }
    assertUploadFileBytes(body, mime)

    const { getStorageProvider } = await import('./storage.service.js')
    const promoted = await getStorageProvider().putObject({
      fileKey: session.destination_key,
      body: await fs.readFile(spool.filePath),
      contentType: mime,
    })
    await query(
      `UPDATE file_security_scan
       SET status = 'clean', scanner = $2, scanner_signature = $3,
           stored_etag = $4, stored_version_id = $5, scanned_at = now()
       WHERE upload_session_id = $1 AND sha256 = $6`,
      [
        session.id,
        scan.scanner,
        scan.signature,
        promoted.etag || null,
        promoted.versionId || null,
        bodyHash,
      ]
    )
    await query(
      `UPDATE file_upload_session
       SET state = 'completed', completed_sha256 = $2, stored_etag = $3,
           stored_version_id = $4, completed_at = now()
       WHERE id = $1`,
      [session.id, bodyHash, promoted.etag || null, promoted.versionId || null]
    )
    return { fileKey: session.destination_key, idempotent: false }
  } catch (error) {
    if (error?.name === 'UPLOAD_MALWARE_DETECTED') throw error
    const code =
      error?.name === 'MALWARE_SCAN_UNAVAILABLE'
        ? 'MALWARE_SCAN_UNAVAILABLE'
        : error?.name || 'UPLOAD_FAILED'
    await recordScanFailure(session, bodyHash, code)
    if (code === 'MALWARE_SCAN_UNAVAILABLE') {
      throw uploadError(
        'MALWARE_SCAN_UNAVAILABLE',
        'Upload security scanning is temporarily unavailable'
      )
    }
    throw error
  } finally {
    await securelyDeleteQuarantineFile(spool?.filePath)
  }
}

/** Require a clean upload owned by the current authenticated tenant before attachment creation. */
export async function assertCleanUploadOwnership(
  fileKey,
  { userId, tenantId = null, tenantType = null }
) {
  const { rows } = await query(
    `SELECT fus.destination_key, fus.tenant_id, fus.tenant_type, fss.sha256,
            fss.stored_etag, fss.stored_version_id
     FROM file_upload_session fus
     JOIN file_security_scan fss ON fss.upload_session_id = fus.id
     WHERE fus.destination_key = $1
       AND fus.user_id = $2
       AND fus.state = 'completed'
       AND fss.status = 'clean'
       AND fss.file_key = fus.destination_key
       AND ($3::uuid IS NULL OR fus.tenant_id = $3)
       AND ($4::text IS NULL OR fus.tenant_type = $4)
     ORDER BY fss.scanned_at DESC NULLS LAST
     LIMIT 1`,
    [String(fileKey || '').replace(/^\/+/, ''), userId, tenantId, tenantType]
  )
  if (!rows.length) throw uploadError('UPLOAD_NOT_CLEAN', 'File is not an approved upload')
  return rows[0]
}

async function readObjectBody(body, maxBytes = MAX_IMPORT_ZIP_BYTES) {
  if (Buffer.isBuffer(body)) return body
  if (body instanceof Uint8Array) return Buffer.from(body)
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') {
    throw uploadError('MALWARE_SCAN_UNAVAILABLE', 'Stored object cannot be scanned')
  }
  const chunks = []
  let total = 0
  for await (const chunk of body) {
    const value = Buffer.from(chunk)
    total += value.length
    if (total > maxBytes)
      throw uploadError('UPLOAD_TOO_LARGE', 'Stored object exceeds the scan limit')
    chunks.push(value)
  }
  return Buffer.concat(chunks, total)
}

async function hasCleanVersion(client, fileKey, object) {
  if (!object?.etag && !object?.versionId && !object?.sha256) return false
  const run = client?.query ? client.query.bind(client) : query
  const { rows } = await run(
    `SELECT 1 FROM file_security_scan
     WHERE file_key = $1 AND status = 'clean'
       AND ($2::text IS NULL OR stored_etag IS NOT DISTINCT FROM $2)
       AND ($3::text IS NULL OR stored_version_id IS NOT DISTINCT FROM $3)
       AND ($4::text IS NULL OR sha256 = $4)
     ORDER BY scanned_at DESC NULLS LAST LIMIT 1`,
    [fileKey, object.etag || null, object.versionId || null, object.sha256 || null]
  )
  return rows.length > 0
}

/** Scan legacy objects on first authorized read while serializing the exact key. */
export async function ensureObjectCleanForRead(fileKey, object) {
  if (await hasCleanVersion(null, fileKey, object)) return withEffectiveObjectMime(fileKey, object)
  return withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [fileKey])
    if (await hasCleanVersion(client, fileKey, object)) {
      return withEffectiveObjectMime(fileKey, object)
    }
    const body = await readObjectBody(object.body)
    const digest = sha256(body)
    const spool = await spoolInboundFile(body, { maxBytes: MAX_UPLOAD_BYTES })
    try {
      const scan = await scanQuarantineFile(spool.filePath, { maxBytes: MAX_UPLOAD_BYTES })
      if (scan.status !== 'clean') {
        throw uploadError(
          scan.status === 'infected' ? 'UPLOAD_MALWARE_DETECTED' : 'MALWARE_SCAN_UNAVAILABLE',
          'Stored object failed security scanning'
        )
      }
      assertUploadFileBytes(body, effectiveObjectMime(fileKey, object.contentType))
      await client.query(
        `INSERT INTO file_security_scan (
           file_key, status, sha256, stored_etag, stored_version_id,
           scanner, scanner_signature, scanned_at
         ) VALUES ($1, 'clean', $2, $3, $4, $5, $6, now())`,
        [
          fileKey,
          digest,
          object.etag || null,
          object.versionId || null,
          scan.scanner,
          scan.signature,
        ]
      )
      return { ...withEffectiveObjectMime(fileKey, object), body }
    } finally {
      await securelyDeleteQuarantineFile(spool.filePath)
    }
  })
}

export function fileSecurityErrorCode(error) {
  return error?.code || error?.name || null
}
