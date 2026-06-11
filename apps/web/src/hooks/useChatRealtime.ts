import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { api } from '../services/api'
import { useAppDispatch } from './redux'
import { getAppSocket, releaseAppSocket } from '../lib/appSocket'

export type NewMessagePayload = {
  conversationId?: string
  messageId?: string | null
  senderId?: string
  senderType?: string
  content?: string
  timestamp?: string
}

type UseChatRealtimeOptions = {
  userId: string | undefined
  selectedConversationId: string | null
  onOtherPartyTyping?: (isTyping: boolean) => void
}

export function useChatRealtime({
  userId,
  selectedConversationId,
  onOtherPartyTyping,
}: UseChatRealtimeOptions) {
  const dispatch = useAppDispatch()
  const socketRef = useRef<Socket | null>(null)
  const selectedRef = useRef(selectedConversationId)
  const userIdRef = useRef(userId)
  const [connected, setConnected] = useState(false)

  selectedRef.current = selectedConversationId
  userIdRef.current = userId

  const joinConversation = useCallback((conversationId: string) => {
    const socket = socketRef.current
    if (!socket?.connected || !conversationId) return
    socket.emit('join_conversation', conversationId)
  }, [])

  const leaveConversation = useCallback((conversationId: string) => {
    const socket = socketRef.current
    if (!socket?.connected || !conversationId) return
    socket.emit('leave_conversation', conversationId)
  }, [])

  const emitTyping = useCallback((conversationId: string, isTyping: boolean) => {
    const socket = socketRef.current
    if (!socket?.connected || !conversationId) return
    socket.emit('typing', { conversationId, isTyping })
  }, [])

  useEffect(() => {
    if (!userId) {
      releaseAppSocket()
      socketRef.current = null
      setConnected(false)
      return
    }

    const socket = getAppSocket(userId)
    socketRef.current = socket

    const handleConnect = () => {
      setConnected(true)
      const conv = selectedRef.current
      if (conv) joinConversation(conv)
    }

    const handleDisconnect = () => setConnected(false)

    const handleNewMessage = (data: NewMessagePayload) => {
      if (!data?.conversationId) return

      dispatch(api.util.invalidateTags(['Chat']))

      const active = selectedRef.current
      if (active !== data.conversationId) return

      if (!data.messageId) {
        return
      }

      dispatch(
        (api.util.updateQueryData as any)(
          'getMessages',
          { conversationId: data.conversationId },
          (draft: { messages?: unknown[] }) => {
            if (!draft?.messages) return
            const exists = (draft.messages as { id?: string }[]).some(
              (m) => m.id === data.messageId
            )
            if (exists) return
            ;(draft.messages as object[]).push({
              id: data.messageId,
              content: data.content ?? '',
              created_at: data.timestamp ?? new Date().toISOString(),
              sender_id: data.senderId,
              sender_type: data.senderType,
              is_read: false,
            })
          }
        )
      )
    }

    const handleReadUpdate = () => {
      dispatch(api.util.invalidateTags(['Chat']))
    }

    const handleUserTyping = (data: {
      conversationId?: string
      userId?: string
      isTyping?: boolean
    }) => {
      if (data.conversationId !== selectedRef.current) return
      if (!data.userId || data.userId === userIdRef.current) return
      onOtherPartyTyping?.(Boolean(data.isTyping))
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('new_message', handleNewMessage)
    socket.on('message_read_update', handleReadUpdate)
    socket.on('messages_read_update', handleReadUpdate)
    socket.on('user_typing', handleUserTyping)

    if (socket.connected) handleConnect()
    else setConnected(false)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('new_message', handleNewMessage)
      socket.off('message_read_update', handleReadUpdate)
      socket.off('messages_read_update', handleReadUpdate)
      socket.off('user_typing', handleUserTyping)
    }
  }, [userId, dispatch, joinConversation, onOtherPartyTyping])

  useEffect(() => {
    if (!selectedConversationId || !connected) return
    joinConversation(selectedConversationId)
    return () => leaveConversation(selectedConversationId)
  }, [selectedConversationId, connected, joinConversation, leaveConversation])

  return {
    socketRef,
    connected,
    joinConversation,
    leaveConversation,
    emitTyping,
  }
}
