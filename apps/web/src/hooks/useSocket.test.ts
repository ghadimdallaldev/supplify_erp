import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSocket } from './useSocket'
import { io } from 'socket.io-client'

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
    connected: true,
  })),
}))

describe('useSocket Hook', () => {
  let mockSocket: any

  beforeEach(() => {
    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      removeAllListeners: vi.fn(),
      connected: true,
    }
    vi.mocked(io).mockReturnValue(mockSocket as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should connect to socket on mount', () => {
    renderHook(() => useSocket())

    expect(io).toHaveBeenCalled()
  })

  it('should disconnect socket on unmount', () => {
    const { unmount } = renderHook(() => useSocket())

    unmount()

    expect(mockSocket.disconnect).toHaveBeenCalled()
  })

  it('should return a ref whose current is the socket', () => {
    const { result } = renderHook(() => useSocket())
    // The hook returns a ref object; .current holds the socket after the effect runs
    expect(result.current).toBeDefined()
    expect(result.current.current).toBe(mockSocket)
  })
})
