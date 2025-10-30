-- Migration: 0025_order_reminders.sql
-- Description: Add order reminder tracking columns

ALTER TABLE customer_order 
ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

COMMENT ON COLUMN customer_order.last_reminder_sent_at IS 'Timestamp of when the last reminder was sent to supplier';
COMMENT ON COLUMN customer_order.reminder_count IS 'Total number of reminders sent for this order';

