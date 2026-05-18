-- Migration: 0067_subscription_billing.sql
-- Subscription billing: payment methods, invoices, payments, overdue grace & account lock

-- ========================================
-- SUBSCRIPTION BILLING COLUMNS
-- ========================================
ALTER TABLE subscription
  ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lock_reason TEXT,
  ADD COLUMN IF NOT EXISTS default_payment_method_id UUID,
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_failed_at TIMESTAMPTZ;

COMMENT ON COLUMN subscription.past_due_since IS 'When the current billing failure started';
COMMENT ON COLUMN subscription.grace_period_ends_at IS 'End of 7-day notice before account lock';
COMMENT ON COLUMN subscription.account_locked_at IS 'When tenant access was locked for non-payment';
COMMENT ON COLUMN subscription.auto_renew IS 'Whether subscription renews automatically';

-- ========================================
-- PAYMENT METHODS (gateway token references only — never store PAN/CVV)
-- ========================================
CREATE TABLE IF NOT EXISTS billing_payment_method (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  provider TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_payment_method_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('CARD', 'BANK_ACCOUNT', 'WALLET', 'MANUAL')),
  brand TEXT,
  last4 TEXT,
  exp_month INTEGER,
  exp_year INTEGER,
  bank_name TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REMOVED')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_payment_method_tenant
  ON billing_payment_method (tenant_id, tenant_type)
  WHERE status = 'ACTIVE';

-- ========================================
-- BILLING INVOICES
-- ========================================
CREATE TABLE IF NOT EXISTS billing_invoice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscription(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  invoice_number TEXT NOT NULL UNIQUE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_cycle TEXT CHECK (billing_cycle IN ('MONTHLY', 'YEARLY')),
  plan_id UUID REFERENCES subscription_plan(id),
  plan_name TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE')),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  due_date TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_invoice_subscription ON billing_invoice (subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoice_tenant_open
  ON billing_invoice (tenant_id, tenant_type)
  WHERE status = 'OPEN';

-- ========================================
-- BILLING PAYMENTS
-- ========================================
CREATE TABLE IF NOT EXISTS billing_payment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES billing_invoice(id) ON DELETE SET NULL,
  subscription_id UUID NOT NULL REFERENCES subscription(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  payment_method_id UUID REFERENCES billing_payment_method(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED')),
  failure_code TEXT,
  failure_message TEXT,
  idempotency_key TEXT UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_payment_subscription ON billing_payment (subscription_id);

-- ========================================
-- BILLING EVENT LOG
-- ========================================
CREATE TABLE IF NOT EXISTS billing_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscription(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_event_tenant ON billing_event (tenant_id, tenant_type, created_at DESC);
