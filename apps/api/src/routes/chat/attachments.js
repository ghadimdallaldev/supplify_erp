/**
 * Chat attachments are served only through this endpoint (spec §11.4): it re-checks that the
 * caller may open the conversation (participant, tenant, chat feature, and for suppliers "not
 * blocked") and redirects to a 5-minute signed object URL. Stored `file_url`s never leave the
 * API, so a forwarded or cached link stops working once access is gone.
 */
import express from 'express'
import { requireAuth, resolveTenantContext, requirePermission } from '../../lib/rbac.js'
import { query } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { resolveUploadKeyFromPublicUrl } from '../../lib/sanitize-upload.js'
import { signObjectAccessParams } from '../../lib/object-download-auth.js'
import { chatFeatureGateUnlessAdmin, userCanAccessConversation } from './chat.helpers.js'

export const CHAT_ATTACHMENT_URL_TTL_SEC = 300

/** Client-facing path for an attachment (never the stored object URL). */
export function chatAttachmentPath(attachmentId) {
  return `/api/chat/attachments/${attachmentId}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function notFound(res, req) {
  return res.status(404).json({
    ok: false,
    data: null,
    error: { name: 'NOT_FOUND', message: 'Attachment not found' },
    requestId: req.requestId,
  })
}

const router = express.Router()

router.get(
  '/attachments/:attachmentId',
  requireAuth,
  resolveTenantContext,
  chatFeatureGateUnlessAdmin,
  requirePermission('CHAT_VIEW'),
  async (req, res) => {
    try {
      const { attachmentId } = req.params
      if (!UUID_RE.test(String(attachmentId))) return notFound(res, req)
      const { rows } = await query(
        `SELECT ma.file_url, c.id, c.supplier_id, c.restaurant_id, c.is_admin_conversation
         FROM message_attachment ma
         JOIN message m ON m.id = ma.message_id
         JOIN conversation c ON c.id = m.conversation_id
         WHERE ma.id = $1`,
        [attachmentId]
      )
      const row = rows[0]
      if (!row) return notFound(res, req)
      const conversation = {
        id: row.id,
        supplier_id: row.supplier_id,
        restaurant_id: row.restaurant_id,
        is_admin_conversation: row.is_admin_conversation,
      }
      if (!(await userCanAccessConversation(req, conversation))) return notFound(res, req)

      let key = null
      try {
        const stored = String(row.file_url || '')
        key = resolveUploadKeyFromPublicUrl(
          stored.startsWith('/') ? `http://stored.invalid${stored}` : stored
        )
      } catch {
        key = null
      }
      if (!key || !key.startsWith('uploads/')) return notFound(res, req)
      const { exp, sig } = signObjectAccessParams(key, CHAT_ATTACHMENT_URL_TTL_SEC)
      const target = `/api/files/object?key=${encodeURIComponent(key)}&exp=${encodeURIComponent(exp)}&sig=${encodeURIComponent(sig)}`
      res.setHeader('Cache-Control', 'private, no-store')
      return res.redirect(302, target)
    } catch (error) {
      logger.error('Chat attachment error:', error)
      return res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to open attachment' },
        requestId: req.requestId,
      })
    }
  }
)

export default router
