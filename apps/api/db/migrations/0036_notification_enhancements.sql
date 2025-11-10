-- Migration: 0036_notification_enhancements.sql
-- Description: Extend notification preferences with reservations, staff, and scheduling events

ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS notify_reservation_created BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_reservation_waitlist BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_staff_pto BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_staff_swap BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_staff_clock BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_staff_announcement BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_staff_document BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_scheduled_order BOOLEAN DEFAULT true;


