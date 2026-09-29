import express from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../lib/db.js'
import { requireAuth } from '../lib/rbac.js'
import {
  buildConsumerReorder,
  getConsumerPublicOrder,
  listConsumerPublicOrders,
} from '../services/public-sales.service.js'

export const consumerAccountRoutes = express.Router()

consumerAccountRoutes.use(requireAuth, (req, _res, next) => {
  if (req.userData?.role !== 'CONSUMER') return next('router')
  next()
})

const addressSchema = z.object({
  label: z.string().max(80).nullable().optional(),
  recipientName: z.string().min(2).max(160),
  phone: z.string().min(5).max(30),
  address: z.object({
    line1: z.string().min(1).max(200),
    line2: z.string().max(200).optional(),
    city: z.string().min(1).max(120),
    region: z.string().max(120).optional(),
    postalCode: z.string().max(30).optional(),
    country: z.string().min(2).max(80),
  }),
  coords: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable()
    .optional(),
  isDefault: z.boolean().optional(),
})

function ok(req, res, data, status = 200) {
  res.status(status).json({ ok: true, data, error: null, requestId: req.requestId })
}

function fail(req, res, error) {
  const status = error.name === 'NotFoundError' ? 404 : error.name === 'ZodError' ? 400 : 500
  res.status(status).json({
    ok: false,
    data: null,
    error: { name: status === 400 ? 'VALIDATION_ERROR' : error.name, message: error.message },
    requestId: req.requestId,
  })
}

consumerAccountRoutes.get('/profile', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.display_name, p.phone, p.notification_preferences
       FROM app_user u LEFT JOIN consumer_profile p ON p.app_user_id = u.id
       WHERE u.id = $1 AND u.role = 'CONSUMER'`,
      [req.userData.id]
    )
    ok(req, res, { profile: rows[0] || null })
  } catch (error) {
    fail(req, res, error)
  }
})

consumerAccountRoutes.patch('/profile', async (req, res) => {
  try {
    const body = z
      .object({
        name: z.string().min(2).max(160).optional(),
        phone: z.string().max(30).nullable().optional(),
      })
      .parse(req.body)
    if (body.name)
      await query(`UPDATE app_user SET display_name = $2, updated_at = now() WHERE id = $1`, [
        req.userData.id,
        body.name,
      ])
    if (Object.hasOwn(body, 'phone')) {
      await query(
        `INSERT INTO consumer_profile (app_user_id, phone) VALUES ($1, $2)
         ON CONFLICT (app_user_id) DO UPDATE SET phone = EXCLUDED.phone, updated_at = now()`,
        [req.userData.id, body.phone ?? null]
      )
    }
    const { rows } = await query(
      `SELECT u.id, u.email, u.display_name, p.phone, p.notification_preferences
       FROM app_user u LEFT JOIN consumer_profile p ON p.app_user_id = u.id WHERE u.id = $1`,
      [req.userData.id]
    )
    ok(req, res, { profile: rows[0] })
  } catch (error) {
    fail(req, res, error)
  }
})

consumerAccountRoutes.get('/addresses', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, label, recipient_name, phone, address_json, coords, is_default, created_at, updated_at
       FROM consumer_address WHERE app_user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.userData.id]
    )
    ok(req, res, { addresses: rows })
  } catch (error) {
    fail(req, res, error)
  }
})

consumerAccountRoutes.post('/addresses', async (req, res) => {
  try {
    const body = addressSchema.parse(req.body)
    const address = await withTransaction(async (client) => {
      if (body.isDefault)
        await client.query(
          `UPDATE consumer_address SET is_default = false WHERE app_user_id = $1`,
          [req.userData.id]
        )
      const { rows } = await client.query(
        `INSERT INTO consumer_address
           (app_user_id, label, recipient_name, phone, address_json, coords, is_default)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) RETURNING *`,
        [
          req.userData.id,
          body.label || null,
          body.recipientName,
          body.phone,
          JSON.stringify(body.address),
          body.coords ? JSON.stringify(body.coords) : null,
          Boolean(body.isDefault),
        ]
      )
      return rows[0]
    })
    ok(req, res, { address }, 201)
  } catch (error) {
    fail(req, res, error)
  }
})

consumerAccountRoutes.patch('/addresses/:id', async (req, res) => {
  try {
    const body = addressSchema.partial().parse(req.body)
    const address = await withTransaction(async (client) => {
      if (body.isDefault)
        await client.query(
          `UPDATE consumer_address SET is_default = false WHERE app_user_id = $1`,
          [req.userData.id]
        )
      const { rows } = await client.query(
        `UPDATE consumer_address SET
           label = COALESCE($3, label), recipient_name = COALESCE($4, recipient_name),
           phone = COALESCE($5, phone), address_json = COALESCE($6::jsonb, address_json),
           coords = CASE WHEN $7::boolean THEN $8::jsonb ELSE coords END,
           is_default = COALESCE($9, is_default), updated_at = now()
         WHERE id = $1 AND app_user_id = $2 RETURNING *`,
        [
          req.params.id,
          req.userData.id,
          body.label,
          body.recipientName,
          body.phone,
          body.address ? JSON.stringify(body.address) : null,
          Object.hasOwn(body, 'coords'),
          body.coords ? JSON.stringify(body.coords) : null,
          body.isDefault,
        ]
      )
      return rows[0] || null
    })
    if (!address)
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Address not found' },
        requestId: req.requestId,
      })
    ok(req, res, { address })
  } catch (error) {
    fail(req, res, error)
  }
})

consumerAccountRoutes.delete('/addresses/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM consumer_address WHERE id = $1 AND app_user_id = $2`,
      [req.params.id, req.userData.id]
    )
    if (!rowCount)
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Address not found' },
        requestId: req.requestId,
      })
    ok(req, res, { deleted: true })
  } catch (error) {
    fail(req, res, error)
  }
})

consumerAccountRoutes.get('/orders', async (req, res) => {
  try {
    ok(req, res, { orders: await listConsumerPublicOrders(req.userData.id) })
  } catch (error) {
    fail(req, res, error)
  }
})

consumerAccountRoutes.get('/orders/:id', async (req, res) => {
  try {
    ok(req, res, { order: await getConsumerPublicOrder(req.userData.id, req.params.id) })
  } catch (error) {
    fail(req, res, error)
  }
})

consumerAccountRoutes.post('/orders/:id/reorder-preview', async (req, res) => {
  try {
    ok(req, res, await buildConsumerReorder(req.userData.id, req.params.id))
  } catch (error) {
    fail(req, res, error)
  }
})
