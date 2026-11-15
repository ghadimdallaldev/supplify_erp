import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../features/auth/AuthContext'
import type { AssistantCapabilities, AssistantConversation, AssistantMessage, AssistantAttachment, AssistantSendResponse } from '../../../types/assistant'
import { api } from '../client'

function useAssistantScope() {
  const { user } = useAuth()
  return `${user?.id || ''}:${user?.workspace?.tenantId || ''}`
}

export function useAssistantCapabilities(enabled = true) {
  const scope = useAssistantScope()
  return useQuery({ queryKey: ['assistant','capabilities',scope], queryFn: () => api.get<AssistantCapabilities>('/api/assistant/capabilities'), enabled, staleTime: 30_000 })
}

export function useAssistantConversations(offset = 0, enabled = true) {
  const scope = useAssistantScope()
  return useQuery({ queryKey: ['assistant','conversations',scope,offset], queryFn: () => api.get<{ conversations: AssistantConversation[] }>(`/api/assistant/conversations?limit=20&offset=${offset}`), enabled })
}

export function useAssistantMessages(conversationId: string | null, before?: string) {
  const scope = useAssistantScope()
  return useQuery({ queryKey: ['assistant','messages',scope,conversationId,before], queryFn: () => api.get<{ messages: AssistantMessage[]; hasMore?: boolean; nextBefore?: string | null }>(`/api/assistant/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`), enabled: Boolean(conversationId) })
}

export function useSendAssistantMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { conversationId?: string | null; message: string; attachments?: AssistantAttachment[] }) => api.post<AssistantSendResponse>('/api/assistant/messages',body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['assistant'] }) },
  })
}
