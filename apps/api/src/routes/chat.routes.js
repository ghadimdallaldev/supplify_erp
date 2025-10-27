import express from 'express';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const createConversationSchema = z.object({
  supplierId: z.string().uuid(),
  restaurantId: z.string().uuid(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1),
  messageType: z.enum(['TEXT', 'SYSTEM', 'ORDER_REFERENCE']).default('TEXT'),
  orderId: z.string().uuid().optional(),
  attachments: z.array(z.object({
    fileUrl: z.string().url(),
    fileType: z.string(),
    fileName: z.string(),
    fileSize: z.number().optional(),
  })).optional(),
});

const quickReplySchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().optional(),
});

// Helper: Get or create conversation between supplier and restaurant
async function getOrCreateConversation(supplierId, restaurantId) {
  let { rows: conversations } = await query(`
    SELECT * FROM conversation
    WHERE supplier_id = $1 AND restaurant_id = $2
  `, [supplierId, restaurantId]);
  
  let conversation;
  
  if (conversations.length === 0) {
    // Create new conversation
    const { rows: newConversations } = await query(`
      INSERT INTO conversation (supplier_id, restaurant_id)
      VALUES ($1, $2)
      RETURNING *
    `, [supplierId, restaurantId]);
    
    conversation = newConversations[0];
    
    // Create participant records
    await query(`
      INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
      VALUES ($1, 'SUPPLIER', $2), ($1, 'RESTAURANT', $3)
    `, [conversation.id, supplierId, restaurantId]);
  } else {
    conversation = conversations[0];
  }
  
  return conversation;
}

// List conversations for current user
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    let queryText;
    let queryParams;
    
    if (req.userData.role === 'SUPPLIER') {
      // Get supplier's ID
      const { rows: suppliers } = await query(
        'SELECT id FROM supplier WHERE contact_email = $1',
        [req.userData.email]
      );
      
      if (suppliers.length === 0) {
        return res.json({
          ok: true,
          data: { conversations: [] },
          error: null,
          requestId: req.requestId,
        });
      }
      
      queryText = `
        SELECT 
          c.*,
          cp.unread_count,
          cp.last_read_at,
          s.name as supplier_name,
          r.name as restaurant_name,
          r.contact_email as restaurant_email,
          (SELECT content FROM message WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_preview
        FROM conversation c
        JOIN conversation_participant cp ON cp.conversation_id = c.id AND cp.participant_type = 'SUPPLIER'
        LEFT JOIN supplier s ON s.id = c.supplier_id
        LEFT JOIN restaurant r ON r.id = c.restaurant_id
        WHERE c.supplier_id = $1
        ORDER BY c.last_message_at DESC NULLS LAST
      `;
      queryParams = [suppliers[0].id];
    } else if (req.userData.role === 'RESTAURANT') {
      // Get restaurant's ID
      const { rows: restaurants } = await query(
        'SELECT id FROM restaurant WHERE contact_email = $1',
        [req.userData.email]
      );
      
      if (restaurants.length === 0) {
        return res.json({
          ok: true,
          data: { conversations: [] },
          error: null,
          requestId: req.requestId,
        });
      }
      
      queryText = `
        SELECT 
          c.*,
          cp.unread_count,
          cp.last_read_at,
          s.name as supplier_name,
          s.contact_email as supplier_email,
          r.name as restaurant_name,
          (SELECT content FROM message WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_preview
        FROM conversation c
        JOIN conversation_participant cp ON cp.conversation_id = c.id AND cp.participant_type = 'RESTAURANT'
        LEFT JOIN supplier s ON s.id = c.supplier_id
        LEFT JOIN restaurant r ON r.id = c.restaurant_id
        WHERE c.restaurant_id = $1
        ORDER BY c.last_message_at DESC NULLS LAST
      `;
      queryParams = [restaurants[0].id];
    } else {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Only suppliers and restaurants can access conversations',
        },
        requestId: req.requestId,
      });
    }
    
    const { rows } = await query(queryText, queryParams);
    
    res.json({
      ok: true,
      data: { conversations: rows },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('List conversations error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to list conversations',
      },
      requestId: req.requestId,
    });
  }
});

// Get or create conversation
router.post('/conversations', requireAuth, requireRole(['SUPPLIER', 'RESTAURANT']), async (req, res) => {
  try {
    const { supplierId, restaurantId } = createConversationSchema.parse(req.body);
    
    // Verify that the user has permission to create this conversation
    if (req.userData.role === 'SUPPLIER') {
      const { rows: suppliers } = await query(
        'SELECT id FROM supplier WHERE contact_email = $1 AND id = $2',
        [req.userData.email, supplierId]
      );
      
      if (suppliers.length === 0) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'You can only create conversations as yourself',
          },
          requestId: req.requestId,
        });
      }
    } else if (req.userData.role === 'RESTAURANT') {
      const { rows: restaurants } = await query(
        'SELECT id FROM restaurant WHERE contact_email = $1 AND id = $2',
        [req.userData.email, restaurantId]
      );
      
      if (restaurants.length === 0) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'You can only create conversations as yourself',
          },
          requestId: req.requestId,
        });
      }
    }
    
    const conversation = await getOrCreateConversation(supplierId, restaurantId);
    
    res.status(201).json({
      ok: true,
      data: { conversation },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid conversation data',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }
    
    logger.error('Create conversation error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create conversation',
      },
      requestId: req.requestId,
    });
  }
});

// Get conversation messages
router.get('/conversations/:conversationId/messages', requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = '50', offset = '0' } = req.query;
    
    // Verify conversation access
    const { rows: conversations } = await query(`
      SELECT * FROM conversation WHERE id = $1
    `, [conversationId]);
    
    if (conversations.length === 0) {
      throw new NotFoundError('Conversation not found');
    }
    
    // Get messages
    const { rows: messages } = await query(`
      SELECT 
        m.*,
        s.name as supplier_name,
        r.name as restaurant_name
      FROM message m
      LEFT JOIN supplier s ON s.id = m.sender_id AND m.sender_type = 'SUPPLIER'
      LEFT JOIN restaurant r ON r.id = m.sender_id AND m.sender_type = 'RESTAURANT'
      WHERE m.conversation_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `, [conversationId, limit, offset]);
    
    // Get attachments for messages
    const messageIds = messages.map(m => m.id);
    let attachments = [];
    
    if (messageIds.length > 0) {
      const { rows: attRows } = await query(`
        SELECT * FROM message_attachment
        WHERE message_id = ANY($1)
      `, [messageIds]);
      attachments = attRows;
    }
    
    // Group attachments by message_id
    const attachmentsByMessage = {};
    attachments.forEach(att => {
      if (!attachmentsByMessage[att.message_id]) {
        attachmentsByMessage[att.message_id] = [];
      }
      attachmentsByMessage[att.message_id].push(att);
    });
    
    // Add attachments to messages
    const messagesWithAttachments = messages.map(msg => ({
      ...msg,
      attachments: attachmentsByMessage[msg.id] || []
    }));
    
    res.json({
      ok: true,
      data: { messages: messagesWithAttachments.reverse() }, // Return in chronological order
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get messages error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get messages',
      },
      requestId: req.requestId,
    });
  }
});

// Send a message
router.post('/conversations/:conversationId/messages', requireAuth, requireRole(['SUPPLIER', 'RESTAURANT']), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const messageData = sendMessageSchema.parse(req.body);
    
    // Verify conversation and access
    const { rows: conversations } = await query(`
      SELECT * FROM conversation WHERE id = $1
    `, [conversationId]);
    
    if (conversations.length === 0) {
      throw new NotFoundError('Conversation not found');
    }
    
    const conversation = conversations[0];
    
    // Get sender ID
    let senderId;
    if (req.userData.role === 'SUPPLIER') {
      const { rows: suppliers } = await query(
        'SELECT id FROM supplier WHERE contact_email = $1 AND id = $2',
        [req.userData.email, conversation.supplier_id]
      );
      
      if (suppliers.length === 0) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Access denied',
          },
          requestId: req.requestId,
        });
      }
      
      senderId = suppliers[0].id;
    } else if (req.userData.role === 'RESTAURANT') {
      const { rows: restaurants } = await query(
        'SELECT id FROM restaurant WHERE contact_email = $1 AND id = $2',
        [req.userData.email, conversation.restaurant_id]
      );
      
      if (restaurants.length === 0) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Access denied',
          },
          requestId: req.requestId,
        });
      }
      
      senderId = restaurants[0].id;
    }
    
    // Start transaction
    await query('BEGIN');
    
    try {
      // Create message
      const { rows: messages } = await query(`
        INSERT INTO message (
          conversation_id, sender_type, sender_id, content, message_type, order_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        conversationId,
        req.userData.role,
        senderId,
        messageData.content,
        messageData.messageType,
        messageData.orderId || null,
      ]);
      
      const message = messages[0];
      
      // Add attachments if any
      if (messageData.attachments && messageData.attachments.length > 0) {
        for (const attachment of messageData.attachments) {
          await query(`
            INSERT INTO message_attachment (message_id, file_url, file_type, file_name, file_size)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            message.id,
            attachment.fileUrl,
            attachment.fileType,
            attachment.fileName,
            attachment.fileSize || null,
          ]);
        }
      }
      
      await query('COMMIT');
      
      // Fetch message with attachments
      const { rows: fullMessages } = await query(`
        SELECT m.*, COALESCE(
          json_agg(
            json_build_object(
              'id', ma.id,
              'fileUrl', ma.file_url,
              'fileType', ma.file_type,
              'fileName', ma.file_name,
              'fileSize', ma.file_size
            )
          ) FILTER (WHERE ma.id IS NOT NULL),
          '[]'::json
        ) as attachments
        FROM message m
        LEFT JOIN message_attachment ma ON ma.message_id = m.id
        WHERE m.id = $1
        GROUP BY m.id
      `, [message.id]);
      
      logger.info('Message sent', { 
        messageId: message.id,
        conversationId,
        actor: req.userData.id 
      });
      
      res.status(201).json({
        ok: true,
        data: { message: fullMessages[0] },
        error: null,
        requestId: req.requestId,
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid message data',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }
    
    logger.error('Send message error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to send message',
      },
      requestId: req.requestId,
    });
  }
});

// Mark conversation as read
router.patch('/conversations/:conversationId/read', requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // Reset unread count
    const participantType = req.userData.role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT';
    
    await query(`
      UPDATE conversation_participant
      SET unread_count = 0,
          last_read_at = now(),
          updated_at = now()
      WHERE conversation_id = $1 AND participant_type = $2
    `, [conversationId, participantType]);
    
    res.json({
      ok: true,
      data: { message: 'Conversation marked as read' },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Mark as read error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to mark as read',
      },
      requestId: req.requestId,
    });
  }
});

// Quick reply templates (for suppliers)
router.get('/quick-replies', requireAuth, requireRole(['SUPPLIER']), async (req, res) => {
  try {
    const { rows: suppliers } = await query(
      'SELECT id FROM supplier WHERE contact_email = $1',
      [req.userData.email]
    );
    
    if (suppliers.length === 0) {
      return res.json({
        ok: true,
        data: { templates: [] },
        error: null,
        requestId: req.requestId,
      });
    }
    
    const { rows } = await query(`
      SELECT * FROM quick_reply_template
      WHERE supplier_id = $1 AND is_active = true
      ORDER BY usage_count DESC, title ASC
    `, [suppliers[0].id]);
    
    res.json({
      ok: true,
      data: { templates: rows },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get quick replies error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get quick replies',
      },
      requestId: req.requestId,
    });
  }
});

// Create quick reply template
router.post('/quick-replies', requireAuth, requireRole(['SUPPLIER']), async (req, res) => {
  try {
    const templateData = quickReplySchema.parse(req.body);
    
    const { rows: suppliers } = await query(
      'SELECT id FROM supplier WHERE contact_email = $1',
      [req.userData.email]
    );
    
    if (suppliers.length === 0) {
      throw new ValidationError('Supplier not found');
    }
    
    const { rows } = await query(`
      INSERT INTO quick_reply_template (supplier_id, title, content, category)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      suppliers[0].id,
      templateData.title,
      templateData.content,
      templateData.category || null,
    ]);
    
    res.status(201).json({
      ok: true,
      data: { template: rows[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid template data',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }
    
    logger.error('Create quick reply error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create quick reply',
      },
      requestId: req.requestId,
    });
  }
});

export { router as chatRoutes };
