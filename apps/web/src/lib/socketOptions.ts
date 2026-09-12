import type { ManagerOptions } from 'socket.io-client'
import type { SocketOptions } from 'socket.io-client'

/** Shared Socket.IO client options (WebSocket first for low-latency chat; falls back to polling). */
export const SOCKET_IO_OPTIONS: Partial<ManagerOptions & SocketOptions> = {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  withCredentials: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
}
