import { query, withTransaction } from '../lib/db.js'
import { createFulfillmentException } from '../lib/fulfillment-exceptions.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError, ConflictError } from '../middlewares/errorHandler.js'
import { notifyDisputeOpened, notifyDisputeResolved } from './notification.service.js'
import { DELIVERED_ORDER_STATUSES } from './reviews.service.js'
import {
  createReplacementOrderFromDispute,
  NO_REPLACEMENT_LINES_MESSAGE,
} from '../lib/dispute-replacement-order.js'
import { applyCreditToInvoice } from './invoice.service.js'

const ACTIVE_STATUSES = ['open', 'under_review', 'escalated']

const RECEIVED_STATUSES_FOR_DISPUTE_FLAG = [
  'RECEIVED_PARTIAL',
  'RECEIVED_FULL',
  'DELIVERED',
  'COMPLETED',
]

async function setOrderReceivedWithDispute(client, orderId) {
  await client.query(
    `
    UPDATE customer_order
    SET status = 'RECEIVED_WITH_DISPUTE', updated_at = now()
    WHERE id = $1
      AND status::text = ANY($2::text[])
    `,
    [orderId, RECEIVED_STATUSES_FOR_DISPUTE_FLAG]
  )
}

async function restoreOrderStatusAfterDisputeClosed(client, orderId) {
  const { rows: orderRows } = await client.query(
    `SELECT status FROM customer_order WHERE id = $1`,
    [orderId]
  )
  if (orderRows[0]?.status !== 'RECEIVED_WITH_DISPUTE') return

  const { rows: agg } = await client.query(
    `
    SELECT
      COALESCE(SUM(rli.received_quantity), 0)::float8 AS received,
      COALESCE(SUM(rli.ordered_quantity), 0)::float8 AS ordered
    FROM receiving_report rr
    INNER JOIN receiving_line_item rli ON rli.receiving_report_id = rr.id
    WHERE rr.order_id = $1
      AND rr.id = (
        SELECT id FROM receiving_report
        WHERE order_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      )
    `,
    [orderId]
  )

  const received = Number(agg[0]?.received ?? 0)
  const ordered = Number(agg[0]?.ordered ?? 0)
  const nextStatus = ordered > 0 && received < ordered ? 'RECEIVED_PARTIAL' : 'RECEIVED_FULL'

  await client.query(`UPDATE customer_order SET status = $2, updated_at = now() WHERE id = $1`, [
    orderId,
    nextStatus,
  ])
}

function mapDisputeRow(row) {
  if (!row) return null
  return {
    id: row.id,
    orderId: row.order_id,
    restaurantId: row.restaurant_id,
    supplierId: row.supplier_id,
    receivingReportId: row.receiving_report_id,
    invoiceId: row.invoice_id,
    type: row.type,
    status: row.status,
    description: row.description,
    disputedAmount: row.disputed_amount != null ? Number(row.disputed_amount) : null,
    resolutionType: row.resolution_type,
    resolutionNotes: row.resolution_notes,
    resolvedAt: row.resolved_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    restaurantName: row.restaurant_name,
    supplierName: row.supplier_name,
    orderStatus: row.order_status,
    replacementOrderId: row.replacement_order_id,
  }
}

async function loadDisputeDetail(disputeId, { restaurantId, supplierId } = {}) {
  const params = [disputeId]
  let scope = ''
  if (restaurantId) {
    params.push(restaurantId)
    scope = ` AND d.restaurant_id = $${params.length}`
  } else if (supplierId) {
    params.push(supplierId)
    scope = ` AND d.supplier_id = $${params.length}`
  }

  const { rows } = await query(
    `
    SELECT d.*, r.name AS restaurant_name, s.name AS supplier_name, o.status AS order_status
    FROM disputes d
    JOIN restaurant r ON r.id = d.restaurant_id
    JOIN supplier s ON s.id = d.supplier_id
    JOIN customer_order o ON o.id = d.order_id
    WHERE d.id = $1${scope}
    `,
    params
  )
  if (!rows.length) throw new NotFoundError('Dispute not found')

  const dispute = mapDisputeRow(rows[0])

  const { rows: items } = await query(
    `SELECT * FROM dispute_items WHERE dispute_id = $1 ORDER BY created_at`,
    [disputeId]
  )
  const { rows: attachments } = await query(
    `SELECT * FROM dispute_attachments WHERE dispute_id = $1 ORDER BY created_at`,
    [disputeId]
  )
  const { rows: creditNotes } = await query(
    `SELECT id, credit_note_number, credit_amount, remaining_amount, status, issue_date, dispute_id
     FROM credit_note WHERE dispute_id = $1 ORDER BY created_at DESC`,
    [disputeId]
  )

  const resolutionEffectResult = await query(
    `SELECT id, effect_type, amount, currency, reference, credit_note_id, replacement_order_id, effect_data, created_by, created_at FROM dispute_resolution_effects WHERE dispute_id = $1`,
    [disputeId]
  )
  const resolutionEffects = resolutionEffectResult?.rows ?? []

  let replacementOrder = null
  if (dispute.replacementOrderId) {
    const { rows: replacementRows } = await query(
      `
      SELECT id, status, placement_source, source_order_id, source_dispute_id, created_at, total_amount
      FROM customer_order
      WHERE id = $1
      `,
      [dispute.replacementOrderId]
    )
    replacementOrder = replacementRows[0] || null
  }

  return {
    dispute,
    items,
    attachments,
    creditNotes,
    replacementOrder,
    resolutionEffect: resolutionEffects[0] || null,
  }
}

async function generateCreditNoteNumber(client) {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const { rows } = await client.query(
    `
    SELECT COUNT(*)::int AS cnt FROM credit_note
    WHERE credit_note_number LIKE $1
    `,
    [`CN-${year}-${month}-%`]
  )
  const seq = (rows[0]?.cnt || 0) + 1
  return `CN-${year}-${month}-${String(seq).padStart(3, '0')}`
}

export async function createDispute({
  restaurantId,
  userId,
  orderId,
  supplierId,
  receivingReportId,
  invoiceId,
  type,
  description,
  disputedAmount,
  items = [],
  attachmentKeys = [],
}) {
  const { rows: orders } = await query(
    `
    SELECT o.id, o.restaurant_id, o.status
    FROM customer_order o
    WHERE o.id = $1 AND o.restaurant_id = $2
    `,
    [orderId, restaurantId]
  )
  if (!orders.length) throw new NotFoundError('Order not found')
  if (!DELIVERED_ORDER_STATUSES.includes(orders[0].status)) {
    throw new ValidationError(
      'Disputes can only be opened after delivery (status must be delivered, received, invoiced, or completed)'
    )
  }

  const { rows: supplierCheck } = await query(
    `SELECT 1 FROM order_item WHERE order_id = $1 AND supplier_id = $2 LIMIT 1`,
    [orderId, supplierId]
  )
  if (!supplierCheck.length) {
    throw new ValidationError('Supplier is not associated with this order')
  }

  const { rows: active } = await query(
    `SELECT id FROM disputes WHERE order_id = $1 AND status = ANY($2::text[])`,
    [orderId, ACTIVE_STATUSES]
  )
  if (active.length) {
    throw new ConflictError('An active dispute already exists for this order')
  }

  if (receivingReportId) {
    const { rows: rr } = await query(
      `SELECT id FROM receiving_report WHERE id = $1 AND order_id = $2 AND restaurant_id = $3`,
      [receivingReportId, orderId, restaurantId]
    )
    if (!rr.length) throw new ValidationError('Invalid receiving report for this order')
  }

  const result = await withTransaction(async (client) => {
    const { rows: inserted } = await client.query(
      `
      INSERT INTO disputes (
        order_id, restaurant_id, supplier_id, receiving_report_id, invoice_id,
        type, description, disputed_amount, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        orderId,
        restaurantId,
        supplierId,
        receivingReportId || null,
        invoiceId || null,
        type,
        description,
        disputedAmount ?? null,
        userId,
      ]
    )
    const dispute = mapDisputeRow(inserted[0])

    for (const item of items) {
      await client.query(
        `
        INSERT INTO dispute_items (
          dispute_id, order_item_id, product_name,
          quantity_ordered, quantity_received, unit_price, issue_description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          dispute.id,
          item.orderItemId || null,
          item.productName || null,
          item.quantityOrdered ?? null,
          item.quantityReceived ?? null,
          item.unitPrice ?? null,
          item.issueDescription || null,
        ]
      )
    }

    for (const att of attachmentKeys) {
      await client.query(
        `
        INSERT INTO dispute_attachments (dispute_id, file_key, file_name, uploaded_by)
        VALUES ($1, $2, $3, $4)
        `,
        [dispute.id, att.fileKey, att.fileName || null, userId]
      )
    }

    await setOrderReceivedWithDispute(client, orderId)

    return dispute
  })

  await notifyDisputeOpened(result)

  try {
    await createFulfillmentException(null, {
      supplierId,
      orderId,
      type: 'dispute_raised',
      description: `Restaurant opened dispute: ${type}`,
    })
  } catch {
    /* non-blocking */
  }

  return loadDisputeDetail(result.id, { restaurantId })
}

export async function listDisputesForRestaurant(
  restaurantId,
  { status, limit = 50, offset = 0 } = {}
) {
  const params = [restaurantId]
  let sql = `
    SELECT d.*, r.name AS restaurant_name, s.name AS supplier_name, o.status AS order_status
    FROM disputes d
    JOIN restaurant r ON r.id = d.restaurant_id
    JOIN supplier s ON s.id = d.supplier_id
    JOIN customer_order o ON o.id = d.order_id
    WHERE d.restaurant_id = $1
  `
  if (status) {
    params.push(status)
    sql += ` AND d.status = $${params.length}`
  }
  const clampedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100)
  const clampedOffset = Math.max(parseInt(offset) || 0, 0)
  params.push(clampedLimit, clampedOffset)
  sql += ` ORDER BY d.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await query(sql, params)
  return rows.map(mapDisputeRow)
}

export async function listIncomingDisputesForSupplier(
  supplierId,
  { status, limit = 50, offset = 0 } = {}
) {
  const params = [supplierId]
  let sql = `
    SELECT d.*, r.name AS restaurant_name, s.name AS supplier_name, o.status AS order_status
    FROM disputes d
    JOIN restaurant r ON r.id = d.restaurant_id
    JOIN supplier s ON s.id = d.supplier_id
    JOIN customer_order o ON o.id = d.order_id
    WHERE d.supplier_id = $1
  `
  if (status) {
    params.push(status)
    sql += ` AND d.status = $${params.length}`
  }
  const clampedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100)
  const clampedOffset = Math.max(parseInt(offset) || 0, 0)
  params.push(clampedLimit, clampedOffset)
  sql += ` ORDER BY d.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await query(sql, params)
  return rows.map(mapDisputeRow)
}

export async function getDispute(disputeId, scope) {
  return loadDisputeDetail(disputeId, scope)
}

export async function addDisputeAttachment(disputeId, restaurantId, userId, { fileKey, fileName }) {
  const { assertUploadKeyOwnedByUser } = await import('../lib/sanitize-upload.js')
  assertUploadKeyOwnedByUser(fileKey, userId)

  const { rows } = await query(
    `SELECT id, status FROM disputes WHERE id = $1 AND restaurant_id = $2`,
    [disputeId, restaurantId]
  )
  if (!rows.length) throw new NotFoundError('Dispute not found')
  if (!ACTIVE_STATUSES.includes(rows[0].status)) {
    throw new ValidationError('Cannot add attachments to a closed dispute')
  }

  const { rows: inserted } = await query(
    `
    INSERT INTO dispute_attachments (dispute_id, file_key, file_name, uploaded_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [disputeId, fileKey, fileName || null, userId]
  )
  return inserted[0]
}

export async function cancelDispute(disputeId, restaurantId) {
  const { rows } = await query(`SELECT * FROM disputes WHERE id = $1 AND restaurant_id = $2`, [
    disputeId,
    restaurantId,
  ])
  if (!rows.length) throw new NotFoundError('Dispute not found')
  if (rows[0].status !== 'open') {
    throw new ValidationError('Only open disputes can be cancelled')
  }

  const orderId = rows[0].order_id

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE disputes SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [disputeId]
    )
    await restoreOrderStatusAfterDisputeClosed(client, orderId)
  })

  return loadDisputeDetail(disputeId, { restaurantId })
}

export async function reviewDispute(disputeId, supplierId) {
  const { rows } = await query(`SELECT * FROM disputes WHERE id = $1 AND supplier_id = $2`, [
    disputeId,
    supplierId,
  ])
  if (!rows.length) throw new NotFoundError('Dispute not found')
  if (rows[0].status !== 'open' && rows[0].status !== 'escalated') {
    throw new ValidationError('Dispute cannot be moved to review in its current status')
  }

  await query(`UPDATE disputes SET status = 'under_review', updated_at = NOW() WHERE id = $1`, [
    disputeId,
  ])
  return loadDisputeDetail(disputeId, { supplierId })
}

export async function rejectDispute(disputeId, supplierId, resolutionNotes) {
  if (!resolutionNotes?.trim()) {
    throw new ValidationError('Resolution notes are required when rejecting a dispute')
  }

  const { rows } = await query(`SELECT * FROM disputes WHERE id = $1 AND supplier_id = $2`, [
    disputeId,
    supplierId,
  ])
  if (!rows.length) throw new NotFoundError('Dispute not found')

  const isSameRejection = (effect) => {
    if (effect?.effect_type !== 'no_action') return false
    const data =
      typeof effect.effect_data === 'string' ? JSON.parse(effect.effect_data) : effect.effect_data
    return data?.rejected === true && data.notes === resolutionNotes
  }

  if (!ACTIVE_STATUSES.includes(rows[0].status)) {
    const { rows: effects } = await query(
      `SELECT effect_type, effect_data FROM dispute_resolution_effects WHERE dispute_id = $1`,
      [disputeId]
    )
    if (isSameRejection(effects[0])) return loadDisputeDetail(disputeId, { supplierId })
    throw new ConflictError('Dispute is already closed')
  }

  const orderId = rows[0].order_id

  const result = await withTransaction(async (client) => {
    const { rows: locked } = await client.query(
      `SELECT * FROM disputes WHERE id = $1 AND supplier_id = $2 FOR UPDATE`,
      [disputeId, supplierId]
    )
    if (!locked.length) throw new NotFoundError('Dispute not found')
    const { rows: effects } = await client.query(
      `SELECT effect_type, effect_data FROM dispute_resolution_effects WHERE dispute_id = $1 FOR UPDATE`,
      [disputeId]
    )
    if (!ACTIVE_STATUSES.includes(locked[0].status)) {
      if (isSameRejection(effects[0])) return { idempotent: true }
      throw new ConflictError('Dispute is already closed')
    }
    await client.query(
      `INSERT INTO dispute_resolution_effects (dispute_id, effect_type, effect_data) VALUES ($1, 'no_action', $2::jsonb) ON CONFLICT (dispute_id) DO NOTHING`,
      [disputeId, JSON.stringify({ rejected: true, notes: resolutionNotes })]
    )
    await client.query(
      `
      UPDATE disputes
      SET status = 'rejected',
          resolution_type = 'no_action',
          resolution_notes = $2,
          resolved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      `,
      [disputeId, resolutionNotes]
    )
    await restoreOrderStatusAfterDisputeClosed(client, orderId)
    return { idempotent: false }
  })

  const detail = await loadDisputeDetail(disputeId, { supplierId })
  if (result?.idempotent) return detail
  await notifyDisputeResolved({ ...detail.dispute, resolutionNotes }, 'rejected')
  return detail
}
export async function resolveDispute(
  disputeId,
  supplierId,
  {
    resolutionType,
    resolutionNotes,
    creditNoteAmount,
    creditNoteNotes,
    refundAmount,
    refundReference,
    userId = null,
  }
) {
  if (!resolutionType) throw new ValidationError('resolutionType is required')
  if (!['credit_note', 'replacement', 'refund', 'no_action'].includes(resolutionType))
    throw new ValidationError('Unsupported resolution type')

  const preflight = await query(`SELECT * FROM disputes WHERE id = $1 AND supplier_id = $2`, [
    disputeId,
    supplierId,
  ])
  if (!preflight?.rows?.length) throw new NotFoundError('Dispute not found')
  const preflightDispute = preflight.rows[0]
  if (
    resolutionType === 'replacement' &&
    preflightDispute.replacement_order_id &&
    ACTIVE_STATUSES.includes(preflightDispute.status)
  )
    throw new ValidationError('A replacement order already exists for this dispute')
  if (resolutionType === 'credit_note' || resolutionType === 'refund') {
    const requestedAmount = Number(resolutionType === 'refund' ? refundAmount : creditNoteAmount)
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0)
      throw new ValidationError(
        resolutionType === 'refund'
          ? 'refundAmount must be positive'
          : 'creditNoteAmount must be positive'
      )
    if (
      preflightDispute.disputed_amount != null &&
      requestedAmount > Number(preflightDispute.disputed_amount)
    )
      throw new ValidationError(
        `Resolution amount cannot exceed disputed amount (${preflightDispute.disputed_amount})`
      )
    if (resolutionType === 'refund' && !refundReference?.trim())
      throw new ValidationError('refundReference is required for refund resolution')
  }
  let idempotent = false
  const result = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM disputes WHERE id = $1 AND supplier_id = $2 FOR UPDATE`,
      [disputeId, supplierId]
    )
    const rows = locked?.rows?.length ? locked.rows : preflight.rows
    const disputeRow = rows[0]
    const { rows: existingEffects } = await client.query(
      `SELECT * FROM dispute_resolution_effects WHERE dispute_id = $1 FOR UPDATE`,
      [disputeId]
    )
    const existing = existingEffects[0]
    if (existing) {
      const requestedAmount = resolutionType === 'refund' ? refundAmount : creditNoteAmount
      const same =
        existing.effect_type === resolutionType &&
        (requestedAmount == null || Number(existing.amount) === Number(requestedAmount)) &&
        (resolutionType !== 'refund' || existing.reference === refundReference)
      if (!same) throw new ConflictError('This dispute already has a conflicting resolution effect')
      idempotent = true
      return { replacementOrderId: existing.replacement_order_id }
    }
    if (!ACTIVE_STATUSES.includes(disputeRow.status))
      throw new ConflictError('Dispute is already closed without a matching resolution effect')

    let amount = null
    if (resolutionType === 'credit_note' || resolutionType === 'refund') {
      amount = Number(resolutionType === 'refund' ? refundAmount : creditNoteAmount)
      if (!Number.isFinite(amount) || amount <= 0)
        throw new ValidationError(
          resolutionType === 'refund'
            ? 'refundAmount must be positive'
            : 'creditNoteAmount must be positive'
        )
      if (disputeRow.disputed_amount != null && amount > Number(disputeRow.disputed_amount))
        throw new ValidationError(
          `Resolution amount cannot exceed disputed amount (${disputeRow.disputed_amount})`
        )
      if (resolutionType === 'refund' && !refundReference?.trim())
        throw new ValidationError('refundReference is required for refund resolution')
    }

    let replacementOrderId = null
    let creditNote = null
    let invoiceAdjustment = null
    if (resolutionType === 'replacement') {
      const { rows: disputeItems } = await client.query(
        `SELECT * FROM dispute_items WHERE dispute_id = $1 ORDER BY created_at`,
        [disputeId]
      )
      const { rows: originalOrders } = await client.query(
        `SELECT * FROM customer_order WHERE id = $1 FOR UPDATE`,
        [disputeRow.order_id]
      )
      if (!originalOrders.length)
        throw new ValidationError('Original order not found for replacement')
      replacementOrderId = await createReplacementOrderFromDispute(client, {
        disputeRow,
        disputeItems,
        originalOrder: originalOrders[0],
      })
    }

    if (resolutionType === 'credit_note' || resolutionType === 'refund') {
      const creditNoteNumber = await generateCreditNoteNumber(client)
      const reason = resolutionType === 'refund' ? 'OTHER' : 'RETURN'
      const description =
        resolutionType === 'refund'
          ? `Auditable refund adjustment: ${refundReference.trim()}`
          : creditNoteNotes || `Credit for dispute ${disputeId.slice(0, 8)}`
      const { rows } = await client.query(
        `INSERT INTO credit_note (credit_note_number, invoice_id, supplier_id, restaurant_id, issue_date, reason, description, credit_amount, applied_amount, remaining_amount, status, currency, order_id, notes, dispute_id)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, 0, $7, 'ISSUED', 'USD', $8, $9, $10) RETURNING *`,
        [
          creditNoteNumber,
          disputeRow.invoice_id,
          disputeRow.supplier_id,
          disputeRow.restaurant_id,
          reason,
          description,
          amount,
          disputeRow.order_id,
          resolutionNotes || null,
          disputeId,
        ]
      )
      creditNote = rows[0] || null
      if (creditNote && disputeRow.invoice_id) {
        try {
          const applied = await applyCreditToInvoice(client, {
            creditNoteId: creditNote.id,
            invoiceId: disputeRow.invoice_id,
            creditAmount: amount,
            recordedBy: userId,
          })
          invoiceAdjustment = {
            status: 'applied',
            invoiceId: disputeRow.invoice_id,
            amount: applied?.appliedAmount ?? amount,
          }
        } catch (error) {
          if (error instanceof ValidationError || error instanceof NotFoundError)
            invoiceAdjustment = {
              status: 'not_applied',
              invoiceId: disputeRow.invoice_id,
              reason: error.message,
            }
          else throw error
        }
      }
    }

    const effectData = {
      resolutionNotes: resolutionNotes || null,
      creditNoteNotes: creditNoteNotes || null,
      invoiceAdjustment,
      refundReference: resolutionType === 'refund' ? refundReference.trim() : null,
    }
    const { rows: effects } = await client.query(
      `INSERT INTO dispute_resolution_effects (dispute_id, effect_type, amount, currency, reference, credit_note_id, replacement_order_id, effect_data, created_by)
       VALUES ($1, $2, $3, 'USD', $4, $5, $6, $7::jsonb, $8) RETURNING *`,
      [
        disputeId,
        resolutionType,
        amount,
        resolutionType === 'refund' ? refundReference.trim() : null,
        creditNote?.id ?? null,
        replacementOrderId,
        JSON.stringify(effectData),
        userId,
      ]
    )
    await client.query(
      `UPDATE disputes SET status = 'resolved', resolution_type = $2, resolution_notes = $3, replacement_order_id = COALESCE($4, replacement_order_id), resolved_at = now(), updated_at = now() WHERE id = $1`,
      [disputeId, resolutionType, resolutionNotes || null, replacementOrderId]
    )
    await restoreOrderStatusAfterDisputeClosed(client, disputeRow.order_id)
    return { replacementOrderId, effect: effects[0] }
  })

  const detail = await loadDisputeDetail(disputeId, { supplierId })
  if (idempotent) return detail
  await notifyDisputeResolved(detail.dispute, 'resolved', {
    replacementOrderId: result.replacementOrderId || detail.dispute.replacementOrderId || null,
  })
  return detail
}

export { NO_REPLACEMENT_LINES_MESSAGE }

export async function listCreditNotesForTenant(tenantId, tenantType) {
  const column = tenantType === 'SUPPLIER' ? 'supplier_id' : 'restaurant_id'
  const { rows } = await query(
    `
    SELECT cn.*, d.id AS dispute_id, d.type AS dispute_type
    FROM credit_note cn
    LEFT JOIN disputes d ON d.id = cn.dispute_id
    WHERE cn.${column} = $1
    ORDER BY cn.created_at DESC
    `,
    [tenantId]
  )
  return rows
}

export async function applyCreditNote(creditNoteId, tenantId, tenantType, { invoiceId } = {}) {
  if (!invoiceId) {
    throw new ValidationError('invoiceId is required to apply a credit note')
  }

  const column = tenantType === 'SUPPLIER' ? 'supplier_id' : 'restaurant_id'
  const { rows } = await query(`SELECT * FROM credit_note WHERE id = $1 AND ${column} = $2`, [
    creditNoteId,
    tenantId,
  ])
  if (!rows.length) throw new NotFoundError('Credit note not found')
  const cn = rows[0]
  if (cn.status !== 'ISSUED' || Number(cn.remaining_amount) <= 0) {
    throw new ValidationError('Credit note is not available to apply')
  }

  const { rows: inv } = await query(
    `SELECT id FROM invoice WHERE id = $1 AND restaurant_id = $2 AND supplier_id = $3`,
    [invoiceId, cn.restaurant_id, cn.supplier_id]
  )
  if (!inv.length) throw new ValidationError('Invoice does not match credit note parties')

  const result = await withTransaction((client) =>
    applyCreditToInvoice(client, {
      creditNoteId,
      invoiceId,
      creditAmount: Number(cn.remaining_amount),
      recordedBy: null,
    })
  )

  return result.creditNote
}
