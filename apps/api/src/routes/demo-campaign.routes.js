import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { query } from '../lib/db.js'
import { createRateLimitStore } from '../lib/rate-limit-store.js'
import {
  leadSchema,
  eventSchema,
  leadPatchSchema,
  normalizePhone,
} from '../lib/demo-campaign-validation.js'
import { logger } from '../lib/logger.js'

function campaignLimiter(prefix, max, windowMs) {
  const store = createRateLimitStore(prefix)
  return rateLimit({
    max,
    windowMs,
    standardHeaders: true,
    legacyHeaders: false,
    ...(store ? { store } : {}),
    message: { ok: false, error: 'Too many attempts. Please try again in a few minutes.' },
  })
}

export const demoCampaignRoutes = Router()
demoCampaignRoutes.post(
  '/leads',
  campaignLimiter('rl:demo-leads', 20, 10 * 60_000),
  async (req, res, next) => {
    if (typeof req.body?.website === 'string' && req.body.website.trim())
      return res.json({ ok: true })
    const parsed = leadSchema.safeParse(req.body)
    if (!parsed.success) {
      const fields = {}
      for (const issue of parsed.error.issues)
        fields[String(issue.path[0] || 'form')] ??= issue.message
      return res
        .status(400)
        .json({ ok: false, error: 'Please check the highlighted fields.', fields })
    }
    const v = parsed.data
    try {
      await query(
        `INSERT INTO demo_campaign_lead
       (name,company,role,whatsapp,phone_normalized,email,locations,restaurant_customers,consent_at,
        utm_source,utm_medium,utm_campaign,utm_content,qr_variant,landing_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10,$11,$12,$13,$14)
       ON CONFLICT (phone_normalized) DO NOTHING`,
        [
          v.name,
          v.company,
          v.role,
          v.whatsapp,
          normalizePhone(v.whatsapp),
          v.email || null,
          v.role === 'restaurant' ? v.locations : null,
          v.role === 'supplier' ? v.restaurantCustomers : null,
          v.utm_source || null,
          v.utm_medium || null,
          v.utm_campaign || null,
          v.utm_content || null,
          v.qr_variant || null,
          v.landing_role || null,
        ]
      )
      // Same result for new/duplicate requests. Never reveal an existing lead or update it anonymously.
      return res.json({ ok: true })
    } catch (error) {
      logger.error('Demo request could not be stored', { error: error.message })
      return next(error)
    }
  }
)

demoCampaignRoutes.post(
  '/events',
  campaignLimiter('rl:demo-events', 180, 60_000),
  async (req, res, next) => {
    const parsed = eventSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Invalid campaign event' })
    const v = parsed.data
    try {
      await query(
        `INSERT INTO demo_campaign_event (name,session_id,role,detail,utm_source,utm_medium,utm_campaign,qr_variant)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          v.name,
          v.sessionId,
          v.role || null,
          v.detail || null,
          v.utm_source || null,
          v.utm_medium || null,
          v.utm_campaign || null,
          v.qr_variant || null,
        ]
      )
      return res.status(204).end()
    } catch (error) {
      return next(error)
    }
  }
)

/** Mounted only behind the existing admin auth/context + ADMIN_GROWTH guards. */
export const demoCampaignAdminRoutes = Router()
demoCampaignAdminRoutes.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

const presentLead = (r) => ({
  id: Number(r.id),
  createdAt: r.created_at,
  name: r.name,
  company: r.company,
  role: r.role,
  whatsapp: r.whatsapp,
  email: r.email,
  size:
    r.role === 'restaurant'
      ? `${r.locations || ''} locations`
      : `${r.restaurant_customers || ''} restaurants`,
  source: [r.utm_source, r.qr_variant].filter(Boolean).join(' / ') || 'direct',
  status: r.status,
  notes: r.notes,
})

demoCampaignAdminRoutes.get('/leads', async (_req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM demo_campaign_lead ORDER BY created_at DESC LIMIT 500'
    )
    return res.json({ ok: true, data: rows.map(presentLead) })
  } catch (error) {
    return next(error)
  }
})

demoCampaignAdminRoutes.get('/summary', async (_req, res, next) => {
  try {
    const [events, leads] = await Promise.all([
      query(
        `SELECT name,COALESCE(qr_variant,'direct') AS variant,COUNT(DISTINCT session_id)::int AS sessions FROM demo_campaign_event GROUP BY 1,2`
      ),
      query(
        `SELECT COALESCE(qr_variant,'direct') AS variant,COUNT(*)::int AS leads FROM demo_campaign_lead GROUP BY 1`
      ),
    ])
    return res.json({ ok: true, data: { events: events.rows, leads: leads.rows } })
  } catch (error) {
    return next(error)
  }
})

demoCampaignAdminRoutes.patch('/leads/:id', async (req, res, next) => {
  const id = Number(req.params.id)
  const parsed = leadPatchSchema.strict().safeParse(req.body)
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success || !Object.keys(parsed.data).length)
    return res.status(400).json({ ok: false, error: 'Invalid lead update' })
  try {
    const { rows } = await query(
      `UPDATE demo_campaign_lead SET status=COALESCE($1,status),notes=COALESCE($2,notes),updated_at=now() WHERE id=$3 RETURNING id`,
      [parsed.data.status ?? null, parsed.data.notes ?? null, id]
    )
    return rows.length
      ? res.json({ ok: true })
      : res.status(404).json({ ok: false, error: 'Lead not found' })
  } catch (error) {
    return next(error)
  }
})

function csvCell(value) {
  let text = value == null ? '' : String(value instanceof Date ? value.toISOString() : value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

demoCampaignAdminRoutes.get('/export.csv', async (_req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM demo_campaign_lead ORDER BY created_at DESC LIMIT 10000'
    )
    const fields = [
      'id',
      'created_at',
      'name',
      'company',
      'role',
      'whatsapp',
      'email',
      'locations',
      'restaurant_customers',
      'status',
      'notes',
      'utm_source',
      'utm_campaign',
      'qr_variant',
    ]
    const csv =
      [fields, ...rows.map((r) => fields.map((f) => r[f]))]
        .map((row) => row.map(csvCell).join(','))
        .join('\r\n') + '\r\n'
    res.set('Content-Disposition', 'attachment; filename="supplify-demo-leads.csv"')
    return res.type('text/csv').send(csv)
  } catch (error) {
    return next(error)
  }
})
