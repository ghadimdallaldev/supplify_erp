-- Deactivate enterprise plans — not exposed in any public tier.
-- Existing enterprise subscribers are unaffected; plan is simply no longer selectable.
UPDATE subscription_plan
SET is_active = false,
    updated_at = now()
WHERE code = 'enterprise';
