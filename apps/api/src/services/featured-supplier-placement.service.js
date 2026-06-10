import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'

export async function listFeaturedPackages() {
  const { rows } = await query(
    `
    SELECT * FROM promotion_pricing_config
    WHERE is_active = TRUE
      AND (package_type = 'featured_listing' OR pricing_key LIKE 'featured_supplier_%')
    ORDER BY amount ASC
    `
  )
  return rows
}

export async function listActiveFeaturedSupplierIds() {
  const { rows } = await query(
    `
    SELECT DISTINCT supplier_id
    FROM supplier_featured_placements
    WHERE status = 'active'
      AND starts_at <= NOW()
      AND ends_at > NOW()
    `
  )
  return rows.map((r) => r.supplier_id)
}

export async function purchaseAndActivateFeaturedPlacement({
  supplierId,
  pricingKey,
  createdBy,
  waivePayment = true,
}) {
  return withTransaction(async (client) => {
    const { rows: pricingRows } = await client.query(
      `SELECT * FROM promotion_pricing_config WHERE pricing_key = $1 AND is_active = TRUE`,
      [pricingKey]
    )
    const pricing = pricingRows[0]
    if (!pricing) throw new ValidationError('Featured placement package is not available')

    const startsAt = new Date()
    const endsAt = new Date(startsAt)
    endsAt.setDate(endsAt.getDate() + (pricing.duration_days || 7))
    const amount = parseFloat(pricing.amount) || 0
    const waive = waivePayment !== false
    const status = waive ? 'active' : 'pending'
    const paymentStatus = waive ? 'waived' : 'pending'

    const { rows } = await client.query(
      `
      INSERT INTO supplier_featured_placements (
        supplier_id, pricing_key, status, starts_at, ends_at,
        amount_paid, payment_status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        supplierId,
        pricingKey,
        status,
        startsAt.toISOString(),
        endsAt.toISOString(),
        amount,
        paymentStatus,
        createdBy,
      ]
    )
    return rows[0]
  })
}

export async function listPlacementsForSupplier(supplierId) {
  const { rows } = await query(
    `SELECT * FROM supplier_featured_placements WHERE supplier_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [supplierId]
  )
  return rows
}

export async function listAllActivePlacementsForAdmin() {
  const { rows } = await query(
    `
    SELECT fp.*, s.name AS supplier_name
    FROM supplier_featured_placements fp
    JOIN supplier s ON s.id = fp.supplier_id
    WHERE fp.status = 'active' AND fp.ends_at > NOW()
    ORDER BY fp.starts_at DESC
    LIMIT 100
    `
  )
  return rows
}
