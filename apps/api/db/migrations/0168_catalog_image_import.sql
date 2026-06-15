-- Bulk product image import jobs + product thumbnail URL

ALTER TABLE product
  ADD COLUMN IF NOT EXISTS image_thumb_url TEXT;

CREATE TABLE IF NOT EXISTS catalog_image_import_job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK (method IN ('zip_sku', 'zip_mapping', 'url_csv')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'previewing', 'processing', 'completed', 'failed', 'cancelled')
  ),
  replace_existing BOOLEAN NOT NULL DEFAULT false,
  source_file_key TEXT,
  mapping_file_key TEXT,
  total_files INT NOT NULL DEFAULT 0,
  processed INT NOT NULL DEFAULT 0,
  matched INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  preview_json JSONB,
  result_json JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_image_import_job_supplier_status
  ON catalog_image_import_job (supplier_id, status);

CREATE INDEX IF NOT EXISTS idx_catalog_image_import_job_created_at
  ON catalog_image_import_job (created_at DESC);
