-- Staging launch: indexes for hot list/dispatch/chat paths (idempotent).

CREATE INDEX IF NOT EXISTS idx_message_conversation_created_at
  ON message (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_assignments_order_created_at
  ON driver_assignments (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_supplier_status
  ON invoice (supplier_id, status);
