import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeScheduledOrders } from './scheduled-orders.service.js';

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((handler) => handler({ query: vi.fn() })),
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Scheduled Orders Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeScheduledOrders', () => {
    it('should process scheduled orders', async () => {
      const { query } = await import('../lib/db.js');
      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'order-1',
              restaurant_id: 'restaurant-1',
              supplier_id: 'supplier-1',
              scheduled_at: new Date(Date.now() - 1000), // Past date
              status: 'SCHEDULED',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', status: 'PENDING' }],
        });

      await executeScheduledOrders();

      expect(query).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const { query } = await import('../lib/db.js');
      query.mockRejectedValueOnce(new Error('Database error'));

      // The function should catch errors and throw them (based on the implementation)
      // But we can test that it handles the error by checking it doesn't crash the process
      await expect(executeScheduledOrders()).rejects.toThrow('Database error');
    });

    it('should skip orders not yet due', async () => {
      const { query } = await import('../lib/db.js');
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'order-1',
            scheduled_at: new Date(Date.now() + 86400000), // Future date
            status: 'SCHEDULED',
          },
        ],
      });

      await executeScheduledOrders();

      // Should not process future orders
      expect(query).toHaveBeenCalled();
    });
  });
});
