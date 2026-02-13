import { Server } from 'socket.io'
import { logger } from './logger.js'
import { config } from '../config/env.js'
import { persistMessageFromSocket } from '../services/chatSocket.service.js'

let io = null

export function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: config.WEB_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  io.on('connection', (socket) => {
    logger.info('Client connected', { socketId: socket.id })

    // Handle joining a conversation
    socket.on('join_conversation', async (conversationId) => {
      socket.join(`conversation_${conversationId}`)
      logger.info('Client joined conversation', { socketId: socket.id, conversationId })
    })

    // Handle leaving a conversation
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation_${conversationId}`)
      logger.info('Client left conversation', { socketId: socket.id, conversationId })
    })

    // Handle sending a message (fallback for clients that only emit socket; persist so message is not lost)
    socket.on('send_message', async (data) => {
      const { conversationId, content, senderId } = data

      logger.info('New message received via socket', {
        socketId: socket.id,
        conversationId,
        senderId,
        contentLength: content?.length ?? 0,
      })

      let messageId = null
      let timestamp = new Date().toISOString()
      if (conversationId && senderId && content) {
        const persisted = await persistMessageFromSocket(conversationId, senderId, content)
        if (persisted) {
          messageId = persisted.id
          timestamp = persisted.created_at
        }
      }

      // Broadcast so all clients (including REST senders) can refetch or merge
      io.to(`conversation_${conversationId}`).emit('new_message', {
        conversationId,
        content,
        senderId,
        messageId,
        timestamp,
      })
    })

    // Handle message read status update
    socket.on('message_read', (data) => {
      const { conversationId, messageId } = data

      logger.info('Message read status update', {
        socketId: socket.id,
        conversationId,
        messageId,
      })

      // Broadcast read status to all clients in the conversation
      io.to(`conversation_${conversationId}`).emit('message_read_update', {
        conversationId,
        messageId,
        timestamp: new Date().toISOString(),
      })
    })

    // Handle typing indicator
    socket.on('typing', (data) => {
      const { conversationId, isTyping } = data

      logger.debug('Typing indicator', {
        socketId: socket.id,
        conversationId,
        isTyping,
      })

      // Broadcast typing status to all clients in the conversation except sender
      socket.to(`conversation_${conversationId}`).emit('user_typing', {
        conversationId,
        userId: socket.id,
        isTyping,
        timestamp: new Date().toISOString(),
      })
    })

    socket.on('disconnect', () => {
      logger.info('Client disconnected', { socketId: socket.id })
    })
  })

  logger.info('Socket.IO initialized')
  return io
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket() first.')
  }
  return io
}
