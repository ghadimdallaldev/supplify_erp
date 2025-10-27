-- Migration: 0020_notifications.sql
-- Description: Notification system with user preferences for suppliers and restaurants

-- Notification preferences table for users to control what notifications they receive
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('SUPPLIER', 'RESTAURANT', 'ADMIN')),
  
  -- Notification channels
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  push_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  
  -- Notification types (can be expanded)
  -- ORDER notifications
  notify_order_new BOOLEAN DEFAULT true,
  notify_order_acknowledged BOOLEAN DEFAULT true,
  notify_order_processing BOOLEAN DEFAULT true,
  notify_order_shipped BOOLEAN DEFAULT true,
  notify_order_delivered BOOLEAN DEFAULT true,
  notify_order_cancelled BOOLEAN DEFAULT true,
  
  -- CHAT notifications
  notify_message_received BOOLEAN DEFAULT true,
  notify_message_mention BOOLEAN DEFAULT true,
  
  -- INVOICE notifications
  notify_invoice_issued BOOLEAN DEFAULT true,
  notify_invoice_overdue BOOLEAN DEFAULT true,
  notify_payment_received BOOLEAN DEFAULT true,
  
  -- INVENTORY notifications
  notify_low_stock BOOLEAN DEFAULT true,
  notify_out_of_stock BOOLEAN DEFAULT true,
  
  -- GENERAL notifications
  notify_system_updates BOOLEAN DEFAULT true,
  notify_promotions BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, user_type)
);

-- Notifications table to store all notifications sent
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type TEXT NOT NULL,
  
  -- Notification details
  notification_type TEXT NOT NULL, -- ORDER, CHAT, INVOICE, SYSTEM, etc.
  notification_category TEXT NOT NULL, -- NEW_ORDER, ORDER_SHIPPED, etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Channels attempted
  email_sent BOOLEAN DEFAULT false,
  sms_sent BOOLEAN DEFAULT false,
  push_sent BOOLEAN DEFAULT false,
  in_app_sent BOOLEAN DEFAULT true,
  
  -- Reference
  reference_id UUID, -- order_id, invoice_id, etc.
  reference_type TEXT,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB, -- Additional data
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Supplier-specific contact info for notifications
CREATE TABLE IF NOT EXISTS supplier_contact_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES supplier(id) ON DELETE CASCADE NOT NULL,
  
  -- Contact info
  email TEXT NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  phone TEXT,
  phone_verified BOOLEAN DEFAULT false,
  
  -- Push tokens (for mobile apps)
  fcm_token TEXT, -- Firebase Cloud Messaging
  apns_token TEXT, -- Apple Push Notification Service
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(supplier_id)
);

-- Restaurant-specific contact info for notifications
CREATE TABLE IF NOT EXISTS restaurant_contact_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurant(id) ON DELETE CASCADE NOT NULL,
  
  -- Contact info
  email TEXT NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  phone TEXT,
  phone_verified BOOLEAN DEFAULT false,
  
  -- Push tokens (for mobile apps)
  fcm_token TEXT,
  apns_token TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(restaurant_id)
);

-- Create indexes for performance
CREATE INDEX idx_notification_preferences_user ON notification_preferences(user_id, user_type);
CREATE INDEX idx_notification_log_user ON notification_log(user_id, user_type, is_read);
CREATE INDEX idx_notification_log_created ON notification_log(created_at DESC);
CREATE INDEX idx_notification_log_reference ON notification_log(reference_id, reference_type);
CREATE INDEX idx_supplier_contact_supplier ON supplier_contact_info(supplier_id);
CREATE INDEX idx_restaurant_contact_restaurant ON restaurant_contact_info(restaurant_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_log TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_contact_info TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON restaurant_contact_info TO api_user;

-- Create updated_at trigger for notification_preferences
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

-- Create updated_at trigger for supplier_contact_info
CREATE OR REPLACE FUNCTION update_supplier_contact_info_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_supplier_contact_info_updated_at
  BEFORE UPDATE ON supplier_contact_info
  FOR EACH ROW
  EXECUTE FUNCTION update_supplier_contact_info_updated_at();

-- Create updated_at trigger for restaurant_contact_info
CREATE OR REPLACE FUNCTION update_restaurant_contact_info_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_restaurant_contact_info_updated_at
  BEFORE UPDATE ON restaurant_contact_info
  FOR EACH ROW
  EXECUTE FUNCTION update_restaurant_contact_info_updated_at();

COMMENT ON TABLE notification_preferences IS 'User preferences for notification channels and types';
COMMENT ON TABLE notification_log IS 'Log of all notifications sent to users';
COMMENT ON TABLE supplier_contact_info IS 'Supplier contact information for notifications';
COMMENT ON TABLE restaurant_contact_info IS 'Restaurant contact information for notifications';

