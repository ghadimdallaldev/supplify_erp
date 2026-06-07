/**
 * Pure routing logic + transactional assignment helpers for warehouse fulfillment.
 */
import { reserveWarehouseStock, reserveWarehouseStockBatch } from './warehouseInventory.js'

const RULE_PRIORITY = {
  product: 1,
  category: 2,
  zone: 3,
  stock_available: 4,
  default: 5,
}

/**
 * Pick warehouse for one line item using routing rules (pure, no side effects).
 * @returns {{ warehouseId: string, ruleType: string, ruleId?: string }}
 */
export function resolveWarehouseForItem(item, context) {
  const {
    rules = [],
    warehouses = [],
    warehouseStock = new Map(),
    restaurantInZoneByWarehouse = new Map(),
    defaultWarehouseId = null,
  } = context

  const productId = item.product_id ?? item.productId
  const categoryId = item.category_id ?? item.categoryId
  const quantity = Number(item.quantity ?? 0)

  const activeRules = [...rules]
    .filter((r) => r.is_active !== false)
    .sort((a, b) => {
      const pa = RULE_PRIORITY[a.rule_type] ?? 99
      const pb = RULE_PRIORITY[b.rule_type] ?? 99
      if (pa !== pb) return pa - pb
      return (a.priority ?? 1) - (b.priority ?? 1)
    })

  for (const rule of activeRules) {
    if (rule.rule_type === 'product' && rule.product_id === productId) {
      return { warehouseId: rule.warehouse_id, ruleType: 'product', ruleId: rule.id }
    }
  }

  for (const rule of activeRules) {
    if (rule.rule_type === 'category' && rule.category_id && rule.category_id === categoryId) {
      return { warehouseId: rule.warehouse_id, ruleType: 'category', ruleId: rule.id }
    }
  }

  for (const rule of activeRules) {
    if (rule.rule_type === 'zone' && rule.zone_id) {
      const whForZone = rule.warehouse_id
      if (restaurantInZoneByWarehouse.get(whForZone)) {
        return { warehouseId: whForZone, ruleType: 'zone', ruleId: rule.id }
      }
    }
  }

  const stockRules = activeRules.filter((r) => r.rule_type === 'stock_available')
  for (const rule of stockRules) {
    const stock = warehouseStock.get(`${rule.warehouse_id}:${productId}`)
    if (stock != null && Number(stock.quantity_available) >= quantity) {
      return { warehouseId: rule.warehouse_id, ruleType: 'stock_available', ruleId: rule.id }
    }
  }

  for (const rule of activeRules) {
    if (rule.rule_type === 'default') {
      return { warehouseId: rule.warehouse_id, ruleType: 'default', ruleId: rule.id }
    }
  }

  if (defaultWarehouseId) {
    return { warehouseId: defaultWarehouseId, ruleType: 'default' }
  }

  const firstActive = warehouses.find((w) => w.is_active !== false)
  if (firstActive) {
    return { warehouseId: firstActive.id, ruleType: 'fallback' }
  }

  throw new Error('No active warehouse available for fulfillment')
}

/**
 * Preview routing for items without DB writes.
 */
export function simulateWarehouseRouting(items, context) {
  return items.map((item) => {
    const resolution = resolveWarehouseForItem(item, context)
    return {
      productId: item.product_id ?? item.productId,
      quantity: item.quantity,
      warehouseId: resolution.warehouseId,
      reason: resolution.ruleType,
      ruleId: resolution.ruleId ?? null,
    }
  })
}

async function loadRoutingContext(client, supplier, order, orderItems) {
  const supplierId = supplier.id
  const { getWarehouseSupplierColumn } = await import('../lib/warehouse-helpers.js')
  const supplierCol = await getWarehouseSupplierColumn((sql, params) => client.query(sql, params))

  const { rows: warehouses } = await client.query(
    `SELECT * FROM warehouse WHERE ${supplierCol} = $1 AND is_active = TRUE ORDER BY created_at`,
    [supplierId]
  )

  const { rows: rules } = await client.query(
    `SELECT * FROM warehouse_routing_rule WHERE supplier_id = $1 AND is_active = TRUE ORDER BY priority ASC, created_at ASC`,
    [supplierId]
  )

  const productIds = orderItems.map((i) => i.product_id)
  const { rows: products } = productIds.length
    ? await client.query(`SELECT id, category_id FROM product WHERE id = ANY($1)`, [productIds])
    : { rows: [] }
  const categoryByProduct = new Map(products.map((p) => [p.id, p.category_id]))

  const enrichedItems = orderItems.map((item) => ({
    ...item,
    category_id: categoryByProduct.get(item.product_id) ?? null,
  }))

  const { rows: stockRows } = productIds.length
    ? await client.query(
        `SELECT warehouse_id, product_id, quantity_available
         FROM warehouse_inventory
         WHERE product_id = ANY($1)`,
        [productIds]
      )
    : { rows: [] }

  const warehouseStock = new Map(stockRows.map((r) => [`${r.warehouse_id}:${r.product_id}`, r]))

  let restaurantInZoneByWarehouse = new Map()
  if (order.restaurant_id) {
    const { rows: restaurantRows } = await client.query(
      `SELECT address_json FROM restaurant WHERE id = $1`,
      [order.restaurant_id]
    )
    const address = restaurantRows[0]?.address_json
    const postalCode = address?.postalCode ?? address?.zip ?? null

    const { rows: zones } = await client.query(
      `SELECT dz.id, dz.warehouse_id, dz.zone_type, dz.postal_codes, dz.geometry, dz.coverage_area_json
       FROM delivery_zone dz
       JOIN warehouse w ON w.id = dz.warehouse_id
       WHERE w.${supplierCol} = $1 AND dz.is_active = TRUE AND dz.warehouse_id IS NOT NULL`,
      [supplierId]
    )

    for (const wh of warehouses) {
      const whZones = zones.filter((z) => z.warehouse_id === wh.id)
      const inZone = whZones.some((z) => {
        if (z.zone_type === 'postal_codes' && postalCode && z.postal_codes?.length) {
          return z.postal_codes.includes(postalCode)
        }
        return Boolean(z.coverage_area_json || z.geometry)
      })
      restaurantInZoneByWarehouse.set(wh.id, inZone)
    }
  }

  const defaultWarehouse =
    supplier.default_warehouse_id ??
    warehouses.find((w) => w.is_default || w.is_main)?.id ??
    warehouses[0]?.id ??
    null

  return {
    warehouses,
    rules,
    enrichedItems,
    warehouseStock,
    restaurantInZoneByWarehouse,
    defaultWarehouseId: defaultWarehouse,
  }
}

async function insertAssignment(
  client,
  { orderId, orderItemId, warehouseId, assignedBy = 'auto' }
) {
  const { rows } = await client.query(
    `INSERT INTO order_warehouse_assignment (order_id, order_item_id, warehouse_id, assigned_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [orderId, orderItemId ?? null, warehouseId, assignedBy]
  )
  return rows[0]
}

/**
 * Assign warehouses to an order within an existing transaction.
 */
export async function assignWarehousesToOrder(
  client,
  { order, orderItems, supplier, multiWarehouseActive }
) {
  const { getWarehouseSupplierColumn, isDefaultWarehouse } = await import(
    '../lib/warehouse-helpers.js'
  )

  const useMulti =
    multiWarehouseActive &&
    supplier.fulfillment_mode === 'multi' &&
    supplier.multi_warehouse_enabled

  if (!useMulti && supplier.default_warehouse_id) {
    const warehouseId = supplier.default_warehouse_id
    const assignment = await insertAssignment(client, {
      orderId: order.id,
      orderItemId: null,
      warehouseId,
    })
    await reserveWarehouseStockBatch(
      client,
      warehouseId,
      orderItems.map((item) => ({ productId: item.product_id, quantity: item.quantity }))
    )
    return { mode: 'single', warehouseId, assignments: [assignment] }
  }

  const supplierCol = await getWarehouseSupplierColumn((sql, params) => client.query(sql, params))

  const { rows: warehouses } = await client.query(
    `SELECT id, is_default, is_main, is_active FROM warehouse WHERE ${supplierCol} = $1 AND is_active = TRUE ORDER BY created_at`,
    [supplier.id]
  )

  const defaultWarehouseId =
    supplier.default_warehouse_id ??
    warehouses.find((w) => isDefaultWarehouse(w))?.id ??
    warehouses[0]?.id

  if (!defaultWarehouseId && warehouses.length === 0) {
    return { mode: 'none', assignments: [] }
  }

  if (!useMulti) {
    const warehouseId = defaultWarehouseId
    if (!warehouseId) {
      throw new Error('No default warehouse configured for supplier')
    }
    const assignment = await insertAssignment(client, {
      orderId: order.id,
      orderItemId: null,
      warehouseId,
    })
    await reserveWarehouseStockBatch(
      client,
      warehouseId,
      orderItems.map((item) => ({ productId: item.product_id, quantity: item.quantity }))
    )
    return { mode: 'single', warehouseId, assignments: [assignment] }
  }

  const ctx = await loadRoutingContext(client, supplier, order, orderItems)
  const assignments = []

  for (const item of ctx.enrichedItems) {
    const resolution = resolveWarehouseForItem(item, {
      rules: ctx.rules,
      warehouses: ctx.warehouses,
      warehouseStock: ctx.warehouseStock,
      restaurantInZoneByWarehouse: ctx.restaurantInZoneByWarehouse,
      defaultWarehouseId: ctx.defaultWarehouseId,
    })

    await reserveWarehouseStock(
      client,
      resolution.warehouseId,
      item.product_id,
      Number(item.quantity)
    )

    const assignment = await insertAssignment(client, {
      orderId: order.id,
      orderItemId: item.id,
      warehouseId: resolution.warehouseId,
    })
    assignments.push({ ...assignment, ruleType: resolution.ruleType })
  }

  return { mode: 'multi', assignments }
}

/**
 * Build simulation context from caller-supplied data (for API simulate endpoint).
 */
export function buildSimulationFromPayload({
  items,
  rules,
  warehouses,
  warehouseStock,
  zones,
  restaurantPostalCode,
}) {
  const warehouseStockMap = new Map(
    (warehouseStock || []).map((r) => [`${r.warehouse_id}:${r.product_id}`, r])
  )
  const restaurantInZoneByWarehouse = new Map()
  for (const wh of warehouses || []) {
    const whZones = (zones || []).filter((z) => z.warehouse_id === wh.id)
    const inZone = whZones.some((z) => {
      if (z.zone_type === 'postal_codes' && restaurantPostalCode && z.postal_codes?.length) {
        return z.postal_codes.includes(restaurantPostalCode)
      }
      return Boolean(z.coverage_area_json || z.geometry)
    })
    restaurantInZoneByWarehouse.set(wh.id, inZone)
  }

  const defaultWarehouseId =
    warehouses?.find((w) => w.is_default || w.is_main)?.id ?? warehouses?.[0]?.id ?? null

  return simulateWarehouseRouting(items, {
    rules,
    warehouses,
    warehouseStock: warehouseStockMap,
    restaurantInZoneByWarehouse,
    defaultWarehouseId,
  })
}
