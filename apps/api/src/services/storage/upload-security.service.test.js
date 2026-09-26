import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const queryMock = vi.fn()
const withTransactionMock = vi.fn()
const scanQuarantineFileMock = vi.fn()
const securelyDeleteQuarantineFileMock = vi.fn()
const spoolInboundFileMock = vi.fn()
const putObjectMock = vi.fn()
const readFileMock = vi.fn()

vi.mock('node:fs/promises', () => {
  const api = { readFile: (...args) => readFileMock(...args) }
  return { ...api, default: api }
})

vi.mock('../../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (...args) => withTransactionMock(...args),
}))

vi.mock('../../config/env.js', () => ({
  config: {
    APP_ENV: 'dev',
    API_PUBLIC_URL: 'https://api.example.test',
    STORAGE_QUARANTINE_PATH: 'quarantine',
  },
}))

vi.mock('./malware-scanner.js', () => ({
  scanQuarantineFile: (...args) => scanQuarantineFileMock(...args),
  securelyDeleteQuarantineFile: (...args) => securelyDeleteQuarantineFileMock(...args),
  spoolInboundFile: (...args) => spoolInboundFileMock(...args),
}))

vi.mock('./storage.service.js', () => ({
  getStorageProvider: () => ({
    buildPublicUrl: (fileKey) => `https://api.example.test/api/files/object?key=${fileKey}`,
    putObject: (...args) => putObjectMock(...args),
  }),
}))

import {
  completeUploadSession,
  createGatewayUpload,
  createUploadSession,
} from './upload-security.service.js'

const future = new Date(Date.now() + 60_000)

function session(overrides = {}) {
  return {
    id: 'session-1',
    user_id: 'user-1',
    tenant_id: 'tenant-1',
    tenant_type: 'SUPPLIER',
    destination_key: 'uploads/user-1/photo.jpg',
    content_type: 'image/jpeg',
    max_bytes: 10 * 1024 * 1024,
    expires_at: future,
    state: 'pending',
    ...overrides,
  }
}

describe('upload security sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
    withTransactionMock.mockReset()
    scanQuarantineFileMock.mockReset()
    securelyDeleteQuarantineFileMock.mockReset().mockResolvedValue(undefined)
    spoolInboundFileMock.mockReset().mockResolvedValue({ filePath: 'quarantine/file.spool' })
    readFileMock.mockReset().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]))
    putObjectMock.mockReset().mockResolvedValue({ etag: 'etag-1', versionId: 'version-1' })
  })

  it('creates an opaque gateway session with a bounded destination and size', async () => {
    queryMock.mockResolvedValue({ rows: [] })

    const result = await createGatewayUpload({
      userId: 'user-1',
      tenantId: 'tenant-1',
      tenantType: 'SUPPLIER',
      fileKey: 'uploads/user-1/photo.jpg',
      fileType: 'image/jpeg',
      fileSize: 999_999_999,
    })

    expect(result.presignedUrl).toMatch(
      /^https:\/\/api\.example\.test\/api\/files\/upload\/[A-Za-z0-9_-]+$/
    )
    expect(result.url).toBe(result.presignedUrl)
    expect(result.presignedUrl).not.toContain('s3')
    expect(result.maxBytes).toBe(10 * 1024 * 1024)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO file_upload_session'),
      expect.arrayContaining(['user-1', 'tenant-1', 'SUPPLIER', 'uploads/user-1/photo.jpg'])
    )
  })

  it('rejects cross-tenant completion before claiming the session', async () => {
    queryMock.mockResolvedValueOnce({ rows: [session()] })

    await expect(
      completeUploadSession({
        token: 'opaque-token',
        userId: 'user-1',
        tenantId: 'other-tenant',
        tenantType: 'SUPPLIER',
        body: Buffer.from([0xff, 0xd8, 0xff]),
        contentType: 'image/jpeg',
      })
    ).rejects.toMatchObject({ name: 'UPLOAD_SESSION_FORBIDDEN' })
    expect(queryMock).toHaveBeenCalledTimes(1)
  })

  it('makes identical completed retries idempotent and rejects conflicting replays', async () => {
    const body = Buffer.from([0xff, 0xd8, 0xff])
    const digest = createHash('sha256').update(body).digest('hex')
    queryMock.mockResolvedValueOnce({
      rows: [session({ state: 'completed', completed_sha256: digest })],
    })

    await expect(
      completeUploadSession({
        token: 'opaque-token',
        userId: 'user-1',
        tenantId: 'tenant-1',
        tenantType: 'SUPPLIER',
        body,
        contentType: 'image/jpeg',
      })
    ).resolves.toMatchObject({ idempotent: true })

    queryMock.mockReset().mockResolvedValueOnce({
      rows: [session({ state: 'completed', completed_sha256: 'different' })],
    })
    await expect(
      completeUploadSession({
        token: 'opaque-token',
        userId: 'user-1',
        tenantId: 'tenant-1',
        tenantType: 'SUPPLIER',
        body,
        contentType: 'image/jpeg',
      })
    ).rejects.toMatchObject({ name: 'UPLOAD_REPLAY_CONFLICT' })
  })

  it('scans before promoting a clean upload and records the exact storage version', async () => {
    const body = Buffer.from([0xff, 0xd8, 0xff])
    queryMock
      .mockResolvedValueOnce({ rows: [session()] })
      .mockResolvedValueOnce({ rows: [session({ state: 'processing' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    scanQuarantineFileMock.mockResolvedValue({
      status: 'clean',
      scanner: 'clamav',
      signature: null,
    })

    await expect(
      completeUploadSession({
        token: 'opaque-token',
        userId: 'user-1',
        tenantId: 'tenant-1',
        tenantType: 'SUPPLIER',
        body,
        contentType: 'image/jpeg',
      })
    ).resolves.toMatchObject({ fileKey: 'uploads/user-1/photo.jpg', idempotent: false })

    expect(scanQuarantineFileMock.mock.invocationCallOrder[0]).toBeLessThan(
      putObjectMock.mock.invocationCallOrder[0]
    )
    expect(putObjectMock).toHaveBeenCalledWith({
      fileKey: 'uploads/user-1/photo.jpg',
      body,
      contentType: 'image/jpeg',
    })
    expect(queryMock.mock.calls[4][1]).toEqual(expect.arrayContaining(['etag-1', 'version-1']))
  })

  it('rejects infected content without promoting it', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [session()] })
      .mockResolvedValueOnce({ rows: [session({ state: 'processing' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [], rowCount: 1 })
    scanQuarantineFileMock.mockResolvedValue({
      status: 'infected',
      scanner: 'clamav',
      signature: 'Eicar-Test-Signature FOUND',
    })

    await expect(
      completeUploadSession({
        token: 'opaque-token',
        userId: 'user-1',
        tenantId: 'tenant-1',
        tenantType: 'SUPPLIER',
        body: Buffer.from([0xff, 0xd8, 0xff]),
        contentType: 'image/jpeg',
      })
    ).rejects.toMatchObject({ name: 'UPLOAD_MALWARE_DETECTED' })
    expect(putObjectMock).not.toHaveBeenCalled()
    expect(securelyDeleteQuarantineFileMock).toHaveBeenCalledWith('quarantine/file.spool')
  })

  it('stores a valid image when the scanner is unavailable', async () => {
    const body = Buffer.from([0xff, 0xd8, 0xff])
    queryMock
      .mockResolvedValueOnce({ rows: [session()] })
      .mockResolvedValueOnce({ rows: [session({ state: 'processing' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [], rowCount: 1 })
    scanQuarantineFileMock.mockRejectedValue(
      Object.assign(new Error('scanner down'), { name: 'MALWARE_SCAN_UNAVAILABLE' })
    )

    await expect(
      completeUploadSession({
        token: 'opaque-token',
        userId: 'user-1',
        tenantId: 'tenant-1',
        tenantType: 'SUPPLIER',
        body,
        contentType: 'image/jpeg',
      })
    ).resolves.toMatchObject({
      fileKey: 'uploads/user-1/photo.jpg',
      idempotent: false,
      scanBypassed: true,
    })

    expect(putObjectMock).toHaveBeenCalledWith({
      fileKey: 'uploads/user-1/photo.jpg',
      body,
      contentType: 'image/jpeg',
    })
    expect(queryMock.mock.calls.some((call) => String(call[0]).includes('scan_unavailable'))).toBe(
      true
    )
  })

  it('does not store invalid bytes when the scanner is unavailable', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [session()] })
      .mockResolvedValueOnce({ rows: [session({ state: 'processing' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [], rowCount: 1 })
    scanQuarantineFileMock.mockRejectedValue(
      Object.assign(new Error('scanner down'), { name: 'MALWARE_SCAN_UNAVAILABLE' })
    )

    await expect(
      completeUploadSession({
        token: 'opaque-token',
        userId: 'user-1',
        tenantId: 'tenant-1',
        tenantType: 'SUPPLIER',
        body: Buffer.from('not-a-jpeg'),
        contentType: 'image/jpeg',
      })
    ).rejects.toMatchObject({ name: 'UPLOAD_INVALID_FILE' })
    expect(putObjectMock).not.toHaveBeenCalled()
  })
})
