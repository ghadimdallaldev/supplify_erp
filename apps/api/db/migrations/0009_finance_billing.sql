-- Migration: 0009_finance_billing.sql
-- Description: Finance, Billing, and Credit Management System

-- Create invoice table
CREATE TABLE IF NOT EXISTS invoice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES restaurant(id) ON DELETE SET NULL,
  order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL,
  
  -- Invoice details
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  issue_date DATE,
  payment_date DATE,
  
  -- Amounts
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE')),
  
  -- Currency
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(10,4) DEFAULT 1.0000,
  
  -- Tax
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_included BOOLEAN DEFAULT false,
  
  -- Terms
  payment_terms TEXT,
  payment_terms_days INTEGER DEFAULT 30,
  
  -- Metadata
  notes TEXT,
  internal_notes TEXT,
  footer_text TEXT,
  
  -- Audit
  created_by TEXT,
  issued_by TEXT,
  voided_by TEXT,
  voided_at TIMESTAMPTZ,
  voided_reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_at TIMESTAMPTZ
);

-- Create invoice line items table
CREATE TABLE IF NOT EXISTS invoice_line_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  
  -- Product/Service details
  product_id UUID REFERENCES product(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  sku TEXT,
  
  -- Quantities and pricing
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL,
  
  -- Tax
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  
  -- Order reference
  order_item_id UUID,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create credit note table
CREATE TABLE IF NOT EXISTS credit_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number TEXT NOT NULL UNIQUE,
  invoice_id UUID REFERENCES invoice(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  
  -- Credit details
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL CHECK (reason IN ('RETURN', 'SHORTAGE', 'DEFECT', 'OVERCHARGE', 'OTHER')),
  description TEXT,
  
  -- Amounts
  credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  applied_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('ISSUED', 'APPLIED', 'EXPIRED', 'VOID')),
  
  -- Currency
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Reference
  reference_invoice_number TEXT,
  order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL,
  
  -- Metadata
  notes TEXT,
  internal_notes TEXT,
  
  -- Audit
  created_by TEXT,
  issued_by TEXT,
  voided_by TEXT,
  voided_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at DATE
);

-- Create credit note line items
CREATE TABLE IF NOT EXISTS credit_note_line_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES credit_note(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  sku TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL,
  credit_amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create payment table
CREATE TABLE IF NOT EXISTS payment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  
  -- Payment details
  payment_number TEXT NOT NULL UNIQUE,
  payment_date DATE NOT NULL,
  payment_amount NUMERIC(12,2) NOT NULL,
  
  -- Payment method
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'CHECK', 'BANK_TRANSFER', 'STRIPE', 'CREDIT_CARD', 'ACH', 'OTHER')),
  payment_reference TEXT,
  
  -- Provider details
  provider TEXT,
  provider_transaction_id TEXT,
  
  -- Bank details
  bank_name TEXT,
  bank_account_last_four TEXT,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED')),
  
  -- Currency
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(10,4) DEFAULT 1.0000,
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  recorded_by TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create account statement table
CREATE TABLE IF NOT EXISTS account_statement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  
  -- Statement details
  statement_date DATE NOT NULL,
  statement_period_start DATE NOT NULL,
  statement_period_end DATE NOT NULL,
  previous_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Totals
  charges NUMERIC(12,2) NOT NULL DEFAULT 0,
  payments NUMERIC(12,2) NOT NULL DEFAULT 0,
  adjustments NUMERIC(12,2) NOT NULL DEFAULT 0,
  ending_balance NUMERIC(12,2) NOT NULL,
  
  -- Aging
  current NUMERIC(12,2) DEFAULT 0,
  days_30 NUMERIC(12,2) DEFAULT 0,
  days_60 NUMERIC(12,2) DEFAULT 0,
  days_90 NUMERIC(12,2) DEFAULT 0,
  days_90_plus NUMERIC(12,2) DEFAULT 0,
  
  -- Currency
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Metadata
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create dunning (payment reminders) table
CREATE TABLE IF NOT EXISTS dunning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  
  -- Dunning details
  dunning_level INTEGER NOT NULL DEFAULT 1,
  sent_date DATE NOT NULL,
  
  -- Email details
  email_to TEXT NOT NULL,
  email_subject TEXT,
  email_body TEXT,
  
  -- Template
  template_name TEXT,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'FAILED')),
  
  -- Response
  payment_received BOOLEAN DEFAULT false,
  payment_date DATE,
  
  -- Metadata
  sent_by TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create tax configuration table
CREATE TABLE IF NOT EXISTS tax_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  
  -- Tax details
  tax_name TEXT NOT NULL,
  tax_rate NUMERIC(5,2) NOT NULL,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('VAT', 'GST', 'SALES_TAX', 'SERVICE_TAX')),
  
  -- Region
  region TEXT,
  country TEXT,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Effective dates
  effective_from DATE NOT NULL,
  effective_to DATE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create invoice number sequence table
CREATE TABLE IF NOT EXISTS invoice_sequence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  
  -- Sequence details
  prefix TEXT NOT NULL DEFAULT 'INV',
  year INTEGER NOT NULL,
  month INTEGER,
  current_number INTEGER NOT NULL DEFAULT 0,
  format TEXT NOT NULL DEFAULT '{prefix}-{year}-{month}-{number}',
  
  -- Next number
  next_number INTEGER NOT NULL DEFAULT 1,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(supplier_id, year, month)
);

-- Create payment reminder configuration table
CREATE TABLE IF NOT EXISTS payment_reminder_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  
  -- Reminder settings
  reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  days_before_due INTEGER DEFAULT 5,
  days_after_due INTEGER DEFAULT 7,
  reminder_frequency_days INTEGER DEFAULT 7,
  max_reminders INTEGER DEFAULT 3,
  
  -- Templates
  reminder_template TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(supplier_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_invoice_supplier ON invoice(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoice_restaurant ON invoice(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_order ON invoice(order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoice(status);
CREATE INDEX IF NOT EXISTS idx_invoice_date ON invoice(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoice_due_date ON invoice(due_date);

CREATE INDEX IF NOT EXISTS idx_invoice_line_item_invoice ON invoice_line_item(invoice_id);

CREATE INDEX IF NOT EXISTS idx_credit_note_supplier ON credit_note(supplier_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_restaurant ON credit_note(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_invoice ON credit_note(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_status ON credit_note(status);

CREATE INDEX IF NOT EXISTS idx_payment_invoice ON payment(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_date ON payment(payment_date);
CREATE INDEX IF NOT EXISTS idx_payment_status ON payment(status);

CREATE INDEX IF NOT EXISTS idx_account_statement_supplier ON account_statement(supplier_id);
CREATE INDEX IF NOT EXISTS idx_account_statement_restaurant ON account_statement(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_account_statement_date ON account_statement(statement_date);

CREATE INDEX IF NOT EXISTS idx_dunning_invoice ON dunning(invoice_id);
CREATE INDEX IF NOT EXISTS idx_dunning_status ON dunning(status);

CREATE INDEX IF NOT EXISTS idx_tax_config_supplier ON tax_config(supplier_id);

-- Create function to calculate invoice balance
CREATE OR REPLACE FUNCTION calculate_invoice_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoice
  SET 
    paid_amount = COALESCE((
      SELECT SUM(payment_amount) 
      FROM payment 
      WHERE invoice_id = NEW.invoice_id 
        AND status = 'COMPLETED'
    ), 0),
    balance_due = total_amount - COALESCE((
      SELECT SUM(payment_amount) 
      FROM payment 
      WHERE invoice_id = NEW.invoice_id 
        AND status = 'COMPLETED'
    ), 0),
    status = CASE
      WHEN total_amount = COALESCE((
        SELECT SUM(payment_amount) 
        FROM payment 
        WHERE invoice_id = NEW.invoice_id 
          AND status = 'COMPLETED'
      ), 0) THEN 'PAID'
      WHEN COALESCE((
        SELECT SUM(payment_amount) 
        FROM payment 
        WHERE invoice_id = NEW.invoice_id 
          AND status = 'COMPLETED'
      ), 0) > 0 THEN 'PARTIALLY_PAID'
      ELSE status
    END,
    payment_date = CASE
      WHEN total_amount = COALESCE((
        SELECT SUM(payment_amount) 
        FROM payment 
        WHERE invoice_id = NEW.invoice_id 
          AND status = 'COMPLETED'
      ), 0) THEN CURRENT_DATE
      ELSE payment_date
    END
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update invoice balance when payment is recorded
CREATE TRIGGER update_invoice_balance_on_payment
AFTER INSERT OR UPDATE ON payment
FOR EACH ROW
EXECUTE FUNCTION calculate_invoice_balance();

-- Create function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number(supplier_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  prefix_val TEXT := 'INV';
  year_val INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  month_val INTEGER := EXTRACT(MONTH FROM CURRENT_DATE);
  next_num INTEGER;
  formatted_number TEXT;
BEGIN
  -- Get or create sequence for this supplier/year/month
  INSERT INTO invoice_sequence (supplier_id, year, month, current_number, next_number, prefix)
  VALUES (supplier_uuid, year_val, month_val, 0, 1, prefix_val)
  ON CONFLICT (supplier_id, year, month) 
  DO UPDATE SET 
    next_number = invoice_sequence.next_number + 1
  RETURNING next_number INTO next_num;
  
  -- Format: INV-2024-10-001
  formatted_number := prefix_val || '-' || year_val || '-' || 
                     LPAD(month_val::TEXT, 2, '0') || '-' || 
                     LPAD(next_num::TEXT, 3, '0');
  
  RETURN formatted_number;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate aging
CREATE OR REPLACE FUNCTION calculate_aging(statement_date DATE, invoice_date DATE, amount NUMERIC)
RETURNS RECORD AS $$
DECLARE
  days_due INTEGER;
  result RECORD;
BEGIN
  days_due := EXTRACT(DAY FROM (statement_date - invoice_date));
  
  result := (amount, 0, 0, 0, 0);
  
  IF days_due <= 30 THEN
    result := (amount, 0, 0, 0, 0);
  ELSIF days_due <= 60 THEN
    result := (0, amount, 0, 0, 0);
  ELSIF days_due <= 90 THEN
    result := (0, 0, amount, 0, 0);
  ELSE
    result := (0, 0, 0, 0, amount);
  END IF;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
