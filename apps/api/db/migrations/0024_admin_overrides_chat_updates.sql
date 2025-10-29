-- Migration: Admin Overrides and Chat Updates
-- Adds tenant limit overrides table and chat admin features

-- ========================================
-- TENANT LIMIT OVERRIDES
-- ========================================
CREATE TABLE IF NOT EXISTS tenant_limit_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  limit_type TEXT NOT NULL, -- e.g., 'branches', 'warehouses', 'products', 'orders_per_day'
  override_value INTEGER NOT NULL,
  expiration_date TIMESTAMP,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, tenant_type, limit_type)
);

CREATE INDEX IF NOT EXISTS idx_override_tenant ON tenant_limit_override(tenant_id, tenant_type);
CREATE INDEX IF NOT EXISTS idx_override_expiration ON tenant_limit_override(expiration_date) WHERE expiration_date IS NOT NULL;

-- ========================================
-- UPDATE CONVERSATION TABLE
-- ========================================

-- Add is_admin_conversation field if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation' AND column_name = 'is_admin_conversation'
  ) THEN
    ALTER TABLE conversation ADD COLUMN is_admin_conversation BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add is_admin_message field to message if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'message' AND column_name = 'is_admin_message'
  ) THEN
    ALTER TABLE message ADD COLUMN is_admin_message BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Update conversation_participant to support ADMIN role
DO $$
BEGIN
  -- Check if role column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_participant' AND column_name = 'role'
  ) THEN
    ALTER TABLE conversation_participant ADD COLUMN role TEXT DEFAULT 'PARTICIPANT';
  END IF;
END $$;

-- Update role CHECK constraint if needed
DO $$
BEGIN
  -- Remove old constraint if exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'conversation_participant' AND constraint_name LIKE '%role%'
  ) THEN
    ALTER TABLE conversation_participant DROP CONSTRAINT IF EXISTS conversation_participant_role_check;
  END IF;
  
  -- Add new constraint
  ALTER TABLE conversation_participant 
    ADD CONSTRAINT conversation_participant_role_check 
    CHECK (role IN ('PARTICIPANT', 'ADMIN'));
END $$;

-- ========================================
-- UPDATE TRIGGERS
-- ========================================
DROP TRIGGER IF EXISTS update_override_updated_at_trigger ON tenant_limit_override;
CREATE TRIGGER update_override_updated_at_trigger
  BEFORE UPDATE ON tenant_limit_override
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE tenant_limit_override IS 'Admin-granted temporary limit increases for tenants';
COMMENT ON COLUMN tenant_limit_override.expiration_date IS 'When override expires (NULL = no expiration)';
COMMENT ON COLUMN conversation.is_admin_conversation IS 'True if conversation was started by admin';
COMMENT ON COLUMN message.is_admin_message IS 'True if message was sent by admin';

