import crypto from 'node:crypto'
import { query, withTransaction } from '../lib/db.js'
import { buildAppUrl } from '../lib/app-url.js'
import { ValidationError, NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'
import { getDefaultCatalogPricesBatch } from './resolve-product-price.service.js'
import { resolvePublicSupplierByIdOrSlug } from './public-supplier-catalog.service.js'
import { restaurantMatchesZone } from './warehouseRouting.js'
import { reserveWarehouseStockBatch } from './warehouseInventory.js'
import { insertOrderItemsBatch } from './order-create.service.js'
import {
  assertLineQuantityRules,
  assertSupplierMinimumOrderAmount,
} from '../lib/order-quantity-rules.js'
import {
  claimOrderPlacementKey,
  completeOrderPlacementKey,
  hashOrderPlacementPayload,
} from './order-placement-idempotency.service.js'

export const PUBLIC_PAYMENT_METHODS = ['CASH_ON_DELIVERY', 'CASH_ON_PICKUP', 'BANK_TRANSFER']

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function publicOrderRef(orderId) {
  return `ORD-${String(orderId).slice(0, 8).toUpperCase()}`
}

function publicOrderProjection(order, items = []) {
  return {
    id: order.id,
    reference: publicOrderRef(order.id),
    customerType: order.customer_type,
    status: order.status,
    subtotal: Number(order.subtotal_amount || 0),
    deliveryFee: Number(order.delivery_fee || 0),
    total: Number(order.total_amount || 0),
    currency: order.currency || 'USD',
    fulfillmentMethod: order.requested_delivery_method,
    deliveryLocation: order.delivery_location_snapshot || null,
    paymentMethod: order.checkout_payment_method,
    customer: order.customer_contact_snapshot || null,
    notes: order.notes || null,
    placedAt: order.placed_at,
    createdAt: order.created_at,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      supplierId: item.supplier_id,
      name: item.product_name || item.name,
      sku: item.sku || null,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
  }
}

function publicSalesValidationErrors(config) {
  const errors = []
  if (!config.deliveryEnabled && !config.pickupEnabled) {
    errors.push('Configure at least one public fulfillment location')
  }
  if (!config.paymentMethods.length) {
    errors.push('Configure at least one public payment method')
  }
  if (config.paymentMethods.includes('CASH_ON_DELIVERY') && !config.deliveryEnabled) {
    errors.push('Cash on delivery requires public delivery')
  }
  if (config.paymentMethods.includes('CASH_ON_PICKUP') && !config.pickupEnabled) {
    errors.push('Cash on pickup requires a pickup warehouse')
  }
  if (
    config.paymentMethods.includes('BANK_TRANSFER') &&
    !String(config.bankTransferInstructions || '').trim()
  ) {
    errors.push('Bank transfer instructions are required')
  }
  return errors
}

export async function getSupplierPublicSalesConfig(supplierId, dbQuery = query) {
  const { rows } = await dbQuery(
    `SELECT s.id AS supplier_id, s.slug, s.name, s.public_catalog_enabled,
            COALESCE(c.enabled, false) AS enabled,
            COALESCE(c.payment_methods, ARRAY[]::text[]) AS payment_methods,
            c.bank_transfer_instructions, c.pickup_warehouse_id,
            pw.name AS pickup_warehouse_name,
            COALESCE(pw.address, pw.address_json) AS pickup_address,
            COALESCE(array_agg(DISTINCT pdw.warehouse_id)
              FILTER (WHERE pdw.warehouse_id IS NOT NULL), ARRAY[]::uuid[]) AS delivery_warehouse_ids
     FROM supplier s
     LEFT JOIN supplier_public_sales_config c ON c.supplier_id = s.id
     LEFT JOIN warehouse pw ON pw.id = c.pickup_warehouse_id
       AND pw.supplier_id = s.id AND pw.is_active = true
     LEFT JOIN supplier_public_delivery_warehouse pdw ON pdw.supplier_id = s.id
     WHERE s.id = $1
     GROUP BY s.id, c.supplier_id, c.enabled, c.payment_methods,
              c.bank_transfer_instructions, c.pickup_warehouse_id,
              pw.name, pw.address, pw.address_json`,
    [supplierId]
  )
  if (!rows.length) throw new NotFoundError('Supplier not found')
  const row = rows[0]
  const deliveryWarehouseIds = row.delivery_warehouse_ids || []
  const config = {
    supplierId: row.supplier_id,
    enabled: row.enabled === true,
    publicCatalogEnabled: row.public_catalog_enabled === true,
    storefrontUrl: buildAppUrl(`/supplier/${row.slug || row.supplier_id}`),
    paymentMethods: row.payment_methods || [],
    bankTransferInstructions: row.bank_transfer_instructions || null,
    deliveryEnabled: deliveryWarehouseIds.length > 0,
    deliveryWarehouseIds,
    pickupEnabled: Boolean(row.pickup_warehouse_id),
    pickupWarehouse: row.pickup_warehouse_id
      ? {
          id: row.pickup_warehouse_id,
          name: row.pickup_warehouse_name,
          address: row.pickup_address || null,
        }
      : null,
  }
  return { ...config, validationErrors: publicSalesValidationErrors(config) }
}

export async function listSupplierPublicSalesWarehouses(supplierId, dbQuery = query) {
  const { rows } = await dbQuery(
    `SELECT w.id, w.name, w.code, COALESCE(w.address, w.address_json) AS address,
            EXISTS (
              SELECT 1 FROM delivery_zone dz
              WHERE dz.warehouse_id = w.id AND dz.supplier_id = $1 AND dz.is_active = true
            ) AS has_active_delivery_zone
     FROM warehouse w
     WHERE w.supplier_id = $1 AND w.is_active = true
     ORDER BY COALESCE(w.is_main, false) DESC, w.name ASC`,
    [supplierId]
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address || null,
    hasActiveDeliveryZone: row.has_active_delivery_zone === true,
  }))
}

export async function updateSupplierPublicSalesConfig(supplierId, input) {
  const warehouses = await listSupplierPublicSalesWarehouses(supplierId)
  const byId = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]))
  const deliveryWarehouseIds = [...new Set(input.deliveryWarehouseIds || [])]
  const paymentMethods = [...new Set(input.paymentMethods || [])]

  if (paymentMethods.some((method) => !PUBLIC_PAYMENT_METHODS.includes(method))) {
    throw new ValidationError('Unsupported public payment method')
  }
  for (const warehouseId of deliveryWarehouseIds) {
    const warehouse = byId.get(warehouseId)
    if (!warehouse) throw new ValidationError('Delivery warehouse is not active for this supplier')
    if (!warehouse.hasActiveDeliveryZone) {
      throw new ValidationError('Every public delivery warehouse must have an active delivery zone')
    }
  }
  if (input.pickupWarehouseId && !byId.has(input.pickupWarehouseId)) {
    throw new ValidationError('Pickup warehouse is not active for this supplier')
  }
  if (paymentMethods.includes('CASH_ON_DELIVERY') && deliveryWarehouseIds.length === 0) {
    throw new ValidationError('Cash on delivery requires public delivery')
  }
  if (paymentMethods.includes('CASH_ON_PICKUP') && !input.pickupWarehouseId) {
    throw new ValidationError('Cash on pickup requires a pickup warehouse')
  }
  if (
    paymentMethods.includes('BANK_TRANSFER') &&
    !String(input.bankTransferInstructions || '').trim()
  ) {
    throw new ValidationError('Bank transfer instructions are required')
  }
  if (input.enabled && deliveryWarehouseIds.length === 0 && !input.pickupWarehouseId) {
    throw new ValidationError('Configure delivery or pickup before enabling public sales')
  }
  if (input.enabled && paymentMethods.length === 0) {
    throw new ValidationError('Configure at least one payment method before enabling public sales')
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO supplier_public_sales_config
         (supplier_id, enabled, payment_methods, bank_transfer_instructions, pickup_warehouse_id)
       VALUES ($1, $2, $3::text[], $4, $5)
       ON CONFLICT (supplier_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         payment_methods = EXCLUDED.payment_methods,
         bank_transfer_instructions = EXCLUDED.bank_transfer_instructions,
         pickup_warehouse_id = EXCLUDED.pickup_warehouse_id,
         updated_at = now()`,
      [
        supplierId,
        Boolean(input.enabled),
        paymentMethods,
        String(input.bankTransferInstructions || '').trim() || null,
        input.pickupWarehouseId || null,
      ]
    )
    await client.query(`DELETE FROM supplier_public_delivery_warehouse WHERE supplier_id = $1`, [
      supplierId,
    ])
    if (deliveryWarehouseIds.length) {
      await client.query(
        `INSERT INTO supplier_public_delivery_warehouse (supplier_id, warehouse_id)
         SELECT $1, unnest($2::uuid[])`,
        [supplierId, deliveryWarehouseIds]
      )
    }
  })

  return getSupplierPublicSalesConfig(supplierId)
}

export async function listPublicSalesSuppliers({ page = 1, limit = 24, q = '' } = {}) {
  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.min(48, Math.max(1, Number(limit) || 24))
  const search = String(q || '').trim()
  const params = [search ? `%${search}%` : null, safeLimit, (safePage - 1) * safeLimit]
  const { rows } = await query(
    `WITH ranked AS (
       SELECT
         COALESCE(so.id, s.id) AS id,
         COALESCE(so.name, s.name) AS name,
         COALESCE(so.slug, s.slug) AS slug,
         s.logo_url,
         ROW_NUMBER() OVER (
           PARTITION BY COALESCE(s.organization_id, s.id)
           ORDER BY s.is_main_branch DESC, s.created_at ASC
         ) AS branch_rank
       FROM supplier s
       LEFT JOIN supplier_organizations so ON so.id = s.organization_id
       JOIN supplier_public_sales_config c ON c.supplier_id = s.id AND c.enabled = true
       WHERE s.public_catalog_enabled = true
         AND s.is_branch_active = true
         AND ($1::text IS NULL OR COALESCE(so.name, s.name) ILIKE $1)
     ), candidates AS (
       SELECT id, name, slug, logo_url, COUNT(*) OVER()::int AS total
       FROM ranked WHERE branch_rank = 1
     )
     SELECT * FROM candidates ORDER BY name ASC LIMIT $2 OFFSET $3`,
    params
  )
  return {
    suppliers: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logo_url || null,
    })),
    pagination: { page: safePage, limit: safeLimit, total: rows[0]?.total || 0 },
  }
}

async function loadCheckoutProducts(scope, requestedItems, dbQuery) {
  const productIds = requestedItems.map((item) => item.productId)
  const { rows } = await dbQuery(
    `SELECT p.id, p.supplier_id, p.name, p.sku, p.unit,
            COALESCE(pis.moq, 1) AS moq,
            COALESCE(pis.order_multiple, 1) AS order_multiple,
            s.name AS supplier_name, s.organization_id, s.minimum_order_amount,
            s.default_warehouse_id, s.fulfillment_mode, s.multi_warehouse_enabled
     FROM product p
     JOIN supplier s ON s.id = p.supplier_id
     LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
     WHERE p.id = ANY($1::uuid[]) AND p.supplier_id = ANY($2::uuid[])`,
    [productIds, scope.supplierIds]
  )
  if (rows.length !== productIds.length)
    throw new ValidationError('One or more products are unavailable')
  const supplierIds = [...new Set(rows.map((row) => row.supplier_id))]
  if (supplierIds.length !== 1) {
    const error = new ValidationError('One public order must use a single supplier location')
    error.code = 'NO_SINGLE_FULFILLMENT_LOCATION'
    throw error
  }
  const prices = await getDefaultCatalogPricesBatch(productIds, dbQuery)
  const requestById = new Map(requestedItems.map((item) => [item.productId, item]))
  const items = rows.map((row) => {
    const request = requestById.get(row.id)
    const price = prices.get(row.id)
    if (!price) throw new ValidationError(`${row.name} does not have a public catalog price`)
    assertLineQuantityRules({
      quantity: request.quantity,
      moq: row.moq,
      orderMultiple: row.order_multiple,
      sku: row.sku,
      productId: row.id,
    })
    return {
      productId: row.id,
      supplierId: row.supplier_id,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      quantity: Number(request.quantity),
      unitPrice: Number(price.amount),
      currency: price.currency || 'USD',
      lineTotal: money(Number(request.quantity) * Number(price.amount)),
      pricingSource: 'DEFAULT_PRICE',
      defaultCatalogPrice: Number(price.amount),
      product: row,
    }
  })
  const currencies = [...new Set(items.map((item) => item.currency))]
  if (currencies.length !== 1) throw new ValidationError('Mixed currencies are not supported')
  return { supplierId: supplierIds[0], supplier: rows[0], items, currency: currencies[0] }
}

async function resolvePublicOrderSupplierId(idOrSlug, requestedItems, dbQuery) {
  const scope = await resolvePublicSupplierByIdOrSlug(idOrSlug, dbQuery)
  const productIds = requestedItems.map((item) => item.productId)
  const { rows } = await dbQuery(
    `SELECT DISTINCT p.supplier_id
     FROM product p
     WHERE p.id = ANY($1::uuid[]) AND p.supplier_id = ANY($2::uuid[])`,
    [productIds, scope.supplierIds]
  )
  if (rows.length !== 1) {
    const error = new ValidationError('One public order must use a single supplier location')
    error.code = 'NO_SINGLE_FULFILLMENT_LOCATION'
    throw error
  }
  return rows[0].supplier_id
}

async function loadFulfillmentCandidates(client, supplierId, config, items, input, lockStock) {
  const warehouseIds =
    input.fulfillmentMethod === 'PICKUP'
      ? [config.pickupWarehouse?.id].filter(Boolean)
      : config.deliveryWarehouseIds
  if (!warehouseIds.length) throw new ValidationError('Selected fulfillment method is unavailable')

  const { rows: warehouses } = await client.query(
    `SELECT id, name, COALESCE(address, address_json) AS address
     FROM warehouse WHERE supplier_id = $1 AND id = ANY($2::uuid[]) AND is_active = true`,
    [supplierId, warehouseIds]
  )
  if (!warehouses.length) throw new ValidationError('No active public fulfillment location')
  const productIds = items.map((item) => item.productId)
  const { rows: stockRows } = await client.query(
    `SELECT wi.warehouse_id, wi.product_id, wi.quantity_available
     FROM warehouse_inventory wi
     WHERE wi.warehouse_id = ANY($1::uuid[]) AND wi.product_id = ANY($2::uuid[])
     ${lockStock ? 'FOR UPDATE' : ''}`,
    [warehouseIds, productIds]
  )
  const stock = new Map(
    stockRows.map((row) => [
      `${row.warehouse_id}:${row.product_id}`,
      Number(row.quantity_available),
    ])
  )
  const stockEligible = warehouses.filter((warehouse) =>
    items.every((item) => (stock.get(`${warehouse.id}:${item.productId}`) || 0) >= item.quantity)
  )
  if (!stockEligible.length)
    throw new ValidationError('Insufficient stock at a public fulfillment location')

  if (input.fulfillmentMethod === 'PICKUP') {
    return { warehouse: stockEligible[0], zone: null, deliveryFee: 0 }
  }
  if (!input.deliveryAddress) throw new ValidationError('Delivery address is required')
  const { rows: zones } = await client.query(
    `SELECT * FROM delivery_zone
     WHERE supplier_id = $1 AND warehouse_id = ANY($2::uuid[]) AND is_active = true`,
    [supplierId, stockEligible.map((warehouse) => warehouse.id)]
  )
  const matches = zones
    .filter((zone) => restaurantMatchesZone(zone, input.deliveryAddress))
    .map((zone) => ({
      zone,
      warehouse: stockEligible.find((warehouse) => warehouse.id === zone.warehouse_id),
    }))
    .filter((entry) => entry.warehouse)
    .sort(
      (a, b) =>
        Number(a.zone.delivery_fee || 0) - Number(b.zone.delivery_fee || 0) ||
        String(a.warehouse.id).localeCompare(String(b.warehouse.id))
    )
  if (!matches.length) {
    const error = new ValidationError('Delivery address is outside this supplier’s service zones')
    error.code = 'ZONE_INELIGIBLE'
    throw error
  }
  return {
    warehouse: matches[0].warehouse,
    zone: matches[0].zone,
    deliveryFee: money(matches[0].zone.delivery_fee || 0),
  }
}

export async function previewPublicOrder(
  idOrSlug,
  input,
  dbQuery = query,
  { lockStock = false } = {}
) {
  const scope = await resolvePublicSupplierByIdOrSlug(idOrSlug, dbQuery)
  const checkout = await loadCheckoutProducts(scope, input.items, dbQuery)
  const config = await getSupplierPublicSalesConfig(checkout.supplierId, dbQuery)
  if (!config.enabled || !config.publicCatalogEnabled) {
    throw new ForbiddenError('Public ordering is disabled for this supplier')
  }
  if (!config.paymentMethods.includes(input.paymentMethod)) {
    throw new ValidationError('Selected payment method is unavailable')
  }
  if (input.fulfillmentMethod === 'DELIVERY' && input.paymentMethod === 'CASH_ON_PICKUP') {
    throw new ValidationError('Cash on pickup requires pickup fulfillment')
  }
  if (input.fulfillmentMethod === 'PICKUP' && input.paymentMethod === 'CASH_ON_DELIVERY') {
    throw new ValidationError('Cash on delivery requires delivery fulfillment')
  }

  const fulfillment = await loadFulfillmentCandidates(
    { query: dbQuery },
    checkout.supplierId,
    config,
    checkout.items,
    input,
    lockStock
  )
  const subtotal = money(checkout.items.reduce((sum, item) => sum + item.lineTotal, 0))
  const minimum = Math.max(
    Number(checkout.supplier.minimum_order_amount || 0),
    Number(fulfillment.zone?.min_order_amount || 0)
  )
  assertSupplierMinimumOrderAmount({
    subtotal,
    minimumOrderAmount: minimum,
    supplierName: checkout.supplier.supplier_name,
  })
  const deliveryFee = fulfillment.deliveryFee
  return {
    supplierId: checkout.supplierId,
    supplierOrganizationId: checkout.supplier.organization_id || null,
    supplierName: checkout.supplier.supplier_name,
    warehouse: fulfillment.warehouse,
    deliveryZoneId: fulfillment.zone?.id || null,
    bankTransferInstructions:
      input.paymentMethod === 'BANK_TRANSFER' ? config.bankTransferInstructions : null,
    items: checkout.items,
    subtotal,
    deliveryFee,
    total: money(subtotal + deliveryFee),
    currency: checkout.currency,
    fulfillmentMethod: input.fulfillmentMethod,
    deliveryAddress: input.fulfillmentMethod === 'DELIVERY' ? input.deliveryAddress : null,
    pickupLocation:
      input.fulfillmentMethod === 'PICKUP'
        ? {
            id: fulfillment.warehouse.id,
            name: fulfillment.warehouse.name,
            address: fulfillment.warehouse.address,
          }
        : null,
    paymentMethod: input.paymentMethod,
  }
}

export async function createPublicOrder({ idOrSlug, input, actor, idempotencyKey }) {
  const requestHash = hashOrderPlacementPayload(input)
  const supplierId = await resolvePublicOrderSupplierId(idOrSlug, input.items, query)
  const actorScope = actor?.role === 'CONSUMER' ? `CONSUMER:${actor.id}` : `PUBLIC:${supplierId}`
  let rawTrackingToken = null
  let replay = false
  const result = await withTransaction(async (client) => {
    const claim = await claimOrderPlacementKey(client, {
      actorScope,
      key: idempotencyKey,
      requestHash,
    })
    if (claim.replay) {
      replay = true
      return claim.replay
    }

    const preview = await previewPublicOrder(idOrSlug, input, client.query.bind(client), {
      lockStock: true,
    })
    const customerType = actor?.role === 'CONSUMER' ? 'CONSUMER' : 'GUEST'
    const customer = {
      name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email || actor?.email || null,
      whatsappConsent: input.customer.whatsappConsent === true,
    }
    const deliverySnapshot =
      preview.fulfillmentMethod === 'DELIVERY'
        ? { ...preview.deliveryAddress, deliveryNotes: input.deliveryNotes || null }
        : {
            pickupWarehouseId: preview.warehouse.id,
            name: preview.warehouse.name,
            address: preview.warehouse.address,
          }
    const { rows: orders } = await client.query(
      `INSERT INTO customer_order (
         restaurant_id, customer_type, consumer_user_id, customer_contact_snapshot,
         supplier_organization_id, delivery_location_snapshot, requested_delivery_method,
         checkout_payment_method, subtotal_amount, delivery_fee, total_amount,
         currency, status, notes, placed_at
       ) VALUES (
         NULL, $1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8, $9, $10,
         $11, 'PLACED', $12, now()
       ) RETURNING *`,
      [
        customerType,
        customerType === 'CONSUMER' ? actor.id : null,
        JSON.stringify(customer),
        preview.supplierOrganizationId,
        JSON.stringify(deliverySnapshot),
        preview.fulfillmentMethod,
        preview.paymentMethod,
        preview.subtotal,
        preview.deliveryFee,
        preview.total,
        preview.currency,
        input.deliveryNotes || null,
      ]
    )
    const order = orders[0]
    const orderItems = await insertOrderItemsBatch(
      client,
      order.id,
      preview.supplierId,
      preview.items
    )
    await reserveWarehouseStockBatch(
      client,
      preview.warehouse.id,
      preview.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      { supplierId: preview.supplierId }
    )
    await client.query(
      `INSERT INTO order_warehouse_assignment
         (order_id, order_item_id, warehouse_id, assigned_by, assignment_source, assignment_reason)
       VALUES ($1, NULL, $2, 'auto', 'automatic', $3::jsonb)`,
      [
        order.id,
        preview.warehouse.id,
        JSON.stringify({
          type: 'public_checkout',
          fulfillmentMethod: preview.fulfillmentMethod,
          deliveryZoneId: preview.deliveryZoneId,
          supplierTenantId: preview.supplierId,
        }),
      ]
    )

    if (customerType === 'GUEST') {
      rawTrackingToken = crypto.randomBytes(32).toString('base64url')
      await client.query(
        `INSERT INTO customer_order_public_access (order_id, token_hash) VALUES ($1, $2)`,
        [order.id, tokenHash(rawTrackingToken)]
      )
    }
    const response = {
      order: publicOrderProjection(order, orderItems),
      supplierName: preview.supplierName,
      bankTransferInstructions: preview.bankTransferInstructions,
    }
    await completeOrderPlacementKey(client, claim, response)
    return response
  })
  return { ...result, trackingToken: replay ? null : rawTrackingToken, replay }
}

export async function getGuestPublicOrder(trackingToken, dbQuery = query) {
  const { rows } = await dbQuery(
    `SELECT o.*, s.name AS supplier_name
     FROM customer_order_public_access access
     JOIN customer_order o ON o.id = access.order_id AND o.customer_type = 'GUEST'
     JOIN order_item first_item ON first_item.order_id = o.id
     JOIN supplier s ON s.id = first_item.supplier_id
     WHERE access.token_hash = $1 AND access.revoked_at IS NULL
     LIMIT 1`,
    [tokenHash(trackingToken)]
  )
  if (!rows.length) throw new NotFoundError('Order not found')
  const order = rows[0]
  const { rows: items } = await dbQuery(
    `SELECT oi.*, p.name AS product_name, p.sku
     FROM order_item oi JOIN product p ON p.id = oi.product_id
     WHERE oi.order_id = $1 ORDER BY oi.id`,
    [order.id]
  )
  return { ...publicOrderProjection(order, items), supplierName: order.supplier_name }
}

export async function listConsumerPublicOrders(consumerUserId, dbQuery = query) {
  const { rows } = await dbQuery(
    `SELECT o.*, s.name AS supplier_name
     FROM customer_order o
     JOIN LATERAL (
       SELECT oi.supplier_id FROM order_item oi WHERE oi.order_id = o.id LIMIT 1
     ) first_item ON true
     JOIN supplier s ON s.id = first_item.supplier_id
     WHERE o.customer_type = 'CONSUMER' AND o.consumer_user_id = $1
     ORDER BY o.created_at DESC LIMIT 100`,
    [consumerUserId]
  )
  return rows.map((row) => ({ ...publicOrderProjection(row), supplierName: row.supplier_name }))
}

export async function getConsumerPublicOrder(consumerUserId, orderId, dbQuery = query) {
  const { rows } = await dbQuery(
    `SELECT * FROM customer_order
     WHERE id = $1 AND customer_type = 'CONSUMER' AND consumer_user_id = $2`,
    [orderId, consumerUserId]
  )
  if (!rows.length) throw new NotFoundError('Order not found')
  const { rows: items } = await dbQuery(
    `SELECT oi.*, p.name AS product_name, p.sku
     FROM order_item oi JOIN product p ON p.id = oi.product_id
     WHERE oi.order_id = $1 ORDER BY oi.id`,
    [orderId]
  )
  return publicOrderProjection(rows[0], items)
}

export async function buildConsumerReorder(consumerUserId, orderId, dbQuery = query) {
  const order = await getConsumerPublicOrder(consumerUserId, orderId, dbQuery)
  const productIds = order.items.map((item) => item.productId)
  const { rows } = await dbQuery(
    `SELECT p.id, p.name, p.sku, p.category, p.unit, p.image_url, p.description,
            p.supplier_id, s.slug AS supplier_slug, s.public_catalog_enabled,
            COALESCE(pis.moq, 1) AS moq,
            COALESCE(pis.order_multiple, 1) AS order_multiple,
            COALESCE(c.enabled, false) AS public_sales_enabled,
            EXISTS (
              SELECT 1
              FROM warehouse_inventory wi
              JOIN warehouse w ON w.id = wi.warehouse_id
              WHERE wi.product_id = p.id
                AND w.supplier_id = p.supplier_id
                AND w.is_active = true
                AND wi.quantity_available >= (
                  SELECT oi.quantity FROM order_item oi
                  WHERE oi.order_id = $2 AND oi.product_id = p.id
                  LIMIT 1
                )
                AND (
                  w.id = c.pickup_warehouse_id
                  OR EXISTS (
                    SELECT 1 FROM supplier_public_delivery_warehouse pdw
                    WHERE pdw.supplier_id = p.supplier_id AND pdw.warehouse_id = w.id
                  )
                )
            ) AS has_public_stock
     FROM product p
     JOIN supplier s ON s.id = p.supplier_id
     LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
     LEFT JOIN supplier_public_sales_config c ON c.supplier_id = p.supplier_id
     WHERE p.id = ANY($1::uuid[])`,
    [productIds, orderId]
  )
  const byId = new Map(rows.map((row) => [row.id, row]))
  const prices = await getDefaultCatalogPricesBatch(productIds, dbQuery)
  const supplierLocationId = order.items[0]?.supplierId || null
  const supplierRow = rows.find((row) => row.supplier_id === supplierLocationId)
  return {
    orderId,
    storefrontId: supplierRow?.supplier_slug || supplierLocationId,
    supplierLocationId,
    items: order.items.map((item) => ({
      ...(() => {
        const row = byId.get(item.productId)
        const price = prices.get(item.productId)
        const quantity = Number(item.quantity)
        const moq = Math.max(1, Number(row?.moq) || 1)
        const orderMultiple = Math.max(1, Number(row?.order_multiple) || 1)
        const scaledQuantity = Math.round(quantity * 1000)
        const quantityValid =
          scaledQuantity >= Math.round(moq * 1000) &&
          (orderMultiple <= 1 || scaledQuantity % Math.round(orderMultiple * 1000) === 0)
        let unavailableReason = null
        if (!row) unavailableReason = 'Product is no longer available'
        else if (!row.public_catalog_enabled || !row.public_sales_enabled) {
          unavailableReason = 'Public sales is unavailable'
        } else if (!price) unavailableReason = 'Public catalog price is unavailable'
        else if (!quantityValid) unavailableReason = 'Current quantity rules have changed'
        else if (!row.has_public_stock) unavailableReason = 'Insufficient public stock'
        return {
          productId: item.productId,
          name: item.name,
          quantity,
          available: unavailableReason == null,
          unavailableReason,
          product: row
            ? {
                id: row.id,
                supplierId: row.supplier_id,
                name: row.name,
                sku: row.sku,
                category: row.category,
                unit: row.unit,
                imageUrl: row.image_url,
                description: row.description,
                currentPrice: price ? Number(price.amount) : null,
                currency: price?.currency || 'USD',
                inStock: row.has_public_stock === true,
                orderable: unavailableReason == null,
                moq,
                orderMultiple,
              }
            : null,
        }
      })(),
    })),
  }
}
