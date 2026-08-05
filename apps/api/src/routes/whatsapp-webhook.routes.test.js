import express from 'express'
import { createHmac } from 'node:crypto'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const processWhatsAppWebhook = vi.fn()

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../config/env.js', () => ({
  config: {
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-token',
    WHATSAPP_APP_SECRET: 'app-secret',
  },
}))

vi.mock('../services/whatsapp/webhook.service.js', () => ({
  processWhatsAppWebhook: (...args) => processWhatsAppWebhook(...args),
}))

import { whatsappWebhookRoutes } from './whatsapp-webhook.routes.js'

function buildApp() {
  const app = express()
  app.use(
    '/webhooks/whatsapp',
    express.raw({ type: 'application/json', limit: '1mb' }),
    whatsappWebhookRoutes
  )
  return app
}

function signBody(body, secret = 'app-secret') {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

describe('whatsapp-webhook.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    processWhatsAppWebhook.mockResolvedValue({ processed: 1 })
  })

  it('GET returns hub.challenge when verify token matches', async () => {
    const app = buildApp()
    const res = await request(app)
      .get('/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-token',
        'hub.challenge': 'challenge-123',
      })
      .expect(200)

    expect(res.text).toBe('challenge-123')
  })

  it('GET rejects invalid verify token', async () => {
    const app = buildApp()
    await request(app)
      .get('/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong',
        'hub.challenge': 'challenge-123',
      })
      .expect(403)
  })

  it('POST processes a signed webhook payload', async () => {
    const app = buildApp()
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
    const body = Buffer.from(payload, 'utf8')

    await request(app)
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signBody(body))
      .send(payload)
      .expect(200)

    expect(processWhatsAppWebhook).toHaveBeenCalledWith({
      object: 'whatsapp_business_account',
      entry: [],
    })
  })

  it('POST rejects invalid signature', async () => {
    const app = buildApp()
    const body = Buffer.from('{"object":"whatsapp_business_account"}')

    await request(app)
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=invalid')
      .send(body)
      .expect(403)

    expect(processWhatsAppWebhook).not.toHaveBeenCalled()
  })
})
