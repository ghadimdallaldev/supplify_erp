-- Migration: 0030_add_message_reply_to.sql
-- Description: Add reply_to column to message table for message replies

-- Add reply_to column to message table
ALTER TABLE message
ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES message(id) ON DELETE SET NULL;

-- Create index for reply_to
CREATE INDEX IF NOT EXISTS idx_message_reply_to ON message(reply_to);

