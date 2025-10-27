import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';

/**
 * Notification Service
 * Handles sending notifications via email, SMS, push, and in-app
 */

// Channel implementations (stubs for now)
const emailService = {
  async send(email, subject, html, text) {
    logger.info('Email sent', { to: email, subject });
    // TODO: Integrate with SendGrid, SES, or similar
    return true;
  }
};

const smsService = {
  async send(phone, message) {
    logger.info('SMS sent', { to: phone, message });
    // TODO: Integrate with Twilio, Nexmo, or similar
    return true;
  }
};

const pushService = {
  async send(fcmToken, apnsToken, title, body, data) {
    logger.info('Push sent', { title, body });
    // TODO: Integrate with FCM/APNS
    return true;
  }
};

/**
 * Get or create notification preferences for a user
 */
export async function getUserPreferences(userId, userType) {
  const { rows } = await query(`
    SELECT * FROM notification_preferences
    WHERE user_id = $1 AND user_type = $2
  `, [userId, userType]);

  if (rows.length > 0) {
    return rows[0];
  }

  // Create default preferences
  const { rows: [prefs] } = await query(`
    INSERT INTO notification_preferences (
      user_id, user_type, 
      email_enabled, sms_enabled, push_enabled, in_app_enabled
    ) VALUES ($1, $2, true, false, true, true)
    RETURNING *
  `, [userId, userType]);

  return prefs;
}

/**
 * Get user contact information
 */
export async function getUserContactInfo(userId, userType) {
  let tableName = userType === 'SUPPLIER' ? 'supplier_contact_info' : 'restaurant_contact_info';
  let idColumn = userType === 'SUPPLIER' ? 'supplier_id' : 'restaurant_id';

  const { rows } = await query(`
    SELECT * FROM ${tableName}
    WHERE ${idColumn} = $1
  `, [userId]);

  return rows[0] || null;
}

/**
 * Send a notification to a user
 */
export async function sendNotification({
  userId,
  userType,
  notificationType,
  notificationCategory,
  title,
  message,
  referenceId = null,
  referenceType = null,
  metadata = null,
}) {
  try {
    // Get user preferences
    const prefs = await getUserPreferences(userId, userType);
    const contact = await getUserContactInfo(userId, userType);

    // Determine which channels to send to
    const channels = {
      email: prefs.email_enabled && contact?.email,
      sms: prefs.sms_enabled && contact?.phone,
      push: prefs.push_enabled && (contact?.fcm_token || contact?.apns_token),
      inApp: prefs.in_app_enabled,
    };

    // Check if this notification type is enabled
    const notificationKey = `notify_${notificationCategory.toLowerCase()}`;
    if (!prefs[notificationKey]) {
      logger.info('Notification skipped due to user preference', { userId, notificationCategory });
      return null;
    }

    // Log notification
    const { rows: [notification] } = await query(`
      INSERT INTO notification_log (
        user_id, user_type, notification_type, notification_category,
        title, message, reference_id, reference_type, metadata,
        email_sent, sms_sent, push_sent, in_app_sent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      userId,
      userType,
      notificationType,
      notificationCategory,
      title,
      message,
      referenceId,
      referenceType,
      metadata ? JSON.stringify(metadata) : null,
      channels.email,
      channels.sms,
      channels.push,
      channels.inApp,
    ]);

    // Send via enabled channels
    const results = {
      email: false,
      sms: false,
      push: false,
      inApp: true,
    };

    if (channels.email && contact?.email) {
      try {
        await emailService.send(contact.email, title, null, message);
        results.email = true;
      } catch (error) {
        logger.error('Email send failed', { error: error.message });
      }
    }

    if (channels.sms && contact?.phone) {
      try {
        await smsService.send(contact.phone, message);
        results.sms = true;
      } catch (error) {
        logger.error('SMS send failed', { error: error.message });
      }
    }

    if (channels.push && (contact?.fcm_token || contact?.apns_token)) {
      try {
        await pushService.send(contact.fcm_token, contact.apns_token, title, message, metadata);
        results.push = true;
      } catch (error) {
        logger.error('Push send failed', { error: error.message });
      }
    }

    // Update notification log with actual send results
    await query(`
      UPDATE notification_log
      SET email_sent = $1, sms_sent = $2, push_sent = $3
      WHERE id = $4
    `, [results.email, results.sms, results.push, notification.id]);

    logger.info('Notification sent', {
      userId,
      notificationType,
      notificationCategory,
      channels: results,
    });

    return notification;
  } catch (error) {
    logger.error('Failed to send notification', {
      error: error.message,
      userId,
      notificationCategory,
    });
    throw error;
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId) {
  await query(`
    UPDATE notification_log
    SET is_read = true, read_at = now()
    WHERE id = $1
  `, [notificationId]);
}

/**
 * Get user's notifications
 */
export async function getUserNotifications(userId, userType, { limit = 50, offset = 0, unreadOnly = false }) {
  let whereClause = 'user_id = $1 AND user_type = $2';
  const params = [userId, userType];
  let paramIndex = 3;

  if (unreadOnly) {
    whereClause += ` AND is_read = false`;
  }

  const { rows } = await query(`
    SELECT *
    FROM notification_log
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, limit, offset]);

  // Get unread count
  const { rows: countRows } = await query(`
    SELECT COUNT(*) as count
    FROM notification_log
    WHERE user_id = $1 AND user_type = $2 AND is_read = false
  `, [userId, userType]);

  return {
    notifications: rows,
    unreadCount: parseInt(countRows[0].count, 10),
  };
}

/**
 * Helper functions for common notification types
 */

export async function notifyOrderStatusChange(order, status) {
  const userId = status === 'PLACED' || status === 'CANCELLED' ? order.supplier_id : order.restaurant_id;
  const userType = status === 'PLACED' || status === 'CANCELLED' ? 'SUPPLIER' : 'RESTAURANT';
  
  const messages = {
    PLACED: {
      title: 'New Order Received',
      message: `Order #${order.id.slice(0, 8)} has been placed for $${order.total_amount}`,
    },
    ACKNOWLEDGED: {
      title: 'Order Acknowledged',
      message: `Your order #${order.id.slice(0, 8)} has been acknowledged by ${order.supplier_name}`,
    },
    PROCESSING: {
      title: 'Order Processing',
      message: `Your order #${order.id.slice(0, 8)} is being prepared for shipping`,
    },
    SHIPPED: {
      title: 'Order Shipped',
      message: `Your order #${order.id.slice(0, 8)} has been shipped`,
    },
    DELIVERED: {
      title: 'Order Delivered',
      message: `Your order #${order.id.slice(0, 8)} has been delivered`,
    },
    CANCELLED: {
      title: 'Order Cancelled',
      message: `Order #${order.id.slice(0, 8)} has been cancelled`,
    },
  };

  const msg = messages[status];
  if (!msg) return;

  return sendNotification({
    userId,
    userType,
    notificationType: 'ORDER',
    notificationCategory: status,
    title: msg.title,
    message: msg.message,
    referenceId: order.id,
    referenceType: 'ORDER',
    metadata: { order_id: order.id, status },
  });
}

export async function notifyInvoiceIssued(invoice) {
  return sendNotification({
    userId: invoice.restaurant_id,
    userType: 'RESTAURANT',
    notificationType: 'INVOICE',
    notificationCategory: 'invoice_issued',
    title: 'Invoice Issued',
    message: `Invoice ${invoice.invoice_number} for $${invoice.total_amount} due ${invoice.due_date}`,
    referenceId: invoice.id,
    referenceType: 'INVOICE',
    metadata: { invoice_number: invoice.invoice_number, total_amount: invoice.total_amount },
  });
}

export async function notifyLowStock(product, currentStock, threshold) {
  return sendNotification({
    userId: product.restaurant_id,
    userType: 'RESTAURANT',
    notificationType: 'INVENTORY',
    notificationCategory: 'low_stock',
    title: 'Low Stock Alert',
    message: `${product.name} is below threshold. Current: ${currentStock}, Threshold: ${threshold}`,
    referenceId: product.product_id,
    referenceType: 'PRODUCT',
    metadata: { product_name: product.name, current_stock: currentStock, threshold },
  });
}

