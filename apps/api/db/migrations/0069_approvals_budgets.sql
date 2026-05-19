-- Migration: 0069_approvals_budgets.sql
-- Purchase-order approval workflows and department budget tracking

-- Order status for approval gate
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'PENDING_APPROVAL'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'PENDING_APPROVAL';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS budget_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branch(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'annual', 'custom')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_budget NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_period_id UUID NOT NULL REFERENCES budget_periods(id) ON DELETE CASCADE,
  category VARCHAR(255) NOT NULL,
  allocated_amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  threshold_amount NUMERIC(12, 2),
  requires_role VARCHAR(100),
  approver_user_id UUID REFERENCES app_user(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES approval_rules(id) ON DELETE SET NULL,
  requested_by UUID NOT NULL REFERENCES app_user(id),
  approver_id UUID REFERENCES app_user(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_order_approvals_order_id ON order_approvals(order_id);
CREATE INDEX IF NOT EXISTS idx_order_approvals_approver_status ON order_approvals(approver_id, status);
CREATE INDEX IF NOT EXISTS idx_budget_periods_restaurant_dates ON budget_periods(restaurant_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_budget_periods_active ON budget_periods(restaurant_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_approval_rules_restaurant ON approval_rules(restaurant_id) WHERE is_active = TRUE;
