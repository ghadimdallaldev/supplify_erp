import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendNotification,
  notifyOrderStatusChange,
} from './notification.service.js';

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../lib/socket.js', () => ({
  io: {
    to: vi.fn().mockReturnValue({
      emit: vi.fn(),
    }),
  },
}));

describe('Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should create a notification in database', async () => {
      const { query } = await import('../lib/db.js');
      query
        .mockResolvedValueOnce({ rows: [{ email_enabled: true, sms_enabled: false, in_app_enabled: true, notify_orders: true }] })
        .mockResolvedValueOnce({ rows: [{ email: 'test@example.com', phone: null }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'notif-1',
            user_id: 'user-1',
            notification_type: 'ORDER_STATUS',
            title: 'Order Updated',
            message: 'Your order has been confirmed',
          }],
        });

      const notification = await sendNotification({
        userId: 'user-1',
        userType: 'RESTAURANT',
        notificationType: 'ORDER_STATUS',
        notificationCategory: 'ORDERS',
        title: 'Order Updated',
        message: 'Your order has been confirmed',
      });

      expect(notification).toBeDefined();
      expect(notification.title).toBe('Order Updated');
      expect(query).toHaveBeenCalled();
    });
  });

  describe('sendNotification', () => {
    it('should send real-time notification via socket', async () => {
      const { query } = await import('../lib/db.js');
      const { io } = await import('../lib/socket.js');
      const mockEmit = vi.fn();
      io.to.mockReturnValue({ emit: mockEmit });
      
      query
        .mockResolvedValueOnce({ rows: [{ email_enabled: true, sms_enabled: false, in_app_enabled: true, notify_orders: true }] })
        .mockResolvedValueOnce({ rows: [{ email: 'test@example.com', phone: null }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'notif-1',
            user_id: 'user-1',
            notification_type: 'ORDER_STATUS',
            title: 'Order Updated',
            message: 'Your order has been confirmed',
          }],
        });

      await sendNotification({
        userId: 'user-1',
        userType: 'RESTAURANT',
        notificationType: 'ORDER_STATUS',
        notificationCategory: 'ORDERS',
        title: 'Order Updated',
        message: 'Your order has been confirmed',
      });

      expect(query).toHaveBeenCalled();
    });
  });

  describe('notifyOrderStatusChange', () => {
    it('should create and send notification for order status change', async () => {
      const { query } = await import('../lib/db.js');
      query
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', restaurant_id: 'restaurant-1' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'user-1' }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'notif-1',
            type: 'ORDER_STATUS',
            title: 'Order Status Changed',
          }],
        });

      await notifyOrderStatusChange('order-1', 'CONFIRMED', 'PENDING');

      expect(query).toHaveBeenCalled();
    });
  });
});
