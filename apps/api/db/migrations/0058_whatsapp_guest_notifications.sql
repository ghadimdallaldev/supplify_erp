-- WhatsApp channel preference and guest contact email on reservations

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT false;

-- Migrate prior SMS opt-in to WhatsApp (SMS channel deprecated in product UI)
UPDATE notification_preferences
SET whatsapp_enabled = COALESCE(whatsapp_enabled, sms_enabled)
WHERE whatsapp_enabled IS NOT TRUE AND sms_enabled IS TRUE;

ALTER TABLE reservation
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

ALTER TABLE reservation_waitlist
  ADD COLUMN IF NOT EXISTS customer_email TEXT;
