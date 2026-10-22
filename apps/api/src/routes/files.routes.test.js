import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const assertCleanUploadOwnershipMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../config/env.js', () => ({
  config: { RATE_LIMIT_ENABLED: false, WEB_ORIGINS: [] },
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, _res, next) => next(),
  requireRole: () => (req, _res, next) => next(),
  resolveTenantContext: (req, _res, next) => next(),
  optionalAuth: (req, _res, next) => next(),
  getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
  getRequestTenant: vi.fn().mockResolvedValue({
    tenantId: 'supplier-1',
    tenantType: 'SUPPLIER',
  }),
}))

vi.mock('../lib/object-download-auth.js', () => ({
  verifyObjectAccess: vi.fn(),
}))

vi.mock('../lib/route-permissions.js', () => ({
  filesUploadGuard: (req, _res, next) => next(),
  filesPresignGuard: (req, _res, next) => next(),
}))

vi.mock('../lib/storage-upload.js', () => ({
  meterStorageFromRequest: vi.fn().mockResolvedValue({ ok: true }),
  resolveStorageReservationBytes: (sizeBytes, maxBytes) => Number(sizeBytes) || Number(maxBytes),
}))

vi.mock('../lib/rate-limit-store.js', () => ({
  createRateLimitStore: vi.fn().mockReturnValue(null),
}))

vi.mock('../services/storage/storage.service.js', () => ({
  createPresignedUpload: vi.fn(),
  buildObjectPublicUrl: (fileKey) => `https://api.example.test/api/files/object?key=${fileKey}`,
  getObjectStream: vi.fn(),
}))

vi.mock('../services/storage/upload-security.service.js', () => ({
  completeUploadSession: vi.fn(),
  assertCleanUploadOwnership: (...args) => assertCleanUploadOwnershipMock(...args),
  ensureObjectCleanForRead: vi.fn(),
}))

import { filesRoutes } from './files.routes.js'

describe('file attachment routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.requestId = 'files-test'
      req.userData = { id: 'user-1', role: 'SUPPLIER' }
      next()
    })
    app.use('/api/files', filesRoutes)
  })

  it('uses completed-session MIME and reserved bytes instead of client claims', async () => {
    assertCleanUploadOwnershipMock.mockResolvedValue({
      destination_key: 'uploads/user-1/photo.png',
      content_type: 'image/png',
      max_bytes: 1234,
    })
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'product-1', supplier_id: 'supplier-1' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'attachment-1', type: 'image/png', file_size_bytes: 1234 }],
      })
      .mockResolvedValueOnce({ rows: [] })

    const response = await request(app)
      .post('/api/files/product/product-1/attach')
      .send({
        fileKey: 'uploads/user-1/photo.png',
        fileName: 'photo.png',
        fileType: 'application/pdf',
        fileSize: 1,
        storageMeteredAtPresign: true,
      })
      .expect(201)

    expect(response.body.data.attachment).toMatchObject({
      type: 'image/png',
      file_size_bytes: 1234,
    })
    expect(queryMock.mock.calls[1][1]).toEqual([
      'product-1',
      'https://api.example.test/api/files/object?key=uploads/user-1/photo.png',
      'image/png',
      JSON.stringify({ fileName: 'photo.png', uploadedBy: 'user-1' }),
      1234,
    ])
    expect(String(queryMock.mock.calls[2][0])).toContain('UPDATE product')
  })
})
