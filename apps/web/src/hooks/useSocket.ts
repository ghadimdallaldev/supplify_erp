import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { getSocketBaseUrl } from '../lib/socketBaseUrl'
import { SOCKET_IO_OPTIONS } from '../lib/socketOptions'

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!socketRef.current) {
      const s = io(getSocketBaseUrl(), SOCKET_IO_OPTIONS)

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
