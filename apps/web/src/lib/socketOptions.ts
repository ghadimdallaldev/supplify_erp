/** Shared Socket.IO client options (polling first reduces WebSocket console noise during API restarts). */
export const SOCKET_IO_OPTIONS = {
  path: '/socket.io',
  transports: ['polling', 'websocket'],
  withCredentials: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
} as const
