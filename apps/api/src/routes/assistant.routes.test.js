import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, _res, next) => {
    req.userData = req.userData || { id: 'user-1', role: 'RESTAURANT', preferred_locale: 'en' }
    req.requestId = 'test-req'
    next()
  },
  resolveTenantContext: (req, _res, next) => {
    req.tenantContext = {
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
      roles: ['Purchaser'],
      permissions: ['INVENTORY_VIEW', 'ORDERS_VIEW'],
    }
    next()
  },
  resolveAdminContext: (_req, _res, next) => next(),
}))

vi.mock('../services/assistant-chat.service.js', () => ({
  getAssistantCapabilities: vi.fn(async () => ({
    enabled: true,
    tools: ['get_inventory'],
    quotaRemaining: 10,
  })),
  buildAssistantContext: vi.fn(async () => ({
    tenantId: 'rest-1',
    tenantType: 'RESTAURANT',
    userId: 'user-1',
    permissions: ['INVENTORY_VIEW'],
    roles: [],
    isAdmin: false,
    isImpersonating: false,
    driverId: null,
    preferredLocale: 'en',
  })),
  listConversations: vi.fn(async () => []),
  createConversation: vi.fn(async () => ({
    id: 'conv-1',
    title: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  listMessages: vi.fn(async () => []),
  sendAssistantMessage: vi.fn(async () => ({
    conversationId: 'conv-1',
    reply: 'You have 12 kg of tomatoes.',
    sources: [{ tool: 'get_inventory', args: { search: 'tomato' }, ok: true }],
    usedLlm: true,
  })),
}))

import { assistantRoutes } from './assistant.routes.js'
import { sendAssistantMessage } from '../services/assistant-chat.service.js'

describe('assistant routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use('/api/assistant', assistantRoutes)
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({
        ok: false,
        error: { message: err.message },
      })
    })
  })

  it('GET /capabilities returns tools', async () => {
    const res = await request(app).get('/api/assistant/capabilities').expect(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.enabled).toBe(true)
    expect(res.body.data.tools).toContain('get_inventory')
  })

  it('POST /messages validates body and returns reply', async () => {
    const res = await request(app)
      .post('/api/assistant/messages')
      .send({ message: 'how many tomato kilos?' })
      .expect(200)
    expect(res.body.data.reply).toMatch(/12 kg/)
    expect(sendAssistantMessage).toHaveBeenCalled()
  })

  it('POST /messages rejects empty message', async () => {
    await request(app).post('/api/assistant/messages').send({ message: '' }).expect(400)
  })
})
