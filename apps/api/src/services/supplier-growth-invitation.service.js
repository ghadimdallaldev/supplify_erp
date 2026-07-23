import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { getReferralProgramConfig, getFreeSandboxDays } from '../lib/platform-settings.js'
import { generateInviteToken, buildInviteUrl, inviteExpiresAt } from './invitationTokens.js'
import { sendTeamInvitationEmail } from './invitation-mail.service.js'
import { notifyTenantUsers } from './notification/in-app.js'
import { writeAuditLog } from '../lib/audit.js'
import { assertSupplierActiveCustomerLocationCapacity } from '../lib/subscription.js'

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function buildReferralInviteUrl(token) {
  return buildInviteUrl(token, 'restaurant_referral')
}

export function buildWhatsAppShareLink(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '')
  const text = encodeURIComponent(message)
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`
}

export async function createGrowthInvitation(supplierId, prospectId, { channel, req = null } = {}) {
  const config = await getReferralProgramConfig()
  const { rows: prospects } = await query(
    `SELECT * FROM supplier_customer_prospect WHERE id = $1 AND supplier_id = $2`,
    [prospectId, supplierId]
  )
  if (!prospects.length) throw new NotFoundError('Prospect not found')
  const prospect = prospects[0]
  if (prospect.match_status === 'existing_supplify') {
    throw new ValidationError('Restaurant already on Supplify - use connection request instead')
  }

  await assertSupplierActiveCustomerLocationCapacity(supplierId, {
    action: 'growth.invite_sent',
  })

  const token = generateInviteToken()
  const expiresAt = addDays(new Date(), config.referralValidityDays || 90)

  const { rows } = await query(
    `INSERT INTO supplier_growth_invitation (
       supplier_id, prospect_id, token, channel, status, expires_at, sent_at
     )
     VALUES ($1, $2, $3, $4, 'pending', $5, now())
     RETURNING *`,
    [supplierId, prospectId, token, channel || 'link', expiresAt]
  )

  await query(
    `UPDATE supplier_customer_prospect SET lifecycle_status = 'invited', updated_at = now()
     WHERE id = $1`,
    [prospectId]
  )

  const { rows: supplierRows } = await query(`SELECT name FROM supplier WHERE id = $1`, [
    supplierId,
  ])
  const supplierName = supplierRows[0]?.name || 'Your supplier'
  const inviteUrl = buildReferralInviteUrl(token)
  const message = `${supplierName} has invited you to join Supplify and manage your ordering digitally. ${inviteUrl}`

  if (channel === 'email' && prospect.email) {
    await sendTeamInvitationEmail({
      to: prospect.email,
      inviteUrl,
      invitedName: prospect.contact_person || prospect.restaurant_name,
      tenantName: supplierName,
      tenantType: 'SUPPLIER',
      invitationId: rows[0].id,
      tenantId: supplierId,
    }).catch(() => {})
  }

  if (req) {
    await writeAuditLog(req, {
      action: 'growth.invite_sent',
      entityType: 'supplier_growth_invitation',
      entityId: rows[0].id,
      metadata: { prospectId, channel },
    })
  }

  const whatsappUrl =
    channel === 'whatsapp' ? buildWhatsAppShareLink(prospect.phone, message) : null

  return {
    invitation: rows[0],
    inviteUrl,
    whatsappUrl,
    message,
  }
}

export async function getReferralInvitePublic(token) {
  const { rows } = await query(
    `SELECT gi.*, s.name AS supplier_name, p.restaurant_name
     FROM supplier_growth_invitation gi
     JOIN supplier s ON s.id = gi.supplier_id
     JOIN supplier_customer_prospect p ON p.id = gi.prospect_id
     WHERE gi.token = $1`,
    [token]
  )
  if (!rows.length) return { valid: false, reason: 'invalid' }
  const inv = rows[0]
  if (inv.status !== 'pending') return { valid: false, reason: inv.status }
  if (new Date(inv.expires_at) < new Date()) return { valid: false, reason: 'expired' }
  return {
    valid: true,
    supplierName: inv.supplier_name,
    restaurantName: inv.restaurant_name,
    expiresAt: inv.expires_at,
  }
}

export async function acceptReferralOnRegistration({ token, restaurantId, client = query }) {
  const db = typeof client.query === 'function' ? client : { query: client }
  const { rows } = await db.query(
    `SELECT gi.*, p.id AS prospect_id
     FROM supplier_growth_invitation gi
     JOIN supplier_customer_prospect p ON p.id = gi.prospect_id
     WHERE gi.token = $1 AND gi.status = 'pending' AND gi.expires_at > now()`,
    [token]
  )
  if (!rows.length) return null

  const inv = rows[0]
  const config = await getReferralProgramConfig()

  await db.query(
    `UPDATE supplier_growth_invitation SET status = 'accepted', accepted_at = now() WHERE id = $1`,
    [inv.id]
  )
  await db.query(
    `UPDATE supplier_customer_prospect SET
       lifecycle_status = 'registered',
       matched_restaurant_id = $2,
       match_status = 'existing_supplify',
       updated_at = now()
     WHERE id = $1`,
    [inv.prospect_id, restaurantId]
  )

  const referralExpiresAt = addDays(new Date(), config.referralValidityDays || 90)
  const { rows: attrRows } = await db.query(
    `INSERT INTO supplier_referral_attribution (
       supplier_id, prospect_id, invitation_id, restaurant_id, attribution_type,
       referral_expires_at, first_paid_discount_percent
     )
     VALUES ($1, $2, $3, $4, 'invite', $5, $6)
     RETURNING id`,
    [
      inv.supplier_id,
      inv.prospect_id,
      inv.id,
      restaurantId,
      referralExpiresAt,
      config.firstPaidDiscountPercent ?? 20,
    ]
  )

  await db.query(
    `INSERT INTO supplier_follow (supplier_id, restaurant_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [inv.supplier_id, restaurantId]
  )

  await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'referral_registered',
    notificationCategory: 'referral_registered',
    title: 'Welcome to Supplify',
    message: 'Your supplier referral was applied. Enjoy your free trial.',
    metadata: { supplierId: inv.supplier_id, ctaUrl: '/app' },
  }).catch(() => {})

  const trialDays = await getFreeSandboxDays()
  await db.query(
    `UPDATE subscription SET
       status = 'ACTIVE',
       account_locked_at = NULL,
       lock_reason = NULL,
       free_sandbox_expires_at = now() + ($2::int * INTERVAL '1 day'),
       updated_at = now()
     WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT'`,
    [restaurantId, trialDays]
  )

  try {
    const { linkSponsorshipsOnRestaurantRegistration } = await import(
      './supplier-sponsorship.service.js'
    )
    await linkSponsorshipsOnRestaurantRegistration({
      prospectId: inv.prospect_id,
      restaurantId,
      invitationId: inv.id,
      client: db,
    })
  } catch {
    /* sponsorship link is best-effort if table columns not migrated yet */
  }

  return { attributionId: attrRows[0]?.id, supplierId: inv.supplier_id }
}

export async function expireOldGrowthInvitations() {
  const { rowCount } = await query(
    `UPDATE supplier_growth_invitation SET status = 'expired'
     WHERE status = 'pending' AND expires_at < now()`
  )
  return rowCount ?? 0
}
