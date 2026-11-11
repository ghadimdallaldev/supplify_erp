import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({ query: vi.fn(), pool: { query: vi.fn() } }))
vi.mock('../lib/rate-limit-store.js', () => ({ createRateLimitStore: () => undefined }))
vi.mock('../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { query } from '../lib/db.js'
import { demoCampaignRoutes, demoCampaignAdminRoutes } from './demo-campaign.routes.js'

const lead = {
  name: 'Demo Visitor',
  company: 'Example Bistro',
  role: 'restaurant',
  whatsapp: '71 123 456',
  locations: '2-5',
  consent: true,
  utm_source: 'qr',
  qr_variant: 'restaurant',
}
const app = express()
app.use(express.json())
app.use('/public', demoCampaignRoutes)
// Internal handler tests below; production mount supplies auth and ADMIN_GROWTH.
app.use('/admin', demoCampaignAdminRoutes)

beforeEach(() => {
  vi.clearAllMocks()
  query.mockResolvedValue({ rows: [], rowCount: 0 })
})

describe('public demo campaign', () => {
  it('stores consent and normalized phone with QR attribution without creating a tenant', async () => {
    const response = await request(app).post('/public/leads').send(lead)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, args] = query.mock.calls[0]
    expect(sql).toContain('INSERT INTO demo_campaign_lead')
    expect(sql).toContain('ON CONFLICT (phone_normalized) DO NOTHING')
    expect(args).toContain('+96171123456')
    expect(args).toContain('restaurant')
    expect(args).toContain('qr')
    expect(sql).not.toMatch(/INSERT INTO (?:restaurant|supplier|app_user)\b/)
  })
  it('requires consent and the correct size band', async () => {
    const response = await request(app)
      .post('/public/leads')
      .send({ ...lead, consent: false, locations: undefined })
    expect(response.status).toBe(400)
    expect(response.body.fields.consent).toBeTruthy()
    expect(query).not.toHaveBeenCalled()
  })
  it('rejects invalid phone and supplier size', async () => {
    const response = await request(app)
      .post('/public/leads')
      .send({ ...lead, role: 'supplier', whatsapp: 'invalid' })
    expect(response.status).toBe(400)
    expect(response.body.fields.whatsapp).toBeTruthy()
    expect(response.body.fields.restaurantCustomers).toBeTruthy()
    expect(query).not.toHaveBeenCalled()
  })
  it('drops honeypots silently without storing anything', async () => {
    expect(
      (await request(app).post('/public/leads').send({ website: 'https://bot.invalid' })).body
    ).toEqual({ ok: true })
    expect(query).not.toHaveBeenCalled()
  })
  it('does not expose duplicate status or public lead reads', async () => {
    const response = await request(app).post('/public/leads').send(lead)
    expect(response.body).toEqual({ ok: true })
    expect((await request(app).get('/public/leads')).status).toBe(404)
  })
  it('only stores allowed anonymous funnel metadata', async () => {
    const response = await request(app).post('/public/events').send({
      name: 'video_start',
      sessionId: 'qa-session-123',
      role: 'supplier',
      ip: '1.2.3.4',
      email: 'ignore@example.test',
    })
    expect(response.status).toBe(204)
    expect(query.mock.calls[0][1]).toEqual([
      'video_start',
      'qa-session-123',
      'supplier',
      null,
      null,
      null,
      null,
      null,
    ])
  })
  it('rejects arbitrary events', async () => {
    expect(
      (
        await request(app)
          .post('/public/events')
          .send({ name: 'arbitrary', sessionId: 'qa-session-123' })
      ).status
    ).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })
})

describe('campaign admin handlers', () => {
  it('neutralises spreadsheet formulas in quoted CSV cells', async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: 1,
          name: '=HYPERLINK("x")',
          company: '+formula',
          whatsapp: '+96171123456',
          notes: 'a,b',
        },
      ],
    })
    const response = await request(app).get('/admin/export.csv')
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.text).toContain("'+formula")
    expect(response.text).toContain('"\'=HYPERLINK(""x"")"')
    expect(response.text).toContain('"a,b"')
  })
  it('rejects invalid IDs and unknown update fields', async () => {
    expect(
      (await request(app).patch('/admin/leads/invalid').send({ status: 'contacted' })).status
    ).toBe(400)
    expect((await request(app).patch('/admin/leads/1').send({ company: 'changed' })).status).toBe(
      400
    )
    expect(query).not.toHaveBeenCalled()
  })
  it('updates only the selected lead status and notes', async () => {
    query.mockResolvedValue({ rows: [{ id: 1 }] })
    expect(
      (
        await request(app)
          .patch('/admin/leads/1')
          .send({ status: 'contacted', notes: 'Requested a call' })
      ).status
    ).toBe(200)
    expect(query.mock.calls[0][1]).toEqual(['contacted', 'Requested a call', 1])
  })
})
