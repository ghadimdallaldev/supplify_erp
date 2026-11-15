import type { QueryClient } from '@tanstack/react-query'
import type { User } from '../../types/supplify'
import { useCartStore } from '../../store/cartStore'
import { invalidateRequestScope } from './requestScope'
import { disconnectChatSocket } from '../../services/chatSocket'

export function businessSessionKey(user: User | null): string | null {
  return user ? JSON.stringify([user.id, user.role, user.workspace?.tenantId ?? null]) : null
}

/** Synchronous so a new identity is never rendered against the old query/cache state. */
export function resetBusinessSession(client: QueryClient) {
  invalidateRequestScope()
  disconnectChatSocket()
  void client.cancelQueries().catch(() => {})
  client.clear()
  useCartStore.getState().reset()
}
