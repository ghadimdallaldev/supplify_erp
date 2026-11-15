import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ChatConversation, ChatMessage } from '../../../types/chat'
import { useAuth } from '../../../features/auth/AuthContext'
import { api } from '../client'
import { queryKeys } from './keys'

type ApiConversation = ChatConversation & {
  last_message_preview?: string | null
}

type ApiAttachment = {
  fileUrl?: string
  fileType?: string
  fileName?: string
  fileSize?: number
  file_url?: string
  file_type?: string
  file_name?: string
  file_size?: number
}

type ApiMessage = Omit<ChatMessage, 'body' | 'attachments'> & {
  body?: string
  content?: string
  sender_type?: string
  restaurant_name?: string | null
  supplier_name?: string | null
  order_id?: string | null
  message_type?: string
  attachments?: ApiAttachment[]
}

function normalizeConversation(row: ApiConversation): ChatConversation {
  return {
    id: row.id,
    title: row.title,
    participant_name: row.participant_name,
    last_message: row.last_message ?? row.last_message_preview ?? '',
    last_message_at: row.last_message_at,
    unread_count: Number(row.unread_count ?? 0),
    order_id: row.order_id ?? null,
  }
}

function normalizeMessage(
  row: ApiMessage,
  opts: { tenantId?: string | null; role?: string | null }
): ChatMessage {
  const senderType = String(row.sender_type || '').toUpperCase()
  const role = String(opts.role || '').toUpperCase()
  const isOwn =
    row.is_own ??
    (opts.tenantId && row.sender_id === opts.tenantId
      ? true
      : Boolean(role && senderType && senderType === role))

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_name: row.sender_name ?? row.restaurant_name ?? row.supplier_name ?? undefined,
    body: row.body ?? row.content ?? '',
    created_at: row.created_at,
    is_own: isOwn,
    order_id: row.order_id ?? null,
    message_type: row.message_type ?? 'TEXT',
    attachments: (row.attachments ?? [])
      .map((attachment) => ({
        fileUrl: attachment.fileUrl ?? attachment.file_url ?? '',
        fileType: (attachment.fileType ?? attachment.file_type ?? '') as NonNullable<
          ChatMessage['attachments']
        >[number]['fileType'],
        fileName: attachment.fileName ?? attachment.file_name ?? 'Attachment',
        fileSize: attachment.fileSize ?? attachment.file_size,
      }))
      .filter((attachment) => Boolean(attachment.fileUrl)),
  }
}

export function useChatConversations(pollMs = 15_000, enabled = true) {
  return useQuery({
    queryKey: queryKeys.chatConversations,
    queryFn: async () => {
      const data = await api.get<{ conversations: ApiConversation[] }>('/api/chat/conversations')
      const rows = data.conversations ?? (data as unknown as ApiConversation[])
      return (Array.isArray(rows) ? rows : []).map(normalizeConversation)
    },
    enabled,
    refetchInterval: pollMs,
    refetchOnMount: 'always',
  })
}

export function useChatMessages(conversationId: string, pollMs = 15_000) {
  const { user } = useAuth()
  const tenantId = user?.workspace?.tenantId ?? null
  const role = user?.role ?? null

  return useQuery({
    queryKey: queryKeys.chatMessages(conversationId),
    queryFn: async () => {
      const data = await api.get<{ messages: ApiMessage[] }>(
        `/api/chat/conversations/${conversationId}/messages`
      )
      const rows = data.messages ?? (data as unknown as ApiMessage[])
      return (Array.isArray(rows) ? rows : []).map((row) =>
        normalizeMessage(row, { tenantId, role })
      )
    },
    enabled: Boolean(conversationId),
    refetchInterval: pollMs,
  })
}

export function useOpenChatConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { supplierId: string } | { restaurantId: string }) => {
      const data = await api.post<{ conversation: ApiConversation }>(
        '/api/chat/conversations',
        body
      )
      return normalizeConversation(data.conversation)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.chatConversations }),
  })
}

export function useMarkConversationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) =>
      api.patch(`/api/chat/conversations/${conversationId}/read`, {}),
    onSuccess: (_data, conversationId) => {
      qc.setQueryData<ChatConversation[]>(queryKeys.chatConversations, (rows) =>
        rows?.map((row) => (row.id === conversationId ? { ...row, unread_count: 0 } : row))
      )
    },
  })
}

export function useSendChatMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      conversationId,
      body,
      orderId,
      attachments,
    }: {
      conversationId: string
      body: string
      orderId?: string | null
      attachments?: ChatMessage['attachments']
    }) => {
      const payload: Record<string, unknown> = { content: body, body }
      if (orderId) {
        payload.orderId = orderId
        payload.messageType = 'ORDER_REFERENCE'
      }
      if (attachments?.length) payload.attachments = attachments
      return api.post(`/api/chat/conversations/${conversationId}/messages`, payload)
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({
        queryKey: queryKeys.chatMessages(v.conversationId),
      })
      qc.invalidateQueries({ queryKey: queryKeys.chatConversations })
    },
  })
}
