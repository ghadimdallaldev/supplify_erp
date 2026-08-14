import { api } from '../base'
import type {
  AssistantCapabilities,
  AssistantConversation,
  AssistantMessage,
  AssistantSendResponse,
} from '../../../types/assistant'

export const assistantApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getAssistantCapabilities: builder.query<AssistantCapabilities, void>({
      query: () => '/api/assistant/capabilities',
      providesTags: ['Assistant'],
    }),
    getAssistantConversations: builder.query<{ conversations: AssistantConversation[] }, void>({
      query: () => '/api/assistant/conversations',
      providesTags: ['Assistant'],
    }),
    getAssistantMessages: builder.query<
      { messages: AssistantMessage[] },
      { conversationId: string }
    >({
      query: ({ conversationId }) => `/api/assistant/conversations/${conversationId}/messages`,
      providesTags: (_r, _e, arg) => [{ type: 'Assistant' as const, id: arg.conversationId }],
    }),
    sendAssistantMessage: builder.mutation<
      AssistantSendResponse,
      { conversationId?: string | null; message: string }
    >({
      query: (body) => ({
        url: '/api/assistant/messages',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Assistant'],
    }),
  }),
})

export const {
  useGetAssistantCapabilitiesQuery,
  useGetAssistantConversationsQuery,
  useGetAssistantMessagesQuery,
  useSendAssistantMessageMutation,
} = assistantApi
