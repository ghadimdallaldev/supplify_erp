import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';

/**
 * Notification Service
 * Handles sending notifications via email, SMS, push, and in-app
 */

// Email service implementation
const emailService = {
  async send(email, subject, html, text) {
    logger.info('Email sent', { to: process.env.NODE_ENV === 'development' ? email : '[REDACTED]', subject });
    
    // Check if SendGrid is configured
    if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
      try {
        // Import SendGrid dynamically (only if installed)
        const sgMail = await import('@sendgrid/mail').catch(() => null);
        
        if (sgMail) {
          sgMail.default.setApiKey(process.env.SENDGRID_API_KEY);
          
          const msg = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: subject,
            text: text,
            html: html,
          };
          
          await sgMail.default.send(msg);
          logger.info('Email sent via SendGrid');
          return true;
        }
      } catch (error) {
        logger.error('SendGrid error', { error: error.message });
      }
    }
    logger.debug('Email fallback (no SendGrid)', { subject });
    return true;
  }
};

// SMS service implementation
const smsService = {
  async send(phone, message) {
    logger.info('SMS sent', { to: process.env.NODE_ENV === 'development' ? phone : '[REDACTED]' });
    
    // Check if Twilio is configured
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      try {
        // Import Twilio dynamically (only if installed)
        const twilio = await import('twilio').catch(() => null);
        
        if (twilio) {
          const client = twilio.default(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          );
          
          await client.messages.create({
            body: message,
            to: phone,
            from: process.env.TWILIO_PHONE_NUMBER,
          });
          
          logger.info('SMS sent via Twilio');
          return true;
        }
      } catch (error) {
        logger.error('Twilio error', { error: error.message });
      }
    }
    logger.debug('SMS fallback (no Twilio)');
    return true;
  }
};

const whatsappService = {
  async send(phone, message) {
    logger.info('WhatsApp message', { to: process.env.NODE_ENV === 'development' ? phone : '[REDACTED]' });

    if (
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER)
    ) {
      try {
        const twilio = await import('twilio').catch(() => null);

        if (twilio) {
          const client = twilio.default(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          );

          const baseFrom = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER;
          const from = baseFrom.startsWith('whatsapp:') ? baseFrom : `whatsapp:${baseFrom}`;
          const to = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;

          await client.messages.create({
            body: message,
            to,
            from,
          });

          logger.info('WhatsApp message sent via Twilio');
          return true;
        }
      } catch (error) {
        logger.error('Twilio WhatsApp error', { error: error.message });
      }
    }
    logger.debug('WhatsApp fallback (no Twilio)');
    return true;
  }
};

// Push notifications disabled for now
// const pushService = { ... }

const DEFAULT_NOTIFICATION_PREFS = {
  email_enabled: true,
  sms_enabled: true,
  push_enabled: false,
  in_app_enabled: true,
  notify_order_new: true,
  notify_order_acknowledged: true,
  notify_order_processing: true,
  notify_order_shipped: true,
  notify_order_delivered: true,
  notify_order_cancelled: true,
  notify_message_received: true,
  notify_invoice_issued: true,
  notify_invoice_overdue: true,
  notify_payment_received: true,
  notify_low_stock: true,
  notify_out_of_stock: true,
  notify_system_updates: true,
  notify_promotions: true,
  notify_reservation_created: true,
  notify_reservation_waitlist: true,
  notify_staff_pto: true,
  notify_staff_swap: true,
  notify_staff_clock: true,
  notify_staff_announcement: true,
  notify_staff_document: true,
  notify_scheduled_order: true,
};

async function getRestaurantUserContext(restaurantId) {
  const { rows } = await query(
    `
      SELECT r.id AS restaurant_id, r.name AS restaurant_name, u.id AS user_id, u.email
      FROM restaurant r
      JOIN app_user u ON u.email = r.contact_email
      WHERE r.id = $1
    `,
    [restaurantId],
  );
  return rows[0] || null;
}

async function getStaffMemberContext(staffId) {
  const { rows } = await query(
    `
      SELECT m.id, m.display_name, m.role, m.restaurant_id
      FROM staff_member m
      WHERE m.id = $1
    `,
    [staffId],
  );
  return rows[0] || null;
}

function mapPreferencesRow(row) {
  if (!row) return null;
  const entries = Object.entries(row).map(([key, value]) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    return [camelKey, value];
  });
  return Object.fromEntries(entries);
}

/**
 * Ensure notification preferences row exists for a user
 */
export async function ensureNotificationPreferences(userId, userType) {
  const { rows } = await query(
    `
      SELECT *
      FROM notification_preferences
      WHERE user_id = $1 AND user_type = $2
    `,
    [userId, userType],
  );

  if (rows.length) {
    return rows[0];
  }

  const { rows: inserted } = await query(
    `
      INSERT INTO notification_preferences (user_id, user_type)
      VALUES ($1, $2)
      ON CONFLICT (user_id, user_type)
      DO UPDATE SET updated_at = now()
      RETURNING *
    `,
    [userId, userType],
  );

  return inserted[0];
}

/**
 * Get or create notification preferences for a user
 */
export async function getUserPreferences(userId, userType) {
  const row = await ensureNotificationPreferences(userId, userType);
  return mapPreferencesRow({ ...DEFAULT_NOTIFICATION_PREFS, ...row });
}

/**
 * Get user contact information
 */
export async function getUserContactInfo(userId, userType) {
  // userId is the Keycloak user ID from app_user table
  // We need to get the supplier_id or restaurant_id from app_user email
  let tableName = userType === 'SUPPLIER' ? 'supplier_contact_info' : 'restaurant_contact_info';
  let idTable = userType === 'SUPPLIER' ? 'supplier' : 'restaurant';
  let idColumn = userType === 'SUPPLIER' ? 'supplier_id' : 'restaurant_id';

  const { rows } = await query(`
    SELECT ci.* 
    FROM ${tableName} ci
    JOIN ${idTable} s ON s.id = ci.${idColumn}
    JOIN app_user u ON u.email = s.contact_email
    WHERE u.id = $1
  `, [userId]);

  return rows[0] || {
    email: null,
    phone: null,
    email_verified: false,
    phone_verified: false,
  };
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

    // Determine which channels to send to (push disabled for now)
    const channels = {
      email: prefs.email_enabled && contact?.email,
      sms: prefs.sms_enabled && contact?.phone,
      push: false, // Disabled for now
      inApp: prefs.in_app_enabled,
    };

    // Check if this notification type is enabled
    const notificationKey = `notify_${notificationCategory.toLowerCase()}`;
    // If the preference key doesn't exist, default to true (send notification)
    const shouldSend = prefs[notificationKey] !== undefined ? prefs[notificationKey] : true;
    if (!shouldSend) {
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
      referenceId || null,
      referenceType || null,
      metadata ? JSON.stringify(metadata) : null,
      !!channels.email, // Convert to boolean
      !!channels.sms,   // Convert to boolean
      !!channels.push,  // Convert to boolean
      !!channels.inApp, // Convert to boolean
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

    // Push notifications disabled for now
    // if (channels.push && (contact?.fcm_token || contact?.apns_token)) {
    //   try {
    //     await pushService.send(contact.fcm_token, contact.apns_token, title, message, metadata);
    //     results.push = true;
    //   } catch (error) {
    //     logger.error('Push send failed', { error: error.message });
    //   }
    // }

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

export async function sendWhatsAppMessage(phone, message) {
  if (!phone) {
    throw new Error('WhatsApp phone is required');
  }
  return whatsappService.send(phone, message);
}

/**
 * Notify supplier when their warehouse/product stock is low.
 * Call after creating an inventory_alert (e.g. from inventory adjustment).
 */
export async function notifySupplierLowStock({ productId, warehouseId, productName, threshold, currentValue }) {
  const { rows: productRows } = await query(
    `SELECT p.name, p.supplier_id FROM product p WHERE p.id = $1`,
    [productId]
  );
  if (productRows.length === 0) return null;
  const supplierId = productRows[0].supplier_id;
  const name = productName || productRows[0].name;

  const { rows: userRows } = await query(
    `SELECT u.id FROM app_user u JOIN supplier s ON s.contact_email = u.email WHERE s.id = $1`,
    [supplierId]
  );
  if (userRows.length === 0) {
    logger.warn('No app_user found for supplier', { supplierId });
    return null;
  }
  const userId = userRows[0].id;

  const message = `Low stock: ${name}. Current: ${currentValue}, threshold: ${threshold}. Restock soon.`;
  try {
    return await sendNotification({
      userId,
      userType: 'SUPPLIER',
      notificationType: 'LOW_STOCK',
      notificationCategory: 'inventory_alerts',
      title: 'Low stock alert',
      message,
      referenceId: productId,
      referenceType: 'PRODUCT',
      metadata: { productId, warehouseId, threshold, currentValue },
    });
  } catch (err) {
    logger.error('notifySupplierLowStock failed', { error: err.message, productId });
    return null;
  }
}

/**
 * Helper functions for common notification types
 */

export async function notifyOrderStatusChange(order, status) {
  // Determine who to notify
  let userId, userType;
  
  if (status === 'PLACED' || status === 'CANCELLED') {
    // Notify supplier for new orders and cancellations
    // Get supplier's Keycloak user ID from contact_email
    const { rows: suppliers } = await query(`
      SELECT s.id as supplier_id, u.id as user_id 
      FROM supplier s
      JOIN app_user u ON u.email = s.contact_email
      WHERE s.id = $1
    `, [order.supplier_id]);
    
    if (suppliers.length > 0 && suppliers[0].user_id) {
      userId = suppliers[0].user_id;
      userType = 'SUPPLIER';
    } else {
      logger.warn('No user_id found for supplier', { supplier_id: order.supplier_id });
      return null;
    }
  } else {
    // All other statuses (ACKNOWLEDGED, PROCESSING, SHIPPED, DELIVERED) notify restaurant
    // Get restaurant's Keycloak user ID from contact_email
    const { rows: restaurants } = await query(`
      SELECT r.id as restaurant_id, u.id as user_id 
      FROM restaurant r
      JOIN app_user u ON u.email = r.contact_email
      WHERE r.id = $1
    `, [order.restaurant_id]);
    
    if (restaurants.length > 0 && restaurants[0].user_id) {
      userId = restaurants[0].user_id;
      userType = 'RESTAURANT';
    } else {
      logger.warn('No user_id found for restaurant', { restaurant_id: order.restaurant_id });
      return null;
    }
  }

  const messages = {
    PLACED: {
      title: 'New Order Received',
      message: order.restaurant_name 
        ? `New order from ${order.restaurant_name} - Order #${order.id.slice(0, 8)} for $${order.total_amount}`
        : `New order #${order.id.slice(0, 8)} for $${order.total_amount}`,
    },
    ACKNOWLEDGED: {
      title: 'Order Acknowledged',
      message: `Your order #${order.id.slice(0, 8)} has been acknowledged by ${order.supplier_name || 'supplier'}`,
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
    COMPLETED: {
      title: 'Order Completed',
      message: `Your order #${order.id.slice(0, 8)} has been completed and delivered by ${order.supplier_name || 'supplier'}`,
    },
    CANCELLED: {
      title: 'Order Cancelled',
      message: order.restaurant_name
        ? `Order #${order.id.slice(0, 8)} from ${order.restaurant_name} has been cancelled`
        : `Order #${order.id.slice(0, 8)} has been cancelled`,
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

export async function notifyReservationCreated(reservation) {
  const restaurantId = reservation.restaurant_id || reservation.restaurantId;
  const branchId = reservation.branch_id || reservation.branchId || null;
  const customerName = reservation.customer_name || reservation.customerName || 'Guest';
  const partySize = reservation.party_size || reservation.partySize || 0;
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt;
  const status = reservation.status || reservation.reservationStatus;

  const context = await getRestaurantUserContext(restaurantId);
  if (!context?.user_id) return null;

  const timeslot = scheduledAt ? new Date(scheduledAt).toLocaleString() : 'unscheduled time';
  return sendNotification({
    userId: context.user_id,
    userType: 'RESTAURANT',
    notificationType: 'RESERVATION_CREATED',
    notificationCategory: 'RESERVATION_CREATED',
    title: 'New reservation booked',
    message: `${customerName} party of ${partySize} for ${timeslot}`,
    referenceId: reservation.id || reservation.reservationId,
    referenceType: 'RESERVATION',
    metadata: {
      restaurantId,
      branchId,
      partySize,
      scheduledAt,
      status,
    },
  });
}

export async function notifyReservationWaitlist(reservation) {
  const restaurantId = reservation.restaurant_id || reservation.restaurantId;
  const branchId = reservation.branch_id || reservation.branchId || null;
  const customerName = reservation.customer_name || reservation.customerName || 'Guest';
  const partySize = reservation.party_size || reservation.partySize || 0;
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt;
  const status = reservation.status || reservation.reservationStatus;

  const context = await getRestaurantUserContext(restaurantId);
  if (!context?.user_id) return null;

  return sendNotification({
    userId: context.user_id,
    userType: 'RESTAURANT',
    notificationType: 'RESERVATION_WAITLIST',
    notificationCategory: 'RESERVATION_WAITLIST',
    title: 'Reservation moved to waitlist',
    message: `${customerName} is waiting for a table (${partySize} guests).`,
    referenceId: reservation.id || reservation.reservationId,
    referenceType: 'RESERVATION',
    metadata: {
      restaurantId,
      branchId,
      partySize,
      scheduledAt,
      status,
    },
  });
}

export async function notifyStaffPtoRequest(ptoRequest) {
  const staffId = ptoRequest.staff_id || ptoRequest.staffId;
  const staffContext = await getStaffMemberContext(staffId);
  if (!staffContext) return null;
  const restaurantContext = await getRestaurantUserContext(staffContext.restaurant_id);
  if (!restaurantContext?.user_id) return null;

  const startDate = ptoRequest.start_date || ptoRequest.startDate;
  const endDate = ptoRequest.end_date || ptoRequest.endDate;
  const type = ptoRequest.type || ptoRequest.requestType || 'PTO';
  const status = ptoRequest.status || ptoRequest.requestStatus;
  const dateRange = `${startDate} → ${endDate}`;
  return sendNotification({
    userId: restaurantContext.user_id,
    userType: 'RESTAURANT',
    notificationType: 'STAFF_PTO_REQUEST',
    notificationCategory: 'STAFF_PTO',
    title: 'New PTO request submitted',
    message: `${staffContext.display_name || 'Team member'} requested ${type} (${dateRange})`,
    referenceId: ptoRequest.id || ptoRequest.requestId,
    referenceType: 'STAFF_PTO',
    metadata: {
      staffId,
      restaurantId: staffContext.restaurant_id,
      status,
      startDate,
      endDate,
    },
  });
}

export async function notifyStaffSwapRequest(swap) {
  const requestedBy = swap.requested_by || swap.requestedBy;
  const restaurantId = swap.restaurant_id || swap.restaurantId;
  const shift = swap.shift || {};

  const staffContext = await getStaffMemberContext(requestedBy);
  if (!staffContext) return null;

  const restaurantContext = await getRestaurantUserContext(restaurantId || staffContext.restaurant_id);
  if (!staffContext) return null;
  if (!restaurantContext?.user_id) return null;

  const shiftDate = shift.date || swap.shift_date || 'upcoming shift';

  return sendNotification({
    userId: restaurantContext.user_id,
    userType: 'RESTAURANT',
    notificationType: 'STAFF_SWAP_REQUEST',
    notificationCategory: 'STAFF_SWAP',
    title: 'Shift swap requested',
    message: `${staffContext.display_name || 'Team member'} requested a swap for ${shiftDate}`,
    referenceId: swap.id || swap.swapId,
    referenceType: 'STAFF_SWAP',
    metadata: {
      staffId: staffContext.id,
      restaurantId: restaurantId || staffContext.restaurant_id,
      shiftId: swap.shift_id || shift.id,
      status: swap.status,
    },
  });
}

export async function notifyScheduledOrderEvent(quickList, action) {
  const restaurantId = quickList.restaurant_id || quickList.restaurantId;
  const context = await getRestaurantUserContext(restaurantId);
  if (!context?.user_id) return null;

  const autoMessage =
    action === 'EXECUTED'
      ? `Scheduled order "${quickList.name}" has been created automatically.`
      : `Scheduled order "${quickList.name}" will run soon. Review inventory if you need to pause it.`;

  return sendNotification({
    userId: context.user_id,
    userType: 'RESTAURANT',
    notificationType: 'SCHEDULED_ORDER',
    notificationCategory: 'SCHEDULED_ORDER',
    title: action === 'EXECUTED' ? 'Scheduled order executed' : 'Scheduled order reminder',
    message: autoMessage,
    referenceId: quickList.id,
    referenceType: 'QUICK_LIST',
    metadata: {
      quickListId: quickList.id,
      autoCreate: quickList.auto_create_order,
      nextExecutionDate: quickList.next_execution_date,
    },
  });
}

export async function notifyInvoiceIssued(invoice) {
  // Notify restaurant
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

export async function notifyPaymentReceived(payment) {
  // Notify supplier when payment is received
  // Note: payment object should contain invoice with supplier_id
  if (payment.invoice?.supplier_id) {
    return sendNotification({
      userId: payment.invoice.supplier_id,
      userType: 'SUPPLIER',
      notificationType: 'PAYMENT',
      notificationCategory: 'payment_received',
      title: 'Payment Received',
      message: `Payment of $${payment.payment_amount} received for invoice ${payment.invoice_number || payment.invoice_id.slice(0, 8)}`,
      referenceId: payment.invoice_id,
      referenceType: 'INVOICE',
      metadata: { payment_id: payment.id, amount: payment.payment_amount },
    });
  }
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

