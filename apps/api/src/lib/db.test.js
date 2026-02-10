import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { query, withTransaction, pool } from './db.js';

vi.mock('pg', () => ({
  Pool: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Database Utilities', () => {
  let mockPool;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    mockPool = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(mockClient),
      on: vi.fn(),
    };

    Pool.mockImplementation(() => mockPool);
  });

  describe('query', () => {
    it('should execute query and return results', async () => {
      const mockResult = {
        rows: [{ id: '1', name: 'Test' }],
        rowCount: 1,
      };

      mockPool.query.mockResolvedValue(mockResult);

      const result = await query('SELECT * FROM test', []);

      expect(result).toEqual(mockResult);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test', []);
    });

    it('should handle query errors', async () => {
      const error = new Error('Database error');
      error.code = '42P01'; // Table not found

      mockPool.query.mockRejectedValue(error);

      await expect(query('SELECT * FROM nonexistent', [])).rejects.toThrow();
    });

    it('should log query execution time', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockPool.query.mockResolvedValue(mockResult);

      await query('SELECT 1', []);

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('withTransaction', () => {
    it('should execute function within transaction', async () => {
      const mockResult = { id: '1' };
      const mockFn = vi.fn().mockResolvedValue(mockResult);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // COMMIT
        .mockResolvedValueOnce({}); // Release

      const result = await withTransaction(mockFn);

      expect(result).toEqual(mockResult);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const error = new Error('Transaction error');
      const mockFn = vi.fn().mockRejectedValue(error);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(withTransaction(mockFn)).rejects.toThrow(error);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
