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
    sources?: AssistantSource[]
    quotaLimited?: boolean
    attachments?: AssistantAttachment[]
  } | null
  createdAt: string
}

export interface AssistantAttachment {
  fileUrl: string
  fileType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  fileName: string
  fileSize?: number | null
}

export interface AssistantSendResponse {
  conversationId: string
  reply: string
  sources: AssistantSource[]
  usedLlm: boolean
  quotaLimited?: boolean
  quota?: AssistantCapabilities['quota']
}
export interface AssistantSource {
  tool: string
  args?: unknown
  ok: boolean
  evidence?: {
    fetchedAt: string
    status: 'ok' | 'unavailable'
    scope: string
    scopeId?: string
    limited: boolean
    totalCount?: number | null
    returnedCount?: number | null
    href?: string | null
  }
}
