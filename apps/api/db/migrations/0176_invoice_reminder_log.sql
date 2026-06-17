-- Supplier collections reminders: deduped invoice reminder sends

CREATE TABLE IF NOT EXISTS invoice_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  reminder_kind TEXT NOT NULL CHECK (
    reminder_kind IN ('pre_due_3d', 'due_today', 'overdue_7d', 'overdue_30d', 'manual')
  ),
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'whatsapp')),
  dedup_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  notification_log_id UUID,
  UNIQUE (invoice_id, dedup_key, reminder_kind)
);

CREATE INDEX IF NOT EXISTS idx_invoice_reminder_log_supplier_sent
  ON invoice_reminder_log (supplier_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_reminder_log_invoice
  ON invoice_reminder_log (invoice_id, reminder_kind);
