-- apps/api/db/migrations/0060_fix_notification_plan_feature_strings.sql
-- Rename deprecated SMS labels to WhatsApp in subscription plan features.
-- Gold: email_and_sms → email_and_whatsapp
-- Platinum: email_sms_webhook → email_whatsapp_webhook

UPDATE subscription_plan
SET features = jsonb_set(features, '{notifications}', '"email_and_whatsapp"')
WHERE code IN ('gold', 'enterprise')
  AND features->>'notifications' = 'email_and_sms';

UPDATE subscription_plan
SET features = jsonb_set(features, '{notifications}', '"email_whatsapp_webhook"')
WHERE code = 'platinum'
  AND features->>'notifications' = 'email_sms_webhook';
