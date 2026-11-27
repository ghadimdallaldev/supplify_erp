import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatRealtime } from './useChatRealtime'
import { api } from '../services/api'

const mockSocket = {
  connected: false,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
}

vi.mock('../lib/appSocket', () => ({
  getAppSocket: vi.fn(() => mockSocket),
  releaseAppSocket: vi.fn(),
}))

vi.mock('../services/api', () => ({
  api: {
    util: {
      invalidateTags: vi.fn(() => ({ type: 'invalidate' })),
      updateQueryData: vi.fn(() => ({ type: 'update' })),
    },
  },
}))

vi.mock('./redux', () => ({
  useAppDispatch: () => vi.fn((action) => action),
}))

describe('useChatRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSocket.connected = false
  })

  it('registers socket listeners when userId is set', () => {
    renderHook(() =>
      useChatRealtime({
        userId: 'user-1',
        selectedConversationId: null,
      })
    )
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function))
    expect(mockSocket.on).toHaveBeenCalledWith('new_message', expect.any(Function))
  })

  it('joins conversation on connect when one is selected', () => {
    mockSocket.connected = true
    renderHook(() =>
      useChatRealtime({
        userId: 'user-1',
        selectedConversationId: 'conv-1',
      })
    )
    const connectHandler = mockSocket.on.mock.calls.find((c) => c[0] === 'connect')?.[1]
    act(() => {
      connectHandler?.()
    })
    expect(mockSocket.emit).toHaveBeenCalledWith('join_conversation', 'conv-1')
  })

  it('emitTyping sends typing event when connected', () => {
    mockSocket.connected = true
    const { result } = renderHook(() =>
      useChatRealtime({
        userId: 'user-1',
        selectedConversationId: 'conv-1',
      })
    )
    result.current.emitTyping('conv-1', true)
    expect(mockSocket.emit).toHaveBeenCalledWith('typing', {
      conversationId: 'conv-1',
      isTyping: true,
    })
  })

  it('access change event closes composer live', () => {
    const onAccessChanged = vi.fn()
    renderHook(() =>
      useChatRealtime({
        userId: 'user-1',
        selectedConversationId: 'conv-1',
        onAccessChanged,
      })
    )
    const handler = mockSocket.on.mock.calls.find(
      (c) => c[0] === 'conversation_access_changed'
    )?.[1]
    expect(handler).toBeTypeOf('function')
    act(() => {
      handler?.({ conversationId: 'conv-1' })
    })
    expect(api.util.invalidateTags).toHaveBeenCalledWith(['Chat'])
    expect(onAccessChanged).toHaveBeenCalledWith('conv-1')
  })

  it('a CHAT_READ_ONLY send error refreshes the conversation access', () => {
    const onAccessChanged = vi.fn()
    renderHook(() =>
      useChatRealtime({ userId: 'user-1', selectedConversationId: 'conv-1', onAccessChanged })
    )
    const handler = mockSocket.on.mock.calls.find((c) => c[0] === 'chat_error')?.[1]
    act(() => {
      handler?.({ code: 'CHAT_READ_ONLY', openOrderIds: [] })
    })
    expect(api.util.invalidateTags).toHaveBeenCalledWith(['Chat'])
    expect(onAccessChanged).toHaveBeenCalledWith('conv-1')
  })
})
