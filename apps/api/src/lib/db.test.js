import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock pg before importing db.js - use factory function
vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  }

  const mockPool = {
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue(mockClient),
    on: vi.fn(), // Add on method for event listeners
  }

  return {
    Pool: vi.fn(() => mockPool),
    __mockPool: mockPool,
    __mockClient: mockClient,
  }
})

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

// Import after mocks are set up
import { query, withTransaction, withSavepoint } from './db.js'
import { __mockPool as mockPool, __mockClient as mockClient } from 'pg'

describe('Database Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPool.connect.mockResolvedValue(mockClient)
  })

  describe('query', () => {
    it('should execute query and return results', async () => {
      const mockResult = {
        rows: [{ id: '1', name: 'Test' }],
        rowCount: 1,
      }

      mockPool.query.mockResolvedValue(mockResult)

      const result = await query('SELECT * FROM test', [])

      expect(result).toEqual(mockResult)
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test', [])
    })

    it('should handle query errors', async () => {
      const error = new Error('Database error')
      error.code = '42P01' // Table not found

      mockPool.query.mockRejectedValue(error)

      await expect(query('SELECT * FROM nonexistent', [])).rejects.toThrow()
    })

    it('should log query execution time', async () => {
      const mockResult = { rows: [], rowCount: 0 }
      mockPool.query.mockResolvedValue(mockResult)

      await query('SELECT 1', [])

      expect(mockPool.query).toHaveBeenCalled()
    })
  })

  describe('withTransaction', () => {
    it('should execute function within transaction', async () => {
      const mockResult = { id: '1' }
      const mockFn = vi.fn().mockResolvedValue(mockResult)

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // COMMIT
        .mockResolvedValueOnce({}) // Release

      const result = await withTransaction(mockFn)

      expect(result).toEqual(mockResult)
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
      expect(mockClient.release).toHaveBeenCalled()
    })

    it('should rollback on error', async () => {
      const error = new Error('Transaction error')
      const mockFn = vi.fn().mockRejectedValue(error)

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // ROLLBACK

      await expect(withTransaction(mockFn)).rejects.toThrow(error)

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClient.release).toHaveBeenCalled()
    })
  })

  describe('withSavepoint', () => {
    it('creates and releases a savepoint on success', async () => {
      const client = { query: vi.fn().mockResolvedValue({}) }
      const result = await withSavepoint(client, async () => 'ok', 'my_sp')
      expect(result).toBe('ok')
      expect(client.query.mock.calls.map((c) => c[0])).toEqual([
        'SAVEPOINT my_sp',
        'RELEASE SAVEPOINT my_sp',
      ])
    })

    it('rolls back to the savepoint and rethrows on error', async () => {
      const client = { query: vi.fn().mockResolvedValue({}) }
      const boom = new Error('boom')
      await expect(
        withSavepoint(
          client,
          async () => {
            throw boom
          },
          'my_sp'
        )
      ).rejects.toBe(boom)
      expect(client.query.mock.calls.map((c) => c[0])).toEqual([
        'SAVEPOINT my_sp',
        'ROLLBACK TO SAVEPOINT my_sp',
      ])
    })

    it('generates a safe unique identifier when no name is given', async () => {
      const client = { query: vi.fn().mockResolvedValue({}) }
      await withSavepoint(client, async () => {})
      await withSavepoint(client, async () => {})
      const names = client.query.mock.calls
        .map((c) => c[0])
        .filter((q) => q.startsWith('SAVEPOINT '))
        .map((q) => q.slice('SAVEPOINT '.length))
      expect(names).toHaveLength(2)
      for (const n of names) expect(n).toMatch(/^sp_[a-z0-9_]+$/)
      expect(names[0]).not.toBe(names[1])
    })

    it('rejects an unsafe savepoint name without querying', async () => {
      const client = { query: vi.fn() }
      await expect(withSavepoint(client, async () => {}, 'x; DROP TABLE a')).rejects.toThrow(
        /Invalid savepoint name/
      )
      expect(client.query).not.toHaveBeenCalled()
    })
  })
})
