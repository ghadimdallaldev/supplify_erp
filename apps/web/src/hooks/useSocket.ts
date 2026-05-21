import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { getSocketBaseUrl } from '../lib/socketBaseUrl'

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!socketRef.current) {
      const s = io(getSocketBaseUrl(), {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
      })

      s.on('connect_error', (err) => {
        console.error('[useSocket] connection error', err.message)
      })

      socketRef.current = s
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners()
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [])

  return socketRef
}
