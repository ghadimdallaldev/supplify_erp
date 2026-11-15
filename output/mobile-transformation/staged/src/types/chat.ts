export type ChatConversation = {
  id: string
  title?: string
  participant_name?: string
  last_message?: string
  last_message_at?: string
  unread_count?: number
  order_id?: string | null
}

export type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  sender_name?: string
  body: string
  created_at: string
  is_own?: boolean
  /** Set when the message references a specific order (messageType = ORDER_REFERENCE) */
  order_id?: string | null
  message_type?: 'TEXT' | 'SYSTEM' | 'ORDER_REFERENCE' | string
  attachments?: import('../services/attachmentUpload').ChatAttachment[]
}
