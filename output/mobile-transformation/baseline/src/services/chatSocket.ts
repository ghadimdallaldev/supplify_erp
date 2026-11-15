import { io, Socket } from 'socket.io-client'
import { assertRequestScope, getRequestScopeVersion, registerScopedRequest } from '../features/auth/requestScope'
import {
  getAccessToken,
  getActiveTenantToken,
  getRefreshToken,
} from '../features/auth/tokenStorage'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost'

let socket: Socket | null = null
const roomRefs = new Map<string, number>()

/** Returns the shared authenticated Socket.IO instance. */
export function getChatSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      withCredentials: true,
    })
    socket.on('connect', () => {
      for (const conversationId of roomRefs.keys()) {
        socket?.emit('join_conversation', conversationId)
      }
    })
  }
  return socket
}

/** Connect using the same access, refresh, and active-branch tokens as REST requests. */
export async function connectChatSocket(): Promise<void> {
  const scope = getRequestScopeVersion()
  const s = getChatSocket()
  if (s.connected) return

  const [accessToken, refreshToken, activeTenantToken] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getActiveTenantToken(),
  ])
  assertRequestScope(scope)

  if (!accessToken) return

  const cookieParts = [`access_token=${encodeURIComponent(accessToken)}`]
  if (refreshToken) cookieParts.push(`refresh_token=${encodeURIComponent(refreshToken)}`)
  if (activeTenantToken) {
    cookieParts.push(`active_tenant_token=${encodeURIComponent(activeTenantToken)}`)
  }

  ;(s.io.opts as { extraHeaders?: Record<string, string> }).extraHeaders = {
    Cookie: cookieParts.join('; '),
  }

  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    const unregister = registerScopedRequest(controller)
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      unregister()
      controller.signal.removeEventListener('abort', onAbort)
      s.off('connect', onConnect)
      s.off('connect_error', onError)
      fn()
    }
    const onConnect = () => settle(resolve)
    const onError = (err: Error) => settle(() => reject(err))
    const onAbort = () => {
      s.disconnect()
      settle(() => reject(new Error('Session changed')))
    }
    controller.signal.addEventListener('abort', onAbort, { once: true })

    s.once('connect', onConnect)
    s.once('connect_error', onError)
    s.connect()
    timer = setTimeout(() => settle(() => reject(new Error('Socket connect timeout'))), 10_000)
  })
}

export function disconnectChatSocket(): void {
  roomRefs.clear()
  socket?.disconnect()
  socket?.removeAllListeners()
  socket = null
}

export function joinConversation(conversationId: string): void {
  const count = roomRefs.get(conversationId) ?? 0
  roomRefs.set(conversationId, count + 1)
  if (count === 0 && getChatSocket().connected) {
    getChatSocket().emit('join_conversation', conversationId)
  }
}

export function leaveConversation(conversationId: string): void {
  const count = roomRefs.get(conversationId) ?? 0
  if (count <= 1) {
    roomRefs.delete(conversationId)
    if (getChatSocket().connected) {
      getChatSocket().emit('leave_conversation', conversationId)
    }
    return
  }
  roomRefs.set(conversationId, count - 1)
}
