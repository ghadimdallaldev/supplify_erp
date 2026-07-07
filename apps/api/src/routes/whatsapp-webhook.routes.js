import express from 'express'
import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'
import {
  parseWhatsAppWebhookBody,
  verifyWhatsAppChallenge,
  verifyWhatsAppSignature,
} from '../lib/whatsapp-webhook.js'
import { processWhatsAppWebhook } from '../services/whatsapp/webhook.service.js'

const router = express.Router()

/**
 * Meta webhook verification handshake.
 * GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 */
router.get('/', (req, res) => {
  const verifyToken = config.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  if (!verifyToken) {
    logger.warn('WhatsApp webhook verify token is not configured')
    return res.status(503).send('Webhook verify token not configured')
  }

  const result = verifyWhatsAppChallenge(req.query, verifyToken)
  if (!result.ok) {
    return res.sendStatus(403)
  }

  return res.status(200).type('text/plain').send(result.challenge)
})

/**
 * Meta webhook event delivery.
 * POST /webhooks/whatsapp
 */
router.post('/', async (req, res) => {
  const rawBody = req.body
  if (!Buffer.isBuffer(rawBody)) {
    return res.sendStatus(400)
  }

  const appSecret = config.WHATSAPP_APP_SECRET
  if (!appSecret) {
    logger.warn('WhatsApp webhook app secret is not configured')
    return res.status(503).send('Webhook app secret not configured')
  }

  const signature = req.get('X-Hub-Signature-256')
  if (!verifyWhatsAppSignature(rawBody, signature, appSecret)) {
    logger.warn('WhatsApp webhook signature verification failed')
    return res.sendStatus(403)
  }

  let payload
  try {
    payload = parseWhatsAppWebhookBody(rawBody)
  } catch (error) {
    logger.warn('WhatsApp webhook invalid JSON body', { error: error.message })
    return res.sendStatus(400)
  }

  try {
    await processWhatsAppWebhook(payload)
  } catch (error) {
    logger.error('WhatsApp webhook processing error', { error: error.message })
  }

  // Meta expects a quick 200 even if downstream processing fails.
  return res.sendStatus(200)
})

export { router as whatsappWebhookRoutes }
