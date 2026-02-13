-- Migration: 0040_attachment_file_size.sql
-- Add file_size to attachment for storage quota tracking (subscription storage_mb limit).

ALTER TABLE attachment ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0;
COMMENT ON COLUMN attachment.file_size_bytes IS 'File size in bytes for storage quota (plan storage_mb limit)';
