import { query } from '../lib/db.js'
import { getDefaultTenantTimezone } from '../lib/tenant-timezone.js'

const DEFAULT_DAYS = 90
const MAX_DAYS = 365
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100
const DEFAULT_MIN_CHANGE_PCT = 5

function clampInt(value, { min, max, fallback }) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function numberOrNull(value) {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0
}

/**
 * Read-only invoice comparisons based on the records already locked at order
 * and invoice time. This intentionally reports line facts, not a fraud score.
 */
export async function listInvoiceAnomalies(restaurantId, opts = {}, dbQuery = query) {
  if (!restaurantId) throw new Error('restaurantId is required')
  const days = clampInt(opts.days, { min: 7, max: MAX_DAYS, fallback: DEFAULT_DAYS })
  const limit = clampInt(opts.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT })
  const minChangePct = Number.isFinite(Number(opts.minChangePct))
    ? Math.max(0, Math.abs(Number(opts.minChangePct)))
    : DEFAULT_MIN_CHANGE_PCT

  const { rows } = await dbQuery(
    `
    WITH invoice_lines AS (
      SELECT
        i.id AS invoice_id,
        i.invoice_number,
        i.invoice_date,
        i.total_amount AS invoice_total,
        i.currency,
        i.supplier_id,
        s.name AS supplier_name,
        ili.id AS invoice_line_id,
        ili.product_id,
        ili.description,
        ili.quantity AS invoice_quantity,
        ili.unit_price AS invoice_unit_price,
        ili.order_item_id,
        oi.quantity AS ordered_quantity,
        oi.unit_price AS ordered_unit_price,
        oi.contract_price_id
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      JOIN invoice_line_item ili ON ili.invoice_id = i.id
      LEFT JOIN order_item oi ON oi.id = ili.order_item_id
      WHERE i.restaurant_id = $1
        AND i.status <> 'VOID'
        AND i.invoice_date >= (
          (now() AT TIME ZONE COALESCE(
            (SELECT NULLIF(TRIM(timezone), '') FROM restaurant WHERE id = $1),
            $3
          ))::date - $2::int
        )
        AND ili.product_id IS NOT NULL
    ),
    prior_prices AS (
      SELECT
        i.id AS invoice_id,
        ili.id AS invoice_line_id,
        LAG(ili.unit_price) OVER (
          PARTITION BY i.restaurant_id, i.supplier_id, ili.product_id
          ORDER BY i.invoice_date, i.created_at, ili.created_at
        ) AS prior_invoice_unit_price
      FROM invoice i
      JOIN invoice_line_item ili ON ili.invoice_id = i.id
      WHERE i.restaurant_id = $1
        AND i.status <> 'VOID'
        AND ili.product_id IS NOT NULL
    ),
    duplicate_linked_invoices AS (
      SELECT order_id, supplier_id
      FROM invoice
      WHERE restaurant_id = $1 AND order_id IS NOT NULL
      GROUP BY order_id, supplier_id
      HAVING COUNT(*) > 1
    )
    SELECT
      il.*,
      pp.prior_invoice_unit_price,
      contract.price AS active_contract_price,
      (dli.order_id IS NOT NULL) AS duplicate_linked_invoice
    FROM invoice_lines il
    LEFT JOIN prior_prices pp
      ON pp.invoice_id = il.invoice_id AND pp.invoice_line_id = il.invoice_line_id
    LEFT JOIN LATERAL (
      SELECT rp.price
      FROM restaurant_pricing rp
      WHERE rp.restaurant_id = $1
        AND rp.product_id = il.product_id
        AND rp.supplier_id = il.supplier_id
        AND rp.is_active = true
        AND (rp.contract_start_date IS NULL OR rp.contract_start_date <= il.invoice_date)
        AND (rp.contract_end_date IS NULL OR rp.contract_end_date >= il.invoice_date)
      ORDER BY rp.updated_at DESC
      LIMIT 1
    ) contract ON true
    LEFT JOIN duplicate_linked_invoices dli
      ON dli.order_id = (SELECT order_id FROM invoice WHERE id = il.invoice_id)
      AND dli.supplier_id = il.supplier_id
    ORDER BY il.invoice_date DESC, il.invoice_number ASC, il.invoice_line_id ASC
    `,
    [restaurantId, days, getDefaultTenantTimezone()]
  )

  const byInvoice = new Map()
  for (const row of rows) {
    const invoiceQuantity = numberOrZero(row.invoice_quantity)
    const orderedQuantity = numberOrNull(row.ordered_quantity)
    const invoicePrice = numberOrZero(row.invoice_unit_price)
    const orderedPrice = numberOrNull(row.ordered_unit_price)
    const contractPrice = numberOrNull(row.active_contract_price)
    const priorPrice = numberOrNull(row.prior_invoice_unit_price)
    const priceMovementPct =
      priorPrice != null && priorPrice > 0 ? ((invoicePrice - priorPrice) / priorPrice) * 100 : null
    const signals = [
      orderedQuantity != null && invoiceQuantity > orderedQuantity && 'quantity_exceeds_order',
      orderedPrice != null && invoicePrice > orderedPrice && 'price_above_order_snapshot',
      contractPrice != null && invoicePrice > contractPrice && 'price_above_active_contract',
      priceMovementPct != null &&
        priceMovementPct >= minChangePct &&
        'price_movement_above_threshold',
      row.duplicate_linked_invoice && 'duplicate_linked_invoice',
    ].filter(Boolean)
    if (!signals.length) continue

    if (!byInvoice.has(row.invoice_id)) {
      byInvoice.set(row.invoice_id, {
        invoiceId: row.invoice_id,
        invoiceNumber: row.invoice_number,
        invoiceDate: row.invoice_date,
        invoiceTotal: numberOrZero(row.invoice_total),
        currency: row.currency || 'USD',
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        lines: [],
      })
    }
    byInvoice.get(row.invoice_id).lines.push({
      invoiceLineId: row.invoice_line_id,
      productId: row.product_id,
      description: row.description,
      invoiceQuantity,
      orderedQuantity,
      invoiceUnitPrice: invoicePrice,
      orderedUnitPrice: orderedPrice,
      activeContractPrice: contractPrice,
      priorInvoiceUnitPrice: priorPrice,
      priceMovementPct,
      signals,
    })
  }

  const invoices = [...byInvoice.values()].slice(0, limit)
  return {
    windowDays: days,
    minChangePct,
    duplicateLinkedInvoiceProtection: 'enforced_by_unique_order_supplier_index',
    summary: {
      invoicesWithAnomalies: invoices.length,
      anomalyLines: invoices.reduce((sum, invoice) => sum + invoice.lines.length, 0),
    },
    invoices,
  }
}
