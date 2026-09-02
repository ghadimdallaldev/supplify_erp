import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'
import { notifyQuoteRequestReceived, notifyQuoteResponseReceived } from './notification.service.js'

const DEFAULT_PAGE_SIZE = 20

function mapQuoteRequestRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    status: row.status,
    note: row.note,
    neededBy: row.needed_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount: row.item_count != null ? Number(row.item_count) : undefined,
    supplierCount: row.supplier_count != null ? Number(row.supplier_count) : undefined,
    responseCount: row.response_count != null ? Number(row.response_count) : undefined,
  }
}

async function filterEligibleSuppliers(restaurantId, supplierIds, dbQuery = query) {
  if (!supplierIds.length) return []
  const { rows } = await dbQuery(
    `
    SELECT s.id
    FROM supplier s
    WHERE s.id = ANY($1::uuid[])
      AND NOT EXISTS (
        SELECT 1 FROM supplier_blocklist sb
        WHERE sb.supplier_id = s.id AND sb.restaurant_id = $2
      )
    `,
    [supplierIds, restaurantId]
  )
  return rows.map((r) => r.id)
}

async function validateProducts(items, dbQuery = query) {
  if (!items.length) throw new ValidationError('At least one product is required')
  const productIds = [...new Set(items.map((i) => i.productId))]
  const { rows } = await dbQuery(
    `
    SELECT p.id, p.supplier_id, p.name, p.sku, p.unit
    FROM product p
    WHERE p.id = ANY($1::uuid[])
    `,
    [productIds]
  )
  if (rows.length !== productIds.length) {
    throw new ValidationError('One or more products were not found')
  }
  return new Map(rows.map((r) => [r.id, r]))
}

export async function createQuoteRequest(
  { restaurantId, userId, items, supplierIds, note, neededBy },
  dbQuery = query
) {
  const uniqueSupplierIds = [...new Set(supplierIds)]
  if (!uniqueSupplierIds.length) {
    throw new ValidationError('Select at least one supplier')
  }

  const eligibleSupplierIds = await filterEligibleSuppliers(
    restaurantId,
    uniqueSupplierIds,
    dbQuery
  )
  if (!eligibleSupplierIds.length) {
    throw new ValidationError('No eligible suppliers selected (blocked or inactive)')
  }

  const productMap = await validateProducts(items, dbQuery)

  const result = await withTransaction(async (client) => {
    const {
      rows: [header],
    } = await client.query(
      `
      INSERT INTO quote_requests (restaurant_id, status, note, needed_by, created_by)
      VALUES ($1, 'open', $2, $3, $4)
      RETURNING *
      `,
      [restaurantId, note || null, neededBy || null, userId || null]
    )

    const insertedItems = []
    for (const item of items) {
      const product = productMap.get(item.productId)
      const {
        rows: [row],
      } = await client.query(
        `
        INSERT INTO quote_request_items (quote_request_id, product_id, quantity, unit, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [
          header.id,
          item.productId,
          item.quantity,
          item.unit || product?.unit || null,
          item.notes || null,
        ]
      )
      insertedItems.push(row)
    }

    const supplierRows = []
    for (const supplierId of eligibleSupplierIds) {
      const {
        rows: [row],
      } = await client.query(
        `
        INSERT INTO quote_request_suppliers (quote_request_id, supplier_id, status)
        VALUES ($1, $2, 'pending')
        RETURNING *
        `,
        [header.id, supplierId]
      )
      supplierRows.push(row)
    }

    return { header, insertedItems, supplierRows }
  })

  for (const supplierRow of result.supplierRows) {
    await notifyQuoteRequestReceived({
      supplierId: supplierRow.supplier_id,
      quoteRequestId: result.header.id,
      quoteRequestSupplierId: supplierRow.id,
      restaurantId,
    }).catch(() => {})
  }

  return {
    quoteRequest: mapQuoteRequestRow(result.header),
    itemCount: result.insertedItems.length,
    supplierCount: result.supplierRows.length,
  }
}

export async function listRestaurantQuoteRequests(
  restaurantId,
  { page = 1, limit = DEFAULT_PAGE_SIZE, status } = {},
  dbQuery = query
) {
  const safeLimit = Math.min(Math.max(1, limit), 50)
  const offset = (Math.max(1, page) - 1) * safeLimit
  const params = [restaurantId]
  let statusFilter = ''
  if (status) {
    params.push(status)
    statusFilter = ` AND qr.status = $${params.length}`
  }

  const { rows } = await dbQuery(
    `
    SELECT
      qr.*,
      COALESCE(item_stats.item_count, 0) AS item_count,
      COALESCE(supplier_stats.supplier_count, 0) AS supplier_count,
      COALESCE(supplier_stats.response_count, 0) AS response_count
    FROM quote_requests qr
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS item_count
      FROM quote_request_items qri
      WHERE qri.quote_request_id = qr.id
    ) item_stats ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS supplier_count,
        COUNT(*) FILTER (WHERE qrs.status = 'responded')::int AS response_count
      FROM quote_request_suppliers qrs
      WHERE qrs.quote_request_id = qr.id
    ) supplier_stats ON true
    WHERE qr.restaurant_id = $1${statusFilter}
    ORDER BY qr.created_at DESC
    LIMIT ${safeLimit} OFFSET ${offset}
    `,
    params
  )

  const countParams = status ? [restaurantId, status] : [restaurantId]
  const countFilter = status ? ' AND status = $2' : ''
  const { rows: countRows } = await dbQuery(
    `SELECT COUNT(*)::int AS total FROM quote_requests WHERE restaurant_id = $1${countFilter}`,
    countParams
  )

  return {
    quoteRequests: rows.map(mapQuoteRequestRow),
    pagination: {
      page: Math.max(1, page),
      limit: safeLimit,
      total: countRows[0]?.total ?? 0,
    },
  }
}

async function loadQuoteRequestDetailRows(quoteRequestId, restaurantId, dbQuery = query) {
  const { rows: headers } = await dbQuery(
    `SELECT * FROM quote_requests WHERE id = $1 AND restaurant_id = $2`,
    [quoteRequestId, restaurantId]
  )
  if (!headers.length) throw new NotFoundError('Quote request not found')
  const header = headers[0]

  const { rows: items } = await dbQuery(
    `
    SELECT qri.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit,
           p.supplier_id AS product_supplier_id, p.image_url AS product_image_url
    FROM quote_request_items qri
    JOIN product p ON p.id = qri.product_id
    WHERE qri.quote_request_id = $1
    ORDER BY qri.created_at ASC
    `,
    [quoteRequestId]
  )

  const { rows: suppliers } = await dbQuery(
    `
    SELECT qrs.*, s.name AS supplier_name, s.slug AS supplier_slug,
           qr_resp.id AS response_id, qr_resp.note AS response_note,
           qr_resp.submitted_at AS response_submitted_at
    FROM quote_request_suppliers qrs
    JOIN supplier s ON s.id = qrs.supplier_id
    LEFT JOIN quote_responses qr_resp ON qr_resp.quote_request_supplier_id = qrs.id
    WHERE qrs.quote_request_id = $1
    ORDER BY s.name ASC
    `,
    [quoteRequestId]
  )

  const responseIds = suppliers.map((s) => s.response_id).filter(Boolean)
  let responseItemsByResponseId = new Map()
  if (responseIds.length) {
    const { rows: responseItems } = await dbQuery(
      `
      SELECT qri.*,
             sub_p.name AS substitute_product_name,
             sub_p.sku AS substitute_product_sku
      FROM quote_response_items qri
      LEFT JOIN product sub_p ON sub_p.id = qri.substitute_product_id
      WHERE qri.quote_response_id = ANY($1::uuid[])
      `,
      [responseIds]
    )
    responseItemsByResponseId = responseItems.reduce((acc, row) => {
      const list = acc.get(row.quote_response_id) || []
      list.push(row)
      acc.set(row.quote_response_id, list)
      return acc
    }, new Map())
  }

  return { header, items, suppliers, responseItemsByResponseId }
}

function formatQuoteDetail({ header, items, suppliers, responseItemsByResponseId }) {
  return {
    quoteRequest: mapQuoteRequestRow(header),
    items: items.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      productSku: row.product_sku,
      productUnit: row.product_unit || row.unit,
      productImageUrl: row.product_image_url,
      productSupplierId: row.product_supplier_id,
      quantity: Number(row.quantity),
      unit: row.unit,
      notes: row.notes,
    })),
    suppliers: suppliers.map((row) => ({
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      supplierSlug: row.supplier_slug,
      status: row.status,
      response: row.response_id
        ? {
            id: row.response_id,
            note: row.response_note,
            submittedAt: row.response_submitted_at,
            items: (responseItemsByResponseId.get(row.response_id) || []).map((ri) => ({
              id: ri.id,
              quoteRequestItemId: ri.quote_request_item_id,
              isAvailable: ri.is_available,
              unitPrice: ri.unit_price != null ? Number(ri.unit_price) : null,
              currency: ri.currency,
              quantity: ri.quantity != null ? Number(ri.quantity) : null,
              deliveryDate: ri.delivery_date,
              note: ri.note,
              substituteProductId: ri.substitute_product_id,
              substituteProductName: ri.substitute_product_name,
              substituteProductSku: ri.substitute_product_sku,
            })),
          }
        : null,
    })),
  }
}

export async function getQuoteRequestDetail(quoteRequestId, restaurantId, dbQuery = query) {
  const data = await loadQuoteRequestDetailRows(quoteRequestId, restaurantId, dbQuery)
  return formatQuoteDetail(data)
}

export async function getQuoteRequestCompare(quoteRequestId, restaurantId, dbQuery = query) {
  return getQuoteRequestDetail(quoteRequestId, restaurantId, dbQuery)
}

export async function listSupplierQuoteRequests(
  supplierId,
  { page = 1, limit = DEFAULT_PAGE_SIZE, status } = {},
  dbQuery = query
) {
  const safeLimit = Math.min(Math.max(1, limit), 50)
  const offset = (Math.max(1, page) - 1) * safeLimit
  const params = [supplierId]
  let statusFilter = ''
  if (status) {
    params.push(status)
    statusFilter = ` AND qrs.status = $${params.length}`
  }

  const { rows } = await dbQuery(
    `
    SELECT
      qrs.*,
      qr.id AS quote_request_id,
      qr.status AS quote_request_status,
      qr.note AS quote_request_note,
      qr.needed_by,
      qr.created_at AS quote_request_created_at,
      r.name AS restaurant_name,
      COALESCE(item_stats.item_count, 0) AS item_count
    FROM quote_request_suppliers qrs
    JOIN quote_requests qr ON qr.id = qrs.quote_request_id
    JOIN restaurant r ON r.id = qr.restaurant_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS item_count
      FROM quote_request_items qri
      WHERE qri.quote_request_id = qr.id
    ) item_stats ON true
    WHERE qrs.supplier_id = $1${statusFilter}
    ORDER BY qrs.created_at DESC
    LIMIT ${safeLimit} OFFSET ${offset}
    `,
    params
  )

  const countParams = status ? [supplierId, status] : [supplierId]
  const countFilter = status ? ' AND status = $2' : ''
  const { rows: countRows } = await dbQuery(
    `SELECT COUNT(*)::int AS total FROM quote_request_suppliers WHERE supplier_id = $1${countFilter}`,
    countParams
  )

  return {
    inbox: rows.map((row) => ({
      id: row.id,
      quoteRequestId: row.quote_request_id,
      status: row.status,
      quoteRequestStatus: row.quote_request_status,
      note: row.quote_request_note,
      neededBy: row.needed_by,
      createdAt: row.quote_request_created_at,
      restaurantName: row.restaurant_name,
      itemCount: Number(row.item_count),
    })),
    pagination: {
      page: Math.max(1, page),
      limit: safeLimit,
      total: countRows[0]?.total ?? 0,
    },
  }
}

export async function getSupplierQuoteRequestDetail(
  supplierId,
  quoteRequestSupplierId,
  dbQuery = query
) {
  const { rows } = await dbQuery(
    `
    SELECT qrs.*, qr.restaurant_id, qr.note AS quote_request_note, qr.needed_by,
           qr.status AS quote_request_status, r.name AS restaurant_name
    FROM quote_request_suppliers qrs
    JOIN quote_requests qr ON qr.id = qrs.quote_request_id
    JOIN restaurant r ON r.id = qr.restaurant_id
    WHERE qrs.id = $1 AND qrs.supplier_id = $2
    `,
    [quoteRequestSupplierId, supplierId]
  )
  if (!rows.length) throw new NotFoundError('Quote request not found')

  const row = rows[0]
  const { rows: items } = await dbQuery(
    `
    SELECT qri.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit,
           p.image_url AS product_image_url
    FROM quote_request_items qri
    JOIN product p ON p.id = qri.product_id
    WHERE qri.quote_request_id = $1
    ORDER BY qri.created_at ASC
    `,
    [row.quote_request_id]
  )

  const { rows: existingResponses } = await dbQuery(
    `SELECT * FROM quote_responses WHERE quote_request_supplier_id = $1`,
    [quoteRequestSupplierId]
  )
  let responseItems = []
  if (existingResponses[0]) {
    const { rows: ri } = await dbQuery(
      `SELECT * FROM quote_response_items WHERE quote_response_id = $1`,
      [existingResponses[0].id]
    )
    responseItems = ri
  }

  return {
    id: row.id,
    quoteRequestId: row.quote_request_id,
    status: row.status,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    quoteRequestNote: row.quote_request_note,
    neededBy: row.needed_by,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      productSku: item.product_sku,
      productUnit: item.product_unit || item.unit,
      productImageUrl: item.product_image_url,
      quantity: Number(item.quantity),
      unit: item.unit,
      notes: item.notes,
    })),
    response: existingResponses[0]
      ? {
          id: existingResponses[0].id,
          note: existingResponses[0].note,
          submittedAt: existingResponses[0].submitted_at,
          items: responseItems.map((ri) => ({
            quoteRequestItemId: ri.quote_request_item_id,
            isAvailable: ri.is_available,
            unitPrice: ri.unit_price != null ? Number(ri.unit_price) : null,
            currency: ri.currency,
            quantity: ri.quantity != null ? Number(ri.quantity) : null,
            deliveryDate: ri.delivery_date,
            note: ri.note,
            substituteProductId: ri.substitute_product_id,
          })),
        }
      : null,
  }
}

export async function submitQuoteResponse(
  { supplierId, userId, quoteRequestSupplierId, items, note },
  dbQuery = query
) {
  const { rows: qrsRows } = await dbQuery(
    `SELECT qrs.*, qr.restaurant_id FROM quote_request_suppliers qrs
     JOIN quote_requests qr ON qr.id = qrs.quote_request_id
     WHERE qrs.id = $1 AND qrs.supplier_id = $2`,
    [quoteRequestSupplierId, supplierId]
  )
  if (!qrsRows.length) throw new NotFoundError('Quote request not found')
  const qrs = qrsRows[0]

  const { rows: requestItems } = await dbQuery(
    `SELECT id FROM quote_request_items WHERE quote_request_id = $1`,
    [qrs.quote_request_id]
  )
  const validItemIds = new Set(requestItems.map((r) => r.id))

  for (const item of items) {
    if (!validItemIds.has(item.quoteRequestItemId)) {
      throw new ValidationError('Invalid quote request item')
    }
  }

  const result = await withTransaction(async (client) => {
    const { rows: existing } = await client.query(
      `SELECT id FROM quote_responses WHERE quote_request_supplier_id = $1`,
      [quoteRequestSupplierId]
    )

    let responseId
    if (existing[0]) {
      responseId = existing[0].id
      await client.query(
        `UPDATE quote_responses SET note = $2, responded_by = $3, submitted_at = now(), updated_at = now()
         WHERE id = $1`,
        [responseId, note || null, userId || null]
      )
      await client.query(`DELETE FROM quote_response_items WHERE quote_response_id = $1`, [
        responseId,
      ])
    } else {
      const {
        rows: [inserted],
      } = await client.query(
        `
        INSERT INTO quote_responses (quote_request_supplier_id, responded_by, note)
        VALUES ($1, $2, $3)
        RETURNING id
        `,
        [quoteRequestSupplierId, userId || null, note || null]
      )
      responseId = inserted.id
    }

    for (const item of items) {
      await client.query(
        `
        INSERT INTO quote_response_items (
          quote_response_id, quote_request_item_id, is_available, unit_price, currency,
          quantity, delivery_date, note, substitute_product_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          responseId,
          item.quoteRequestItemId,
          item.isAvailable !== false,
          item.unitPrice ?? null,
          item.currency || 'USD',
          item.quantity ?? null,
          item.deliveryDate || null,
          item.note || null,
          item.substituteProductId || null,
        ]
      )
    }

    await client.query(
      `UPDATE quote_request_suppliers SET status = 'responded', updated_at = now() WHERE id = $1`,
      [quoteRequestSupplierId]
    )

    return { responseId, restaurantId: qrs.restaurant_id, quoteRequestId: qrs.quote_request_id }
  })

  await notifyQuoteResponseReceived({
    restaurantId: result.restaurantId,
    quoteRequestId: result.quoteRequestId,
    quoteRequestSupplierId,
    supplierId,
  }).catch(() => {})

  return getSupplierQuoteRequestDetail(supplierId, quoteRequestSupplierId, dbQuery)
}

export async function buildCartPayloadFromResponse(
  { restaurantId, quoteRequestSupplierId },
  dbQuery = query
) {
  const { rows } = await dbQuery(
    `
    SELECT qrs.*, qr.restaurant_id
    FROM quote_request_suppliers qrs
    JOIN quote_requests qr ON qr.id = qrs.quote_request_id
    WHERE qrs.id = $1
    `,
    [quoteRequestSupplierId]
  )
  if (!rows.length) throw new NotFoundError('Quote response not found')
  const qrs = rows[0]
  if (qrs.restaurant_id !== restaurantId) {
    throw new ForbiddenError('Not allowed to access this quote response')
  }
  if (qrs.status !== 'responded') {
    throw new ValidationError('Supplier has not responded yet')
  }

  const { rows: responseRows } = await dbQuery(
    `SELECT id FROM quote_responses WHERE quote_request_supplier_id = $1`,
    [quoteRequestSupplierId]
  )
  if (!responseRows.length) throw new ValidationError('No response found')

  const { rows: lineItems } = await dbQuery(
    `
    SELECT qri.*, qreq.product_id, qreq.quantity AS requested_quantity,
           p.name, p.sku, p.unit, p.supplier_id, p.image_url, p.description,
           s.name AS supplier_name, s.slug AS supplier_slug
    FROM quote_response_items qri
    JOIN quote_request_items qreq ON qreq.id = qri.quote_request_item_id
    JOIN product p ON p.id = qreq.product_id
    JOIN supplier s ON s.id = p.supplier_id
    WHERE qri.quote_response_id = $1 AND qri.is_available = true
    `,
    [responseRows[0].id]
  )

  if (!lineItems.length) {
    throw new ValidationError('No available items in this response')
  }

  const items = lineItems.map((row) => {
    const quantity = row.quantity != null ? Number(row.quantity) : Number(row.requested_quantity)
    const quotedUnitPrice = row.unit_price != null ? Number(row.unit_price) : null
    return {
      productId: row.product_id,
      quantity,
      quotedUnitPrice,
      quoteResponseItemId: row.id,
      product: {
        id: row.product_id,
        supplier_id: row.supplier_id,
        sku: row.sku,
        name: row.name,
        description: row.description,
        unit: row.unit,
        image_url: row.image_url,
        supplier_name: row.supplier_name,
        supplier_slug: row.supplier_slug,
        current_price: quotedUnitPrice,
        currency: row.currency || 'USD',
      },
    }
  })

  return {
    supplierId: qrs.supplier_id,
    quoteRequestSupplierId: qrs.id,
    items,
  }
}

export async function assertRestaurantOwnsQuoteRequest(
  quoteRequestId,
  restaurantId,
  dbQuery = query
) {
  const { rows } = await dbQuery(
    `SELECT id FROM quote_requests WHERE id = $1 AND restaurant_id = $2`,
    [quoteRequestId, restaurantId]
  )
  if (!rows.length) throw new NotFoundError('Quote request not found')
  return rows[0]
}

export async function assertSupplierQuoteRequestAccess(
  quoteRequestSupplierId,
  supplierId,
  dbQuery = query
) {
  const { rows } = await dbQuery(
    `SELECT id FROM quote_request_suppliers WHERE id = $1 AND supplier_id = $2`,
    [quoteRequestSupplierId, supplierId]
  )
  if (!rows.length) throw new NotFoundError('Quote request not found')
  return rows[0]
}
