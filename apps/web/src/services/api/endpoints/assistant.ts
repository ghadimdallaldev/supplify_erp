import { api } from '../base'
import type {
  AssistantCapabilities,
  AssistantConversation,
  AssistantMessage,
  AssistantSendResponse,
  AssistantAttachment,
} from '../../../types/assistant'

export const assistantApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getAssistantCapabilities: builder.query<AssistantCapabilities, void>({
      query: () => '/api/assistant/capabilities',
      providesTags: ['Assistant'],
    }),
    getAssistantConversations: builder.query<
      { conversations: AssistantConversation[] },
      { offset?: number } | void
    >({
      query: (arg) => ({
        url: '/api/assistant/conversations',
        params: { limit: 20, offset: arg?.offset || 0 },
      }),
      providesTags: ['Assistant'],
    }),
    getAssistantMessages: builder.query<
      { messages: AssistantMessage[]; hasMore?: boolean; nextBefore?: string | null },
      { conversationId: string; before?: string }
    >({
      query: ({ conversationId, before }) => ({
        url: `/api/assistant/conversations/${conversationId}/messages`,
        params: { before },
      }),
      providesTags: (_r, _e, arg) => [{ type: 'Assistant' as const, id: arg.conversationId }],
    }),
    sendAssistantMessage: builder.mutation<
      AssistantSendResponse,
      { conversationId?: string | null; message: string; attachments?: AssistantAttachment[] }
    >({
      query: (body) => ({
        url: '/api/assistant/messages',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Assistant', 'Subscription'],
    }),
  }),
})

export const {
  useGetAssistantCapabilitiesQuery,
  useGetAssistantConversationsQuery,
  useGetAssistantMessagesQuery,
  useSendAssistantMessageMutation,
} = assistantApi
