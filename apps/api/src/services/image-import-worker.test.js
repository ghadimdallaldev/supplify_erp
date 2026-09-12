import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
}

vi.mock('../lib/db.js', () => ({
  pool: {
    connect: vi.fn(async () => mockClient),
  },
}))

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('./product-image-import.service.js', () => ({
  processImageImportJob: vi.fn(async () => ({ status: 'completed' })),
}))

describe('image-import-worker', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { _clearRunningImageImportJobsForTests } = await import('./image-import-worker.js')
    _clearRunningImageImportJobsForTests()
  })

  it('startImageImportJob does not throw when processImageImportJob is mocked', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [{ pg_advisory_unlock: true }] })

    const { startImageImportJob } = await import('./image-import-worker.js')
    const { processImageImportJob } = await import('./product-image-import.service.js')

    expect(() => startImageImportJob('job-123')).not.toThrow()

    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))

    expect(processImageImportJob).toHaveBeenCalledWith('job-123')
  })
})
