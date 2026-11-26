import { Server } from 'socket.io'
import { logger } from './logger.js'
import { config } from '../config/env.js'
import { persistMessageFromSocket } from '../services/chatSocket.service.js'
import { userCanAccessConversation } from './chat-access.js'
import { resolveSocketUserFromCookieHeader } from './socket-auth.js'
import { attachSocketRedisAdapter } from './socket-redis-adapter.js'
import { query } from './db.js'
import { canReceiveTenantEvent } from './tenant-event-access.js'
import { onRelationshipChanged } from './relationship.js'

let unregisterChatRelationshipHook = null

/**
 * A relationship change (follow, unfollow, block, unblock) may close or reopen chat between a
 * restaurant and every branch of a supplier organisation. Conversations exist per branch, so
 * load all of them, drop the supplier branch's sockets from each conversation room (clients
 * re-join if still allowed), and tell both tenants to refetch the conversation's access.
 */
export async function revokeConversationSocketsForRelationship({ restaurantId, supplierOrgId }) {
  if (!io || !restaurantId || !supplierOrgId) return
  const { rows } = await query(
    `SELECT c.id, c.supplier_id
     FROM conversation c
     JOIN supplier s ON s.id = c.supplier_id
     WHERE c.restaurant_id = $1 AND COALESCE(s.organization_id, s.id) = $2
       AND COALESCE(c.is_admin_conversation, false) = false`,
    [restaurantId, supplierOrgId]
  )
  for (const conversation of rows) {
    io.in(supplierRoom(conversation.supplier_id)).socketsLeave(`conversation_${conversation.id}`)
    const payload = { conversationId: conversation.id }
    io.to(supplierRoom(conversation.supplier_id)).emit('conversation_access_changed', payload)
    io.to(restaurantRoom(restaurantId)).emit('conversation_access_changed', payload)
  }
}

let io = null

export async function emitAuthorizedRoom(
  room,
  event,
  payload,
  exceptSocketId = null,
  context = null
) {
  if (!io) return
  try {
    const sockets = await io.in(room).fetchSockets()
    const decisions = new Map()
    for (const socket of sockets) {
      if (socket.id === exceptSocketId) continue
      const data = socket.data
      if (!Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) continue
      if (
        context &&
        (context.tenantId !== data.tenantId ||
          context.tenantType !== (data.tenantType ?? data.role))
      )
        continue
      const key = `${data.userId}:${data.tenantId}:${data.tenantType}`
      if (!decisions.has(key))
        decisions.set(
          key,
          (async () => {
            if (room === userRoom(data.userId) && ['ADMIN', 'CONSUMER'].includes(data.role)) {
              const { rows } = await query(
                'SELECT id FROM app_user WHERE id = $1 AND role = $2 AND is_active = TRUE',
                [data.userId, data.role]
              )
              return rows.length > 0
            }
            if (room.startsWith('conversation_')) {
              return userCanAccessConversation(data.userId, room.slice('conversation_'.length), {
                tenantId: data.tenantId,
                role: data.role,
                requiredPermission: 'CHAT_VIEW',
              })
            }
            return canReceiveTenantEvent({
              userId: data.userId,
              tenantId: data.tenantId,
              tenantType: data.tenantType,
              orderId:
                event === 'consumer_order_new'
                  ? null
                  : (payload?.orderId ??
                    (payload?.reference_type === 'ORDER' ? payload.reference_id : null)),
              warehouseId: payload?.warehouseId ?? null,
              driverId: payload?.driverId ?? null,
              referenceType:
                event === 'consumer_order_new' ? 'ORDER' : (payload?.reference_type ?? null),
              gps: event === 'driver_location_updated' || event === 'driver_tracking_status',
            })
          })()
        )
      if (await decisions.get(key)) socket.emit(event, payload)
    }
  } catch (error) {
    logger.warn('Socket delivery denied because access could not be verified', {
      event,
      error: error.message,
    })
  }
}

function userRoom(userId) {
  return `user_${userId}`
}

function restaurantRoom(restaurantId) {
  return `restaurant_${restaurantId}`
}
function supplierRoom(supplierId) {
  return `supplier_${supplierId}`
}

/**
 * @param {string} restaurantId
 * @param {string} event
 * @param {unknown} payload
 */
export function emitToRestaurant(restaurantId, event, payload) {
  if (!io || !restaurantId) return
  void emitAuthorizedRoom(restaurantRoom(restaurantId), event, payload)
}
/** Broadcast only after durable acceptance; PostgreSQL remains the source of truth. */
export async function emitDriverLocationUpdated({ supplierId, orderId = null, payload }) {
  if (!io || !supplierId || config.GPS_LIVE_EVENTS_ENABLED !== true) return
  await emitAuthorizedRoom(supplierRoom(supplierId), 'driver_location_updated', payload)
  if (!orderId) return
  const { rows } = await query(
    `SELECT o.restaurant_id
     FROM customer_order o
     JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $2
     WHERE o.id = $1 LIMIT 1`,
    [orderId, supplierId]
  )
  const restaurantId = rows[0]?.restaurant_id
  if (restaurantId) {
    await emitAuthorizedRoom(restaurantRoom(restaurantId), 'driver_location_updated', {
      sessionId: payload.sessionId,
      driverId: payload.driverId,
      orderId,
      location: payload.location,
    })
  }
}

export function emitDriverTrackingStatus({
  supplierId,
  routeId = null,
  driverId,
  status,
  reason = null,
}) {
  if (!io || !supplierId || config.GPS_LIVE_EVENTS_ENABLED !== true) return
  void emitAuthorizedRoom(supplierRoom(supplierId), 'driver_tracking_status', {
    supplierId,
    routeId,
    driverId,
    status,
    reason,
    at: new Date().toISOString(),
  })
}

/**
 * Notify kitchen staff of a new guest order.
 * @param {string} restaurantId
 * @param {Record<string, unknown>} order
 */
export function emitConsumerOrderNew(restaurantId, order) {
  emitToRestaurant(restaurantId, 'consumer_order_new', {
    orderId: order.id,
    orderNumber: order.order_number,
    status: order.status,
    fulfillmentType: order.fulfillment_type,
    totalAmount: order.total_amount,
    createdAt: order.created_at,
  })
}

/**
 * @param {Record<string, unknown>} notification
 * @returns {Record<string, unknown>}
 */
export function serializeNotificationPayload(notification) {
  if (!notification || typeof notification !== 'object') return {}
  let metadata = notification.metadata
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata)
    } catch {
      metadata = null
    }
  }
  return {
    id: notification.id,
    title: notification.title ?? null,
    message: notification.message ?? null,
    reference_type: notification.reference_type ?? null,
    reference_id: notification.reference_id ?? null,
    metadata: metadata ?? null,
    created_at: notification.created_at ?? new Date().toISOString(),
    is_read: Boolean(notification.is_read),
    notification_type: notification.notification_type ?? null,
    notification_category: notification.notification_category ?? null,
  }
}

/**
 * @param {string} userId
 * @param {string} event
 * @param {unknown} payload
 */
export function emitToUser(userId, event, payload) {
  if (!io || !userId) return
  void emitAuthorizedRoom(userRoom(userId), event, payload)
}

/**
 * Push in-app notification to connected clients for a user.
 * @param {Record<string, unknown>} notification
 */
export function emitNotificationNew(notification) {
  const userId = notification?.user_id || notification?.userId
  if (!io) {
    logger.debug('emitNotificationNew skipped: socket not initialized')
    return
  }
  if (!userId) {
    return
  }
  const payload = serializeNotificationPayload(notification)
  void emitAuthorizedRoom(userRoom(userId), 'notification_new', payload, null, {
    tenantId: notification.tenant_id ?? null,
    tenantType: notification.user_type,
  })
}

export async function initializeSocket(server) {
  io = new Server(server, {
    maxHttpBufferSize: 1_000_000,
    cors: {
      origin: config.WEB_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  await attachSocketRedisAdapter(io)

  if (unregisterChatRelationshipHook) unregisterChatRelationshipHook()
  unregisterChatRelationshipHook = onRelationshipChanged((event) =>
    revokeConversationSocketsForRelationship(event)
  )

  io.use(async (socket, next) => {
    try {
      const { user, tenantId, tenantType, expiresAt } = await resolveSocketUserFromCookieHeader(
        socket.handshake.headers.cookie || ''
      )
      socket.data.userId = user.id
      socket.data.role = user.role
      socket.data.tenantId = tenantId
      socket.data.tenantType = tenantType
      socket.data.expiresAt = expiresAt
      next()
    } catch (error) {
      const message =
        error?.code === 'NO_ACCESS_TOKEN' ? error.message : 'Unauthorized: invalid token'
      logger.debug('Socket authentication failed', { message: error?.message })
      next(new Error(message))
    }
  })

  io.on('connection', (socket) => {
    // Reconnection repeats the normal cookie/refresh handshake. Expired connections
    // cannot keep private subscriptions or send packets indefinitely.
    const expiryTimer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, Math.min(2_147_483_647, socket.data.expiresAt - Date.now()))
    )
    expiryTimer.unref?.()
    socket.use(async (_packet, next) => {
      try {
        if (!Number.isFinite(socket.data.expiresAt) || socket.data.expiresAt <= Date.now())
          throw new Error('Session expired')
        const { rows } = await query(
          'SELECT id FROM app_user WHERE id = $1 AND role = $2 AND is_active = TRUE',
          [socket.data.userId, socket.data.role]
        )
        if (!rows.length) throw new Error('Session revoked')
        next()
      } catch {
        next(new Error('Unauthorized'))
        socket.disconnect(true)
      }
    })
    const userId = socket.data.userId
    if (userId) {
      socket.join(userRoom(userId))
    }
    // tenantId is only set after resolveSocketUserFromCookieHeader verified membership
    // (userCanAccessTenant); rooms follow the verified tenant type, not the client-visible role.
    if (socket.data.tenantId && socket.data.tenantType === 'RESTAURANT') {
      socket.join(restaurantRoom(socket.data.tenantId))
    }
    if (socket.data.tenantId && socket.data.tenantType === 'SUPPLIER') {
      socket.join(supplierRoom(socket.data.tenantId))
    }

    logger.info({
      msg: 'WebSocket client connected',
      socketId: socket.id,
      userId,
      role: socket.data.role,
      tenantId: socket.data.tenantId,
    })

    socket.on('join_conversation', async (conversationId) => {
      try {
        if (!conversationId || typeof conversationId !== 'string') return
        const allowed = await userCanAccessConversation(socket.data.userId, conversationId, {
          tenantId: socket.data.tenantId,
          role: socket.data.role,
          requiredPermission: 'CHAT_VIEW',
        })
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

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation_${conversationId}`)
      logger.info('Client left conversation', { socketId: socket.id, conversationId })
    })

    socket.on('send_message', async (data) => {
      try {
        if (!data || typeof data !== 'object') return
        const { conversationId, content } = data
        const senderId = socket.data.userId
        if (typeof content !== 'string' || content.length > 5000) return

        const allowed = await userCanAccessConversation(senderId, conversationId, {
          tenantId: socket.data.tenantId,
          role: socket.data.role,
          requiredPermission: 'CHAT_SEND',
        })
        if (!allowed) {
          socket.emit('chat_error', { code: 'FORBIDDEN', message: 'Chat send access denied' })
          return
        }
        logger.info('New message received via socket', {
          socketId: socket.id,
          conversationId,
          senderId,
          contentLength: content?.length ?? 0,
        })

        let messageId = null
        let timestamp = new Date().toISOString()
        if (conversationId && senderId && content) {
          const persisted = await persistMessageFromSocket(conversationId, senderId, content, {
            tenantId: socket.data.tenantId,
            role: socket.data.role,
            orderId: typeof data.orderId === 'string' ? data.orderId : null,
          })
          if (persisted?.error === 'CHAT_READ_ONLY') {
            socket.emit('chat_error', {
              code: 'CHAT_READ_ONLY',
              message: 'This conversation is read-only',
              openOrderIds: persisted.openOrderIds,
            })
            return
          }
          if (!persisted) {
            socket.emit('chat_error', { code: 'SEND_FAILED', message: 'Message was not sent' })
            return
          }
          messageId = persisted.id
          timestamp = persisted.created_at
          const { notifyMessageReceived } = await import('../services/notification.service.js')
          notifyMessageReceived({
            conversationId,
            senderType: socket.data.role,
            messagePreview: content.slice(0, 100),
          }).catch((err) =>
            logger.warn('Socket message notification failed', { error: err.message })
          )
        }
        await emitAuthorizedRoom(`conversation_${conversationId}`, 'new_message', {
          conversationId,
          content,
          senderId,
          senderType: socket.data.role,
          messageId,
          timestamp,
        })
      } catch (err) {
        logger.error('send_message handler error', { socketId: socket.id, err })
      }
    })

    socket.on('message_read', async (data) => {
      try {
        if (!data || typeof data !== 'object') return
        const { conversationId, messageId } = data
        const allowed = await userCanAccessConversation(socket.data.userId, conversationId, {
          tenantId: socket.data.tenantId,
          role: socket.data.role,
          requiredPermission: 'CHAT_VIEW',
        })
        if (!allowed) return

        await emitAuthorizedRoom(`conversation_${conversationId}`, 'message_read_update', {
          conversationId,
          messageId,
          timestamp: new Date().toISOString(),
        })
      } catch (err) {
        logger.error('message_read handler error', { socketId: socket.id, err })
      }
    })

    socket.on('typing', async (data) => {
      try {
        if (!data || typeof data !== 'object') return
        const { conversationId, isTyping } = data
        const allowed = await userCanAccessConversation(socket.data.userId, conversationId, {
          tenantId: socket.data.tenantId,
          role: socket.data.role,
          requiredPermission: 'CHAT_VIEW',
        })
        if (!allowed) return

        await emitAuthorizedRoom(
          `conversation_${conversationId}`,
          'user_typing',
          {
            conversationId,
            userId: socket.data.userId,
            isTyping,
            timestamp: new Date().toISOString(),
          },
          socket.id
        )
      } catch (err) {
        logger.error('typing handler error', { socketId: socket.id, err })
      }
    })

    socket.on('disconnect', () => {
      clearTimeout(expiryTimer)
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
