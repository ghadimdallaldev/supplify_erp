-- Async bulk product CSV import jobs

CREATE TABLE IF NOT EXISTS catalog_product_import_job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  preview_json JSONB,
  result_json JSONB,
  error_message TEXT,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_product_import_job_supplier_status
  ON catalog_product_import_job (supplier_id, status);

CREATE INDEX IF NOT EXISTS idx_catalog_product_import_job_created_at
  ON catalog_product_import_job (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_product_import_active_supplier
  ON catalog_product_import_job (supplier_id)
  WHERE status IN ('pending', 'processing');
