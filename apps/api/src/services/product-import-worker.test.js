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

vi.mock('./product-import.service.js', () => ({
  processProductImportJob: vi.fn(async () => ({ status: 'completed' })),
}))

describe('product-import-worker', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { _clearRunningProductImportJobsForTests } = await import('./product-import-worker.js')
    _clearRunningProductImportJobsForTests()
  })

  it('startProductImportJob does not throw when processProductImportJob is mocked', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [{ pg_advisory_unlock: true }] })

    const { startProductImportJob } = await import('./product-import-worker.js')
    const { processProductImportJob } = await import('./product-import.service.js')

    expect(() => startProductImportJob('job-456')).not.toThrow()

    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))

    expect(processProductImportJob).toHaveBeenCalledWith('job-456')
  })
})
