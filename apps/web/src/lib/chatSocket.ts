import { io, type Socket } from 'socket.io-client'
import { getSocketBaseUrl } from './socketBaseUrl'

let socket: Socket | null = null
let socketUserId: string | null = null

function disconnectQuietly(s: Socket) {
  s.removeAllListeners()
  if (s.connected) {
    s.disconnect()
    return
  }
  s.io.opts.reconnection = false
  s.once('connect', () => s.disconnect())
  s.close()
}

/** Shared chat socket (avoids Strict Mode / effect churn disconnect noise). */
export function getChatSocket(userId: string): Socket {
  if (socket && socketUserId === userId) {
    return socket
  }
  if (socket) {
    disconnectQuietly(socket)
    socket = null
    socketUserId = null
  }

  socket = io(getSocketBaseUrl(), {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    withCredentials: true,
    autoConnect: true,
  })
  socketUserId = userId

  socket.on('connect_error', (err) => {
    console.error('[chatSocket] connection error', err.message)
  })

  return socket
}

export function releaseChatSocket() {
  if (!socket) return
  disconnectQuietly(socket)
  socket = null
  socketUserId = null
}
