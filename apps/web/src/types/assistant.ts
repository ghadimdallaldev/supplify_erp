export interface AssistantCapabilities {
  enabled: boolean
  reason?: string | null
  quotaRemaining?: number | null
  quota?: {
    remaining?: number | null
    limit?: number | null
    resetAt?: string | null
  } | null
  tools: string[]
}

export interface AssistantConversation {
  id: string
  title?: string | null
  createdAt: string
  updatedAt: string
}

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolPayload?: {
    sources?: Array<{ tool: string; args: unknown; ok: boolean }>
    quotaLimited?: boolean
  } | null
  createdAt: string
}

export interface AssistantSendResponse {
  conversationId: string
  reply: string
  sources: Array<{ tool: string; args: unknown; ok: boolean }>
  usedLlm: boolean
  quotaLimited?: boolean
  quota?: AssistantCapabilities['quota']
}
