import { Server } from 'socket.io'
import { logger } from './logger.js'
import { config } from '../config/env.js'
import { verifyToken } from './auth.js'
import { query } from './db.js'
import { persistMessageFromSocket } from '../services/chatSocket.service.js'
import { userCanAccessConversation } from './chat-access.js'

let io = null

export function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: config.WEB_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie || ''
      const accessToken = cookieHeader
        .split(';')
        .map((c) => {
          const i = c.indexOf('=')
          return [c.slice(0, i).trim(), c.slice(i + 1).trim()]
        })
        .find(([k]) => k === 'access_token')?.[1]
      if (!accessToken) {
        return next(new Error('Unauthorized: no access token'))
      }
      const payload = await verifyToken(accessToken)
      const { rows } = await query(
        `SELECT id, role, supplier_id, restaurant_id FROM app_user WHERE keycloak_sub = $1`,
        [payload.sub]
      )
      if (rows.length === 0) {
        return next(new Error('Unauthorized: user not found'))
      }
      socket.data.userId = rows[0].id
      socket.data.role = rows[0].role
      socket.data.tenantId = rows[0].supplier_id || rows[0].restaurant_id || null
      next()
    } catch {
      next(new Error('Unauthorized: invalid token'))
    }
  })

  io.on('connection', (socket) => {
    logger.info({
      msg: 'WebSocket client connected',
      socketId: socket.id,
      userId: socket.data.userId,
      role: socket.data.role,
      tenantId: socket.data.tenantId,
    })

    // Handle joining a conversation
    socket.on('join_conversation', async (conversationId) => {
      try {
        if (!conversationId || typeof conversationId !== 'string') return
        const allowed = await userCanAccessConversation(socket.data.userId, conversationId)
        if (!allowed) {
          logger.warn('Socket join denied', { socketId: socket.id, conversationId })
          return
        }
        socket.join(`conversation_${conversationId}`)
        logger.info('Client joined conversation', { socketId: socket.id, conversationId })
      } catch (err) {
        logger.error('join_conversation handler error', {
          socketId: socket.id,
          conversationId,
          err,
        })
      }
    })

    // Handle leaving a conversation
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation_${conversationId}`)
      logger.info('Client left conversation', { socketId: socket.id, conversationId })
    })

    // Handle sending a message (fallback for clients that only emit socket; persist so message is not lost)
    socket.on('send_message', async (data) => {
      try {
        if (!data || typeof data !== 'object') return
        const { conversationId, content } = data
        const senderId = socket.data.userId

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
      } catch (err) {
        logger.error('send_message handler error', { socketId: socket.id, err })
      }
    })

    // Handle message read status update
    socket.on('message_read', (data) => {
      try {
        if (!data || typeof data !== 'object') return
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
      } catch (err) {
        logger.error('message_read handler error', { socketId: socket.id, err })
      }
    })

    // Handle typing indicator
    socket.on('typing', (data) => {
      try {
        if (!data || typeof data !== 'object') return
        const { conversationId, isTyping } = data

        logger.debug('Typing indicator', {
          socketId: socket.id,
          conversationId,
          isTyping,
        })

        // Broadcast typing status to all clients in the conversation except sender
        socket.to(`conversation_${conversationId}`).emit('user_typing', {
          conversationId,
          userId: socket.data.userId,
          isTyping,
          timestamp: new Date().toISOString(),
        })
      } catch (err) {
        logger.error('typing handler error', { socketId: socket.id, err })
      }
    })

    socket.on('disconnect', () => {
      logger.info({
        msg: 'WebSocket client disconnected',
        socketId: socket.id,
        userId: socket.data.userId,
        role: socket.data.role,
        tenantId: socket.data.tenantId,
      })
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

/**
 * Notify all connected clients to refetch entitlements (global or tenant feature flag change).
 * Safe to call before Socket.IO is initialized (no-op).
 * @param {Record<string, unknown>} payload
 */
export function emitEntitlementsRefreshNotice(payload) {
  if (!io) {
    logger.debug('emitEntitlementsRefreshNotice skipped: socket not initialized', payload)
    return
  }
  io.emit('entitlements_refresh', {
    ...payload,
    at: new Date().toISOString(),
  })
}
