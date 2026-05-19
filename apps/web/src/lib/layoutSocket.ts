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

/** Reuse one layout socket per user (avoids React Strict Mode connect/disconnect noise). */
export function getLayoutSocket(userId: string): Socket {
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
  return socket
}

export function releaseLayoutSocket() {
  if (!socket) return
  disconnectQuietly(socket)
  socket = null
  socketUserId = null
}
