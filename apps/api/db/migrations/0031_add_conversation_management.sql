-- Migration: 0031_add_conversation_management.sql
-- Description: Add pin and archive support for conversations

-- Add is_pinned and is_archived columns to conversation_participant (per-user settings)
ALTER TABLE conversation_participant
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE conversation_participant
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- Create indexes for pinned and archived conversations
CREATE INDEX IF NOT EXISTS idx_conversation_participant_pinned ON conversation_participant(conversation_id, participant_type, is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_conversation_participant_archived ON conversation_participant(conversation_id, participant_type, is_archived) WHERE is_archived = true;

