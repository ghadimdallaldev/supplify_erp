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
  if (!['open', 'under_review', 'escalated'].includes(rows[0].status)) {
    throw new ValidationError('Dispute is already closed')
  }

  const orderId = rows[0].order_id

  await withTransaction(async (client) => {
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
  })

  const detail = await loadDisputeDetail(disputeId, { supplierId })
  await notifyDisputeResolved({ ...detail.dispute, resolutionNotes }, 'rejected')
  return detail
}

export async function resolveDispute(
  disputeId,
  supplierId,
  { resolutionType, resolutionNotes, creditNoteAmount, creditNoteNotes }
) {
  if (!resolutionType) {
    throw new ValidationError('resolutionType is required')
  }

  const { rows } = await query(`SELECT * FROM disputes WHERE id = $1 AND supplier_id = $2`, [
    disputeId,
    supplierId,
  ])
  if (!rows.length) throw new NotFoundError('Dispute not found')
  if (!['open', 'under_review', 'escalated'].includes(rows[0].status)) {
    throw new ValidationError('Dispute is already closed')
  }

  const disputeRow = rows[0]

  if (resolutionType === 'credit_note') {
    const amount = Number(creditNoteAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError(
        'creditNoteAmount must be a positive number for credit note resolution'
      )
    }
    const maxAmount = disputeRow.disputed_amount != null ? Number(disputeRow.disputed_amount) : null
    if (maxAmount != null && amount > maxAmount) {
      throw new ValidationError(`Credit note amount cannot exceed disputed amount (${maxAmount})`)
    }
  }

  if (resolutionType === 'replacement' && disputeRow.replacement_order_id) {
    throw new ValidationError('A replacement order already exists for this dispute')
  }

  let replacementOrderId = null

  await withTransaction(async (client) => {
    if (resolutionType === 'replacement') {
      const { rows: disputeItems } = await client.query(
        `SELECT * FROM dispute_items WHERE dispute_id = $1 ORDER BY created_at`,
        [disputeId]
      )
      const { rows: originalOrders } = await client.query(
        `SELECT * FROM customer_order WHERE id = $1`,
        [disputeRow.order_id]
      )
      if (!originalOrders.length) {
        throw new ValidationError('Original order not found for replacement')
      }

      replacementOrderId = await createReplacementOrderFromDispute(client, {
        disputeRow,
        disputeItems,
        originalOrder: originalOrders[0],
      })
    }

    await client.query(
      `
      UPDATE disputes
      SET status = 'resolved',
          resolution_type = $2,
          resolution_notes = $3,
          resolved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      `,
      [disputeId, resolutionType, resolutionNotes || null]
    )

    if (resolutionType === 'credit_note') {
      const amount = Number(creditNoteAmount)
      const creditNoteNumber = await generateCreditNoteNumber(client)
      await client.query(
        `
        INSERT INTO credit_note (
          credit_note_number, invoice_id, supplier_id, restaurant_id,
          issue_date, reason, description,
          credit_amount, applied_amount, remaining_amount,
          status, currency, order_id, notes, dispute_id
        ) VALUES (
          $1, $2, $3, $4, CURRENT_DATE, 'RETURN', $5,
          $6, 0, $6, 'ISSUED', 'USD', $7, $8, $9
        )
        `,
        [
          creditNoteNumber,
          disputeRow.invoice_id,
          disputeRow.supplier_id,
          disputeRow.restaurant_id,
          creditNoteNotes || `Credit for dispute ${disputeId.slice(0, 8)}`,
          amount,
          disputeRow.order_id,
          creditNoteNotes || null,
          disputeId,
        ]
      )
    }

    await restoreOrderStatusAfterDisputeClosed(client, disputeRow.order_id)
  })

  const detail = await loadDisputeDetail(disputeId, { supplierId })
  if (resolutionType === 'credit_note') {
    const { rows } = await query(
      `SELECT * FROM credit_note WHERE dispute_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [disputeId]
    )
    detail.creditNote = rows[0] || null
  }

  await notifyDisputeResolved(detail.dispute, 'resolved', {
    replacementOrderId: replacementOrderId || detail.dispute.replacementOrderId || null,
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

  if (invoiceId) {
    const { rows: inv } = await query(
      `SELECT id FROM invoice WHERE id = $1 AND restaurant_id = $2 AND supplier_id = $3`,
      [invoiceId, cn.restaurant_id, cn.supplier_id]
    )
    if (!inv.length) throw new ValidationError('Invoice does not match credit note parties')
  }

  await query(
    `
    UPDATE credit_note
    SET status = 'APPLIED',
        applied_amount = credit_amount,
        remaining_amount = 0,
        updated_at = NOW()
    WHERE id = $1
    `,
    [creditNoteId]
  )

  const { rows: updated } = await query(`SELECT * FROM credit_note WHERE id = $1`, [creditNoteId])
  return updated[0]
}
