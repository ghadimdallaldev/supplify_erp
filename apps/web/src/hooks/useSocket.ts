import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { getSocketBaseUrl } from '../lib/socketBaseUrl'

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(getSocketBaseUrl(), {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
      })
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [])

  return socketRef.current
}
