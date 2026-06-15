-- Migration: 0174_platform_setting_seed_fix.sql
-- Fix 0169 free_sandbox_days seed clobbering admin-edited values on re-run.
-- 0169 used ON CONFLICT DO UPDATE; use DO NOTHING so existing admin values are preserved.

INSERT INTO platform_setting (key, value, updated_at)
VALUES ('free_sandbox_days', '30'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
