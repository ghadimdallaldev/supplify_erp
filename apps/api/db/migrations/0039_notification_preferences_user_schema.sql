-- Migration: 0039_notification_preferences_user_schema.sql
-- Description: Recreate notification_preferences with user_id/user_type schema.
-- 0015 created the table with restaurant_id; 0020 used IF NOT EXISTS so it never ran.
-- This migration drops and recreates the table so the notification service (user_id, user_type) works.

DROP TABLE IF EXISTS notification_preferences CASCADE;

CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('SUPPLIER', 'RESTAURANT', 'ADMIN')),

  -- Notification channels
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  push_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,

  -- Notification types
  notify_order_new BOOLEAN DEFAULT true,
  notify_order_acknowledged BOOLEAN DEFAULT true,
  notify_order_processing BOOLEAN DEFAULT true,
  notify_order_shipped BOOLEAN DEFAULT true,
  notify_order_delivered BOOLEAN DEFAULT true,
  notify_order_cancelled BOOLEAN DEFAULT true,
  notify_message_received BOOLEAN DEFAULT true,
  notify_message_mention BOOLEAN DEFAULT true,
  notify_invoice_issued BOOLEAN DEFAULT true,
  notify_invoice_overdue BOOLEAN DEFAULT true,
  notify_payment_received BOOLEAN DEFAULT true,
  notify_low_stock BOOLEAN DEFAULT true,
  notify_out_of_stock BOOLEAN DEFAULT true,
  notify_system_updates BOOLEAN DEFAULT true,
  notify_promotions BOOLEAN DEFAULT true,
  -- 0036 enhancements
  notify_reservation_created BOOLEAN DEFAULT true,
  notify_reservation_waitlist BOOLEAN DEFAULT true,
  notify_staff_pto BOOLEAN DEFAULT true,
  notify_staff_swap BOOLEAN DEFAULT true,
  notify_staff_clock BOOLEAN DEFAULT true,
  notify_staff_announcement BOOLEAN DEFAULT true,
  notify_staff_document BOOLEAN DEFAULT true,
  notify_scheduled_order BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, user_type)
);

CREATE INDEX idx_notification_preferences_user ON notification_preferences(user_id, user_type);

-- GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO api_user;

COMMENT ON TABLE notification_preferences IS 'User preferences for notification channels and types (user_id = app_user.id)';
