-- Migration: 0003_chat_system.sql
-- Description: Add chat and communication system for suppliers and restaurants

-- Create conversation table (1:1 chat threads between supplier and restaurant)
CREATE TABLE conversation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Ensure one conversation per supplier-restaurant pair
  UNIQUE(supplier_id, restaurant_id)
);

-- Create index for conversation
CREATE INDEX idx_conversation_supplier ON conversation(supplier_id);
CREATE INDEX idx_conversation_restaurant ON conversation(restaurant_id);
CREATE INDEX idx_conversation_last_message ON conversation(last_message_at DESC);

-- Create conversation_participant table (to track read status)
CREATE TABLE conversation_participant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('SUPPLIER', 'RESTAURANT')),
  participant_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, participant_type)
);

-- Create index for conversation_participant
CREATE INDEX idx_conversation_participant_conversation ON conversation_participant(conversation_id);
CREATE INDEX idx_conversation_participant_unread ON conversation_participant(unread_count);

-- Create message table
CREATE TABLE message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('SUPPLIER', 'RESTAURANT')),
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT', 'SYSTEM', 'ORDER_REFERENCE')),
  order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for message
CREATE INDEX idx_message_conversation ON message(conversation_id);
CREATE INDEX idx_message_sender ON message(sender_id);
CREATE INDEX idx_message_created_at ON message(created_at DESC);
CREATE INDEX idx_message_read ON message(is_read);

-- Create message_attachment table for files (images, PDFs)
CREATE TABLE message_attachment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'image/jpeg', 'application/pdf', etc.
  file_name TEXT NOT NULL,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for message_attachment
CREATE INDEX idx_message_attachment_message ON message_attachment(message_id);

-- Create quick_reply_template table (reusable message templates)
CREATE TABLE quick_reply_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT, -- e.g., "delivery", "out_of_stock", "greeting"
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for quick_reply_template
CREATE INDEX idx_quick_reply_supplier ON quick_reply_template(supplier_id);
CREATE INDEX idx_quick_reply_active ON quick_reply_template(is_active);

-- Add function to update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversation
  SET last_message_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation when message is created
CREATE TRIGGER trigger_update_conversation_last_message
AFTER INSERT ON message
FOR EACH ROW
EXECUTE FUNCTION update_conversation_last_message();

-- Add function to increment unread count for other participant
CREATE OR REPLACE FUNCTION increment_unread_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment unread count for the other participant(s)
  UPDATE conversation_participant
  SET unread_count = unread_count + 1,
      updated_at = now()
  WHERE conversation_id = NEW.conversation_id
    AND (participant_type != NEW.sender_type OR participant_id != NEW.sender_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to increment unread count when message is created
CREATE TRIGGER trigger_increment_unread_count
AFTER INSERT ON message
FOR EACH ROW
EXECUTE FUNCTION increment_unread_count();

-- Add function to reset unread count when participant marks conversation as read
CREATE OR REPLACE FUNCTION reset_unread_count(conv_id UUID, part_type TEXT)
RETURNS void AS $$
BEGIN
  UPDATE conversation_participant
  SET unread_count = 0,
      last_read_at = now(),
      updated_at = now()
  WHERE conversation_id = conv_id
    AND participant_type = part_type;
END;
$$ LANGUAGE plpgsql;
