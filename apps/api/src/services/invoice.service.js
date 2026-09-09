import PDFDocument from 'pdfkit'
import { ConflictError, NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { escapeCsvField } from '../lib/sanitize-upload.js'

const VALID_STATUS_TRANSITIONS = {
  DRAFT: new Set(['ISSUED', 'VOID']),
  ISSUED: new Set(['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID']),
  PARTIALLY_PAID: new Set(['PAID', 'OVERDUE', 'VOID']),
  OVERDUE: new Set(['PARTIALLY_PAID', 'PAID', 'VOID']),
  PAID: new Set(),
  VOID: new Set(),
}

const MONEY_SCALE = 2

function roundMoney(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10 ** MONEY_SCALE) / 10 ** MONEY_SCALE
}

export function computeRemainingBalance(invoice, totalPaid) {
  const paid = roundMoney(totalPaid ?? invoice.paid_amount ?? 0)
  const total = roundMoney(invoice.total_amount ?? 0)
  const balanceDue = invoice.balance_due != null ? roundMoney(invoice.balance_due) : null
  if (balanceDue != null && balanceDue <= total) {
    return Math.max(0, balanceDue)
  }
  return Math.max(0, roundMoney(total - paid))
}

export function assertValidStatusTransition(fromStatus, toStatus) {
  const from = fromStatus || 'ISSUED'
  const allowed = VALID_STATUS_TRANSITIONS[from]
  if (!allowed || !allowed.has(toStatus)) {
    throw new ValidationError(`Cannot transition invoice from ${from} to ${toStatus}`)
  }
}

export async function generateInvoiceNumber(client, supplierId) {
  const { rows } = await client.query(`SELECT generate_invoice_number($1) AS invoice_number`, [
    supplierId,
  ])
  return rows[0]?.invoice_number
}

export async function generatePaymentNumber(client, prefix = 'PAY') {
  const { rows } = await client.query(`SELECT generate_payment_number($1) AS payment_number`, [
    prefix,
  ])
  return rows[0]?.payment_number
}

export async function assertNoDuplicateInvoice(client, { orderId, supplierId }) {
  if (!orderId) return
  const { rows } = await client.query(
    `SELECT id FROM invoice WHERE order_id = $1 AND supplier_id = $2 LIMIT 1`,
    [orderId, supplierId]
  )
  if (rows.length > 0) {
    throw new ConflictError('Invoice already exists for this order and supplier')
  }
}

export async function getSupplierTaxConfig(client, supplierId) {
  const { rows } = await client.query(
    `
    SELECT tax_rate, tax_type, tax_name
    FROM tax_config
    WHERE supplier_id = $1 AND is_active = true
      AND effective_from <= CURRENT_DATE
      AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    ORDER BY effective_from DESC
    LIMIT 1
    `,
    [supplierId]
  )
  if (rows.length === 0) {
    return { tax_rate: 0, tax_type: 'SALES_TAX', tax_name: 'Tax' }
  }
  return rows[0]
}

export async function getSupplierPaymentTermsDays(client, supplierId) {
  const { rows } = await client.query(`SELECT payment_terms FROM supplier WHERE id = $1 LIMIT 1`, [
    supplierId,
  ])
  const terms = rows[0]?.payment_terms || ''
  const netMatch = /net\s*(\d+)/i.exec(terms)
  if (netMatch) return parseInt(netMatch[1], 10)
  if (/cod/i.test(terms)) return 0
  return 30
}

export async function getOrderAdjustments(client, orderId) {
  const { rows } = await client.query(
    `
    SELECT
      COALESCE(SUM(pu.discount_applied), 0)::numeric AS order_discount,
      COALESCE(SUM(pu.delivery_discount_applied), 0)::numeric AS delivery_discount
    FROM promotion_usages pu
    WHERE pu.order_id = $1
    `,
    [orderId]
  )
  const row = rows[0] || {}
  return {
    orderDiscount: roundMoney(row.order_discount || 0),
    deliveryDiscount: roundMoney(row.delivery_discount || 0),
  }
}

/**
 * Load billable receiving lines (accepted qty > 0 only).
 */
export async function buildLineItemsFromReceiving(client, reportId) {
  const { rows } = await client.query(
    `
    SELECT
      rli.product_id,
      rli.order_item_id,
      rli.product_name,
      rli.product_sku AS sku,
      rli.received_quantity AS quantity,
      COALESCE(rli.actual_unit_price, rli.expected_unit_price) AS unit_price
    FROM receiving_line_item rli
    WHERE rli.receiving_report_id = $1
      AND rli.quality_status = 'ACCEPTED'
      AND rli.received_quantity > 0
    ORDER BY rli.created_at
    `,
    [reportId]
  )
  return rows.map((it) => {
    const quantity = parseFloat(it.quantity || 0)
    const unitPrice = parseFloat(it.unit_price || 0)
    const lineTotal = roundMoney(quantity * unitPrice)
    return {
      product_id: it.product_id,
      order_item_id: it.order_item_id,
      description: it.product_name,
      sku: it.sku,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
    }
  })
}

export function calculateInvoiceTotals(
  lineItems,
  { taxRate = 0, orderDiscount = 0, deliveryFee = 0 } = {}
) {
  const itemsSubtotal = roundMoney(
    lineItems.reduce((sum, line) => sum + roundMoney(line.line_total), 0)
  )
  const discount = roundMoney(Math.min(orderDiscount, itemsSubtotal))
  const fee = roundMoney(deliveryFee)
  const subtotal = roundMoney(itemsSubtotal - discount + fee)
  const taxAmount = roundMoney((subtotal * taxRate) / 100)
  const totalAmount = roundMoney(subtotal + taxAmount)

  const extraLines = []
  if (discount > 0) {
    extraLines.push({
      product_id: null,
      order_item_id: null,
      description: 'Order discount',
      sku: 'DISCOUNT',
      quantity: 1,
      unit_price: -discount,
      line_total: -discount,
      tax_rate: 0,
      tax_amount: 0,
    })
  }
  if (fee > 0) {
    extraLines.push({
      product_id: null,
      order_item_id: null,
      description: 'Delivery fee',
      sku: 'DELIVERY',
      quantity: 1,
      unit_price: fee,
      line_total: fee,
      tax_rate: 0,
      tax_amount: 0,
    })
  }

  return {
    itemsSubtotal,
    subtotal,
    taxRate,
    taxAmount,
    totalAmount,
    extraLines,
  }
}

async function insertInvoiceLineItems(client, invoiceId, lineItems, taxRate) {
  for (const it of lineItems) {
    const lineTax = roundMoney((it.line_total * taxRate) / 100)
    await client.query(
      `
      INSERT INTO invoice_line_item (
        invoice_id, product_id, description, sku,
        quantity, unit_price, line_total, tax_rate, tax_amount, order_item_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        invoiceId,
        it.product_id,
        it.description,
        it.sku,
        it.quantity,
        it.unit_price,
        it.line_total,
        taxRate,
        lineTax,
        it.order_item_id || null,
      ]
    )
  }
}

export async function createInvoiceFromReceiving(
  client,
  { order, report, supplierId, restaurantId, receivedBy }
) {
  await assertNoDuplicateInvoice(client, { orderId: order.id, supplierId })

  const lineItems = await buildLineItemsFromReceiving(client, report.id)
  if (lineItems.length === 0) {
    logger.info('Skipping invoice: no accepted receiving lines', { orderId: order.id })
    return null
  }

  const taxConfig = await getSupplierTaxConfig(client, supplierId)
  const taxRate = parseFloat(taxConfig.tax_rate || 0)
  const { orderDiscount } = await getOrderAdjustments(client, order.id)
  const paymentTermsDays = await getSupplierPaymentTermsDays(client, supplierId)

  const totals = calculateInvoiceTotals(lineItems, { taxRate, orderDiscount })
  const allLines = [...lineItems, ...totals.extraLines]

  const invoiceNumber = await generateInvoiceNumber(client, supplierId)
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + paymentTermsDays)

  const { rows: invRows } = await client.query(
    `
    INSERT INTO invoice (
      invoice_number, supplier_id, restaurant_id, order_id, branch_id,
      invoice_date, issue_date, due_date,
      subtotal, tax_amount, tax_rate, tax_included, total_amount,
      balance_due, paid_amount, status, currency, payment_terms_days, notes, created_by
    ) VALUES (
      $1, $2, $3, $4, $5,
      now(), now(), $6,
      $7, $8, $9, false, $10,
      $10, 0, 'ISSUED', $11, $12, $13, $14
    )
    RETURNING *
    `,
    [
      invoiceNumber,
      supplierId,
      restaurantId,
      order.id,
      order.branch_id || null,
      dueDate,
      totals.subtotal,
      totals.taxAmount,
      taxRate,
      totals.totalAmount,
      order.currency || 'USD',
      paymentTermsDays,
      `Invoice after receiving for Order #${String(order.id).slice(0, 8)}`,
      receivedBy || null,
    ]
  )

  const invoice = invRows[0]
  await insertInvoiceLineItems(client, invoice.id, allLines, taxRate)

  await client.query(
    `UPDATE customer_order SET status = 'INVOICED', updated_at = now() WHERE id = $1`,
    [order.id]
  )

  return invoice
}

export async function createInvoiceManual(client, { invoiceData, supplierId, orderItems, userId }) {
  if (invoiceData.order_id) {
    await assertNoDuplicateInvoice(client, {
      orderId: invoiceData.order_id,
      supplierId,
    })
  }

  const taxRate = parseFloat(invoiceData.tax_rate || 0)
  const lineItems = orderItems.map((item) => {
    const quantity = parseFloat(item.quantity || 0)
    const unitPrice = parseFloat(item.unit_price || 0)
    const lineTotal = roundMoney(quantity * unitPrice)
    return {
      product_id: item.product_id,
      order_item_id: item.id,
      description: item.product_name || item.description || 'Product',
      sku: item.sku || 'N/A',
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
    }
  })

  const totals = calculateInvoiceTotals(lineItems, { taxRate })
  const invoiceNumber = await generateInvoiceNumber(client, supplierId)
  const dueDate = new Date(invoiceData.due_date)
  const paymentTermsDays = invoiceData.payment_terms_days ?? 30

  let branchId = null
  if (invoiceData.order_id) {
    const { rows } = await client.query(`SELECT branch_id FROM customer_order WHERE id = $1`, [
      invoiceData.order_id,
    ])
    branchId = rows[0]?.branch_id || null
  }

  const { rows: invoice } = await client.query(
    `
    INSERT INTO invoice (
      invoice_number, supplier_id, restaurant_id, order_id, branch_id,
      invoice_date, due_date, issue_date,
      subtotal, tax_amount, total_amount, balance_due,
      status, currency, tax_rate, tax_included, payment_terms_days,
      notes, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *
    `,
    [
      invoiceNumber,
      supplierId,
      invoiceData.restaurant_id,
      invoiceData.order_id || null,
      branchId,
      new Date(),
      dueDate,
      new Date(),
      totals.subtotal,
      totals.taxAmount,
      totals.totalAmount,
      totals.totalAmount,
      'ISSUED',
      'USD',
      taxRate,
      invoiceData.tax_included ?? false,
      paymentTermsDays,
      invoiceData.notes || null,
      userId,
    ]
  )

  await insertInvoiceLineItems(client, invoice[0].id, lineItems, taxRate)
  return invoice[0]
}

export async function lockOrderForReceiving(client, orderId, restaurantId) {
  const { rows } = await client.query(
    `
    SELECT * FROM customer_order
    WHERE id = $1 AND restaurant_id = $2
    FOR UPDATE
    `,
    [orderId, restaurantId]
  )
  if (rows.length === 0) {
    throw new NotFoundError('Order not found')
  }
  return rows[0]
}

export async function assertNoReceivingReport(client, orderId) {
  const { rows } = await client.query(
    `SELECT 1 FROM receiving_report WHERE order_id = $1 LIMIT 1`,
    [orderId]
  )
  if (rows.length > 0) {
    throw new ConflictError('Receiving report already exists for this order')
  }
}

const INVOICE_DETAIL_SELECT = `
  SELECT
    i.*,
    r.name AS restaurant_name,
    r.contact_name AS restaurant_contact,
    r.email AS restaurant_email,
    r.phone AS restaurant_phone,
    s.name AS supplier_name,
    s.contact_email AS supplier_email,
    s.phone AS supplier_phone,
    s.address_json AS supplier_address,
    b.name AS branch_name,
    o.id AS linked_order_id,
    o.status AS order_status,
    o.placed_at AS order_placed_at,
    COALESCE(paid.total_paid, 0) AS total_paid
  FROM invoice i
  LEFT JOIN restaurant r ON r.id = i.restaurant_id
  LEFT JOIN supplier s ON s.id = i.supplier_id
  LEFT JOIN branch b ON b.id = i.branch_id
  LEFT JOIN customer_order o ON o.id = i.order_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(payment_amount) FILTER (WHERE status = 'COMPLETED'), 0) AS total_paid
    FROM payment
    WHERE invoice_id = i.id
  ) paid ON true
`

export async function getInvoiceDetail(
  invoiceId,
  { tenantId, tenantType, includePayments = true, adminBypass = false } = {}
) {
  const params = [invoiceId]
  let tenantFilter = ''
  if (!adminBypass) {
    const column = tenantType === 'SUPPLIER' ? 'i.supplier_id' : 'i.restaurant_id'
    tenantFilter = ` AND ${column} = $2`
    params.push(tenantId)
  }

  const { rows } = await query(
    `
    ${INVOICE_DETAIL_SELECT}
    WHERE i.id = $1${tenantFilter}
    `,
    params
  )

  if (rows.length === 0) {
    throw new NotFoundError('Invoice not found')
  }

  const invoice = rows[0]
  invoice.remaining_balance = computeRemainingBalance(invoice, invoice.total_paid)

  const { rows: lineItems } = await query(
    `SELECT * FROM invoice_line_item WHERE invoice_id = $1 ORDER BY created_at`,
    [invoiceId]
  )

  let payments = []
  if (includePayments) {
    const { rows: paymentRows } = await query(
      `
      SELECT p.*, pm.name AS recorded_by_name
      FROM payment p
      LEFT JOIN app_user pm ON pm.id::text = p.recorded_by
      WHERE p.invoice_id = $1
      ORDER BY p.payment_date DESC, p.created_at DESC
      `,
      [invoiceId]
    )
    payments = paymentRows
  }

  const { rows: creditNotes } = await query(
    `
    SELECT id, credit_note_number, issue_date, credit_amount, applied_amount,
           remaining_amount, reason, status
    FROM credit_note
    WHERE invoice_id = $1
    ORDER BY issue_date DESC
    `,
    [invoiceId]
  )

  return { invoice, lineItems, payments, creditNotes }
}

export async function getInvoiceDetailForPdf(invoiceId, tenantId, tenantType) {
  return getInvoiceDetail(invoiceId, { tenantId, tenantType, includePayments: true })
}

export function buildInvoicePdfBuffer(detail) {
  const { invoice, lineItems, payments, creditNotes } = detail
  const currency = invoice.currency || 'USD'
  const fmt = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n || 0))

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(20).text('INVOICE')
    doc.fontSize(10).text(`#${invoice.invoice_number}`)
    if (invoice.linked_order_id || invoice.order_id) {
      doc.text(`Order: #${String(invoice.linked_order_id || invoice.order_id).slice(0, 8)}`)
    }
    doc.moveDown()
    doc.text(`Date: ${invoice.invoice_date}`)
    doc.text(`Due: ${invoice.due_date}`)
    doc.text(`Status: ${invoice.status || 'ISSUED'}`)
    if (invoice.branch_name) doc.text(`Branch: ${invoice.branch_name}`)
    doc.moveDown()
    doc.text(`Supplier: ${invoice.supplier_name || ''}`)
    doc.text(`Restaurant: ${invoice.restaurant_name || ''}`)
    doc.moveDown(1.5)

    doc.fontSize(12).text('Line items', { underline: true })
    doc.moveDown(0.5)
    doc.fontSize(10)
    lineItems.forEach((line, i) => {
      const sku = line.sku ? ` [${line.sku}]` : ''
      doc.text(
        `${i + 1}. ${line.description || 'Item'}${sku} | Qty: ${line.quantity} @ ${fmt(line.unit_price)} = ${fmt(line.line_total)}`
      )
    })
    doc.moveDown(1)
    doc.text(`Subtotal: ${fmt(invoice.subtotal)}`)
    doc.text(`Tax (${invoice.tax_rate || 0}%): ${fmt(invoice.tax_amount)}`)
    doc.fontSize(12).text(`Total: ${fmt(invoice.total_amount)}`)
    doc.text(`Paid: ${fmt(invoice.total_paid ?? invoice.paid_amount)}`)
    doc.text(`Balance due: ${fmt(invoice.remaining_balance ?? invoice.balance_due)}`)

    if (creditNotes?.length) {
      doc.moveDown(1)
      doc.fontSize(12).text('Credit notes', { underline: true })
      doc.fontSize(10)
      creditNotes.forEach((cn) => {
        doc.text(`${cn.credit_note_number}: ${fmt(cn.credit_amount)} (${cn.status})`)
      })
    }

    if (payments?.length) {
      doc.moveDown(1)
      doc.fontSize(12).text('Payments', { underline: true })
      doc.fontSize(10)
      payments.forEach((p) => {
        doc.text(
          `${p.payment_date} ${p.payment_method} ${fmt(p.payment_amount)} (${p.status})${p.payment_reference ? ` ref ${p.payment_reference}` : ''}`
        )
      })
    }

    doc.end()
  })
}

export function invoiceToCsvRow(invoice) {
  return [
    escapeCsvField(invoice.invoice_number),
    escapeCsvField(invoice.order_id || invoice.linked_order_id || ''),
    escapeCsvField(invoice.supplier_name || ''),
    escapeCsvField(invoice.restaurant_name || ''),
    escapeCsvField(invoice.branch_name || ''),
    escapeCsvField(invoice.invoice_date),
    escapeCsvField(invoice.due_date),
    escapeCsvField(invoice.status),
    invoice.subtotal ?? '',
    invoice.tax_amount ?? '',
    invoice.total_amount ?? '',
    invoice.total_paid ?? invoice.paid_amount ?? '',
    invoice.remaining_balance ?? invoice.balance_due ?? '',
    escapeCsvField(invoice.currency || 'USD'),
  ].join(',')
}

export const INVOICE_CSV_HEADER =
  'Invoice Number,Order ID,Supplier,Restaurant,Branch,Invoice Date,Due Date,Status,Subtotal,Tax,Total,Paid,Balance,Currency\n'

export async function applyCreditToInvoice(
  client,
  { creditNoteId, invoiceId, creditAmount, paymentDate, recordedBy }
) {
  const { rows: creditNotes } = await client.query(
    `
    SELECT * FROM credit_note
    WHERE id = $1 AND status = 'ISSUED' AND remaining_amount > 0
    FOR UPDATE
    `,
    [creditNoteId]
  )
  if (creditNotes.length === 0) {
    throw new ValidationError('Invalid or unavailable credit note')
  }
  const creditNote = creditNotes[0]
  const available = roundMoney(creditNote.remaining_amount)
  const amount = roundMoney(creditAmount ?? available)
  if (amount <= 0) {
    throw new ValidationError('Credit amount must be greater than 0')
  }
  if (amount > available) {
    throw new ValidationError(`Credit amount (${amount}) exceeds available credit (${available})`)
  }

  const { rows: invoices } = await client.query(`SELECT * FROM invoice WHERE id = $1 FOR UPDATE`, [
    invoiceId,
  ])
  if (invoices.length === 0) {
    throw new NotFoundError('Invoice not found')
  }
  const invoice = invoices[0]

  if (
    creditNote.restaurant_id !== invoice.restaurant_id ||
    creditNote.supplier_id !== invoice.supplier_id
  ) {
    throw new ValidationError('Credit note does not match invoice parties')
  }

  const { rows: paidRows } = await client.query(
    `
    SELECT COALESCE(SUM(payment_amount), 0) AS total_paid
    FROM payment WHERE invoice_id = $1 AND status = 'COMPLETED'
    `,
    [invoiceId]
  )
  const remaining = computeRemainingBalance(invoice, paidRows[0]?.total_paid)
  if (amount > remaining) {
    throw new ValidationError(`Credit amount (${amount}) exceeds remaining balance (${remaining})`)
  }

  await client.query(
    `
    UPDATE credit_note
    SET applied_amount = applied_amount + $1,
        remaining_amount = remaining_amount - $1,
        status = CASE WHEN remaining_amount - $1 <= 0 THEN 'APPLIED' ELSE 'ISSUED' END,
        updated_at = now()
    WHERE id = $2
    `,
    [amount, creditNoteId]
  )

  const paymentNumber = await generatePaymentNumber(client, 'CREDIT')
  await client.query(
    `
    INSERT INTO payment (
      invoice_id, payment_number, payment_date, payment_amount,
      payment_method, currency, status, recorded_by, notes, payment_reference
    ) VALUES ($1, $2, $3, $4, 'OTHER', $5, 'COMPLETED', $6, $7, $8)
    `,
    [
      invoiceId,
      paymentNumber,
      paymentDate || new Date().toISOString().slice(0, 10),
      amount,
      invoice.currency || 'USD',
      recordedBy,
      `Credit note applied: ${creditNote.credit_note_number}`,
      creditNoteId,
    ]
  )

  const { rows: updated } = await client.query(`SELECT * FROM credit_note WHERE id = $1`, [
    creditNoteId,
  ])
  const { rows: updatedInvoice } = await client.query(`SELECT * FROM invoice WHERE id = $1`, [
    invoiceId,
  ])
  return { creditNote: updated[0], invoice: updatedInvoice[0] }
}

export async function recordCashPayment(
  client,
  {
    invoiceId,
    paymentAmount,
    paymentDate,
    paymentMethod,
    paymentReference,
    notes,
    bankName,
    provider,
    providerTransactionId,
    recordedBy,
    currency,
  }
) {
  const { rows: invoices } = await client.query(`SELECT * FROM invoice WHERE id = $1 FOR UPDATE`, [
    invoiceId,
  ])
  if (invoices.length === 0) {
    throw new NotFoundError('Invoice not found')
  }
  const invoice = invoices[0]

  const { rows: paidRows } = await client.query(
    `
    SELECT COALESCE(SUM(payment_amount), 0) AS total_paid
    FROM payment WHERE invoice_id = $1 AND status = 'COMPLETED'
    `,
    [invoiceId]
  )
  const remaining = computeRemainingBalance(invoice, paidRows[0]?.total_paid)
  const amount = roundMoney(paymentAmount)

  if (amount <= 0) {
    throw new ValidationError('Payment amount must be greater than 0')
  }
  if (amount > remaining) {
    throw new ValidationError(`Payment amount (${amount}) exceeds remaining balance (${remaining})`)
  }

  const paymentNumber = await generatePaymentNumber(client, 'PAY')
  const { rows: paymentRows } = await client.query(
    `
    INSERT INTO payment (
      invoice_id, payment_number, payment_date, payment_amount,
      payment_method, payment_reference, currency, status,
      recorded_by, notes, bank_name, provider, provider_transaction_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED', $8, $9, $10, $11, $12)
    RETURNING *
    `,
    [
      invoiceId,
      paymentNumber,
      paymentDate,
      amount,
      paymentMethod,
      paymentReference || null,
      currency || invoice.currency || 'USD',
      recordedBy,
      notes || null,
      bankName || null,
      provider || null,
      providerTransactionId || null,
    ]
  )

  const { rows: updatedInvoice } = await client.query(`SELECT * FROM invoice WHERE id = $1`, [
    invoiceId,
  ])
  return { payment: paymentRows[0], invoice: updatedInvoice[0] }
}

export async function updateInvoiceStatus(client, invoiceId, { status, notes, userId }) {
  const { rows: current } = await client.query(`SELECT * FROM invoice WHERE id = $1 FOR UPDATE`, [
    invoiceId,
  ])
  if (current.length === 0) {
    throw new NotFoundError('Invoice not found')
  }
  const invoice = current[0]

  if (status === 'PAID') {
    throw new ValidationError('Use payment recording to mark invoices as paid')
  }
  if (status === 'VOID' && invoice.status === 'PAID') {
    throw new ValidationError('Cannot void a paid invoice')
  }
  if (status !== invoice.status) {
    assertValidStatusTransition(invoice.status, status)
  }

  const voidedBy = status === 'VOID' ? userId : null
  const voidedAt = status === 'VOID' ? new Date() : null

  const { rows } = await client.query(
    `
    UPDATE invoice
    SET status = $1, notes = COALESCE($2, notes),
        voided_by = $3, voided_at = $4, updated_at = now()
    WHERE id = $5
    RETURNING *
    `,
    [status, notes ?? null, voidedBy, voidedAt, invoiceId]
  )
  return rows[0]
}
