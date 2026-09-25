/**
 * Pure routing logic + transactional assignment helpers for warehouse fulfillment.
 */
import { reserveWarehouseStock, reserveWarehouseStockBatch } from './warehouseInventory.js'
import { haversineDistanceKm } from './delivery-eta.service.js'
import { postalCodeMatches } from '../lib/postal-code-match.js'

const RULE_PRIORITY = {
  product: 1,
  category: 2,
  zone: 3,
  stock_available: 4,
  default: 5,
}

function extractLatLng(address) {
  if (!address || typeof address !== 'object') return null
  const lat = Number(
    address.lat ??
      address.latitude ??
      address.deliveryLatitude ??
      address.delivery_latitude ??
      address.Lat ??
      address.coords?.lat ??
      address.location?.lat
  )
  const lng = Number(
    address.lng ??
      address.lon ??
      address.longitude ??
      address.deliveryLongitude ??
      address.delivery_longitude ??
      address.Lng ??
      address.coords?.lng ??
      address.location?.lng
  )
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function pointInRing(lat, lng, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygonRings(lat, lng, rings) {
  if (!Array.isArray(rings?.[0]) || !pointInRing(lat, lng, rings[0])) return false
  for (let i = 1; i < rings.length; i++) {
    if (Array.isArray(rings[i]) && pointInRing(lat, lng, rings[i])) return false
  }
  return true
}

function pointInGeoJson(lat, lng, geo) {
  if (!geo || typeof geo !== 'object') return false
  const type = geo.type
  const coords = geo.coordinates
  if (type === 'Polygon' && Array.isArray(coords?.[0])) {
    return pointInPolygonRings(lat, lng, coords)
  }
  if (type === 'MultiPolygon' && Array.isArray(coords)) {
    return coords.some((poly) => Array.isArray(poly) && pointInPolygonRings(lat, lng, poly))
  }
  if (Array.isArray(geo.rings?.[0])) {
    return pointInPolygonRings(lat, lng, geo.rings)
  }
  if (Array.isArray(geo.coordinates?.[0]) && typeof geo.coordinates[0][0] === 'number') {
    return pointInRing(lat, lng, geo.coordinates)
  }
  return false
}

/**
 * Whether a restaurant address falls inside a delivery zone.
 * Fail-closed: unknown/incomplete geo data does not count as a match.
 */
function postalCodesOf(zone) {
  const raw = zone?.postal_codes
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map((code) => code.trim())
  }
  return []
}

export function restaurantMatchesZone(zone, address) {
  if (!zone) return false
  const postalCode = address?.postalCode ?? address?.zip ?? address?.postal_code ?? null

  if (zone.zone_type === 'postal_codes') {
    const codes = postalCodesOf(zone)
    if (!postalCode || !codes.length) return false
    return codes.some((code) => postalCodeMatches(code, postalCode))
  }

  if (zone.zone_type === 'radius') {
    const point = extractLatLng(address)
    const centerLat = Number(zone.center_lat)
    const centerLng = Number(zone.center_lng)
    const radiusKm = Number(zone.radius_km)
    if (
      !point ||
      !Number.isFinite(centerLat) ||
      !Number.isFinite(centerLng) ||
      !Number.isFinite(radiusKm)
    ) {
      return false
    }
    return haversineDistanceKm(point.lat, point.lng, centerLat, centerLng) <= radiusKm
  }

  const point = extractLatLng(address)
  if (!point) return false

  const coverage =
    typeof zone.coverage_area_json === 'string'
      ? (() => {
          try {
            return JSON.parse(zone.coverage_area_json)
          } catch {
            return null
          }
        })()
      : zone.coverage_area_json
  const geometry =
    typeof zone.geometry === 'string'
      ? (() => {
          try {
            return JSON.parse(zone.geometry)
          } catch {
            return null
          }
        })()
      : zone.geometry

  return (
    pointInGeoJson(point.lat, point.lng, coverage) || pointInGeoJson(point.lat, point.lng, geometry)
  )
}

function destinationHasRoutingSignal(address) {
  if (!address || typeof address !== 'object') return false
  const postal = address.postalCode ?? address.postal_code ?? address.zip
  if (postal != null && String(postal).trim()) return true
  return Boolean(extractLatLng(address))
}

/** Order snapshot, then branch, then restaurant — the same destination warehouse routing uses. */
export async function resolveRoutingDestination(client, order) {
  let destinationAddress = order?.delivery_location_snapshot || null
  if (typeof destinationAddress === 'string') {
    try {
      destinationAddress = JSON.parse(destinationAddress)
    } catch {
      destinationAddress = null
    }
  }
  if (destinationAddress?.address && typeof destinationAddress.address === 'object') {
    destinationAddress = { ...destinationAddress, ...destinationAddress.address }
  }
  if (destinationHasRoutingSignal(destinationAddress)) return destinationAddress

  if (order?.branch_id && order?.restaurant_id) {
    const { rows } = await client.query(
      `SELECT name, address, delivery_latitude AS latitude, delivery_longitude AS longitude,
              delivery_location_label AS label
       FROM branch WHERE id = $1 AND tenant_id = $2 AND COALESCE(is_active, TRUE) = TRUE`,
      [order.branch_id, order.restaurant_id]
    )
    const branch = rows[0] ? { ...rows[0], ...(rows[0].address || {}) } : null
    if (destinationHasRoutingSignal(branch)) return branch
  }

  if (order?.restaurant_id) {
    const { rows } = await client.query(
      `SELECT address_json, delivery_latitude AS latitude, delivery_longitude AS longitude,
              delivery_location_label AS label
       FROM restaurant WHERE id = $1`,
      [order.restaurant_id]
    )
    const restaurant = rows[0] ? { ...rows[0], ...(rows[0].address_json || {}) } : null
    if (destinationHasRoutingSignal(restaurant)) return restaurant
  }

  return destinationAddress
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
    restaurantZoneIds = null,
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
      if (
        !warehouses.length ||
        warehouses.some((w) => w.id === rule.warehouse_id && w.is_active !== false)
      ) {
        return { warehouseId: rule.warehouse_id, ruleType: 'product', ruleId: rule.id }
      }
    }
  }

  for (const rule of activeRules) {
    if (rule.rule_type === 'category' && rule.category_id && rule.category_id === categoryId) {
      if (
        !warehouses.length ||
        warehouses.some((w) => w.id === rule.warehouse_id && w.is_active !== false)
      ) {
        return { warehouseId: rule.warehouse_id, ruleType: 'category', ruleId: rule.id }
      }
    }
  }

  for (const rule of activeRules) {
    if (rule.rule_type === 'zone' && rule.zone_id) {
      const whForZone = rule.warehouse_id
      const inRuleZone = restaurantZoneIds
        ? restaurantZoneIds.has(rule.zone_id)
        : restaurantInZoneByWarehouse.get(whForZone)
      if (
        inRuleZone &&
        (!warehouses.length || warehouses.some((w) => w.id === whForZone && w.is_active !== false))
      ) {
        return { warehouseId: whForZone, ruleType: 'zone', ruleId: rule.id }
      }
    }
  }

  const stockRules = activeRules.filter((r) => r.rule_type === 'stock_available')
  for (const rule of stockRules) {
    if (
      warehouses.length &&
      !warehouses.some((w) => w.id === rule.warehouse_id && w.is_active !== false)
    ) {
      continue
    }
    const stock = warehouseStock.get(`${rule.warehouse_id}:${productId}`)
    if (stock != null && Number(stock.quantity_available) >= quantity) {
      return { warehouseId: rule.warehouse_id, ruleType: 'stock_available', ruleId: rule.id }
    }
  }

  for (const rule of activeRules) {
    if (rule.rule_type === 'default') {
      if (
        !warehouses.length ||
        warehouses.some((w) => w.id === rule.warehouse_id && w.is_active !== false)
      ) {
        return { warehouseId: rule.warehouse_id, ruleType: 'default', ruleId: rule.id }
      }
    }
  }

  if (defaultWarehouseId) {
    if (
      !warehouses.length ||
      warehouses.some((w) => w.id === defaultWarehouseId && w.is_active !== false)
    ) {
      return { warehouseId: defaultWarehouseId, ruleType: 'default' }
    }
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
    ? await client.query(
        `SELECT id, category_id FROM product WHERE id = ANY($1) AND supplier_id = $2`,
        [productIds, supplierId]
      )
    : { rows: [] }
  const categoryByProduct = new Map(products.map((p) => [p.id, p.category_id]))

  const enrichedItems = orderItems.map((item) => ({
    ...item,
    category_id: categoryByProduct.get(item.product_id) ?? null,
  }))

  const { rows: stockRows } = productIds.length
    ? await client.query(
        `SELECT wi.warehouse_id, wi.product_id, wi.quantity_available
         FROM warehouse_inventory wi
         JOIN warehouse w ON w.id = wi.warehouse_id
         WHERE wi.product_id = ANY($1) AND w.${supplierCol} = $2 AND w.is_active = TRUE
         ORDER BY wi.warehouse_id, wi.product_id
         FOR UPDATE OF wi`,
        [productIds, supplierId]
      )
    : { rows: [] }

  const warehouseStock = new Map(stockRows.map((r) => [`${r.warehouse_id}:${r.product_id}`, r]))

  let restaurantInZoneByWarehouse = new Map()
  const restaurantZoneIds = new Set()
  if (order.restaurant_id) {
    const { rows: restaurantRows } = await client.query(
      `SELECT address_json FROM restaurant WHERE id = $1`,
      [order.restaurant_id]
    )
    const address = restaurantRows[0]?.address_json

    const { rows: zones } = await client.query(
      `SELECT dz.id, dz.warehouse_id, dz.zone_type, dz.postal_codes, dz.geometry, dz.coverage_area_json,
              dz.radius_km, dz.center_lat, dz.center_lng
       FROM delivery_zone dz
       JOIN warehouse w ON w.id = dz.warehouse_id
       WHERE w.${supplierCol} = $1 AND dz.is_active = TRUE AND dz.warehouse_id IS NOT NULL`,
      [supplierId]
    )

    for (const wh of warehouses) {
      const whZones = zones.filter((z) => z.warehouse_id === wh.id)
      const inZone = whZones.some((z) => restaurantMatchesZone(z, address))
      restaurantInZoneByWarehouse.set(wh.id, inZone)
    }
    for (const zone of zones) {
      if (restaurantMatchesZone(zone, address)) restaurantZoneIds.add(zone.id)
    }
  }

  const activeIds = new Set(warehouses.map((w) => w.id))
  const defaultWarehouse =
    (supplier.default_warehouse_id && activeIds.has(supplier.default_warehouse_id)
      ? supplier.default_warehouse_id
      : null) ??
    warehouses.find((w) => w.is_default || w.is_main)?.id ??
    warehouses[0]?.id ??
    null

  return {
    warehouses,
    rules,
    enrichedItems,
    warehouseStock,
    restaurantInZoneByWarehouse,
    restaurantZoneIds,
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
async function assignWarehousesToOrderLegacy(
  client,
  { order, orderItems, supplier, multiWarehouseActive }
) {
  const { getWarehouseSupplierColumn, isDefaultWarehouse } = await import(
    '../lib/warehouse-helpers.js'
  )
  const supplierCol = await getWarehouseSupplierColumn((sql, params) => client.query(sql, params))

  const useMulti =
    multiWarehouseActive &&
    supplier.fulfillment_mode === 'multi' &&
    supplier.multi_warehouse_enabled

  if (!useMulti && supplier.default_warehouse_id) {
    const { rows: activeDefault } = await client.query(
      `SELECT id FROM warehouse WHERE id = $1 AND ${supplierCol} = $2 AND is_active = TRUE`,
      [supplier.default_warehouse_id, supplier.id]
    )
    if (activeDefault.length) {
      const warehouseId = activeDefault[0].id
      const assignment = await insertAssignment(client, {
        orderId: order.id,
        orderItemId: null,
        warehouseId,
      })
      await reserveWarehouseStockBatch(
        client,
        warehouseId,
        orderItems.map((item) => ({ productId: item.product_id, quantity: item.quantity })),
        { supplierId: supplier.id }
      )
      return { mode: 'single', warehouseId, assignments: [assignment] }
    }
  }

  const { rows: warehouses } = await client.query(
    `SELECT id, is_default, is_main, is_active FROM warehouse WHERE ${supplierCol} = $1 AND is_active = TRUE ORDER BY created_at`,
    [supplier.id]
  )

  const activeWarehouseIds = new Set(warehouses.map((w) => w.id))
  const defaultWarehouseId =
    (supplier.default_warehouse_id && activeWarehouseIds.has(supplier.default_warehouse_id)
      ? supplier.default_warehouse_id
      : null) ??
    warehouses.find((w) => isDefaultWarehouse(w))?.id ??
    warehouses[0]?.id

  if (!defaultWarehouseId && warehouses.length === 0) {
    return { mode: 'none', assignments: [] }
  }

  if (!useMulti) {
    const warehouseId = defaultWarehouseId
    if (!warehouseId || !activeWarehouseIds.has(warehouseId)) {
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
      orderItems.map((item) => ({ productId: item.product_id, quantity: item.quantity })),
      { supplierId: supplier.id }
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
      restaurantZoneIds: ctx.restaurantZoneIds,
      defaultWarehouseId: ctx.defaultWarehouseId,
    })

    await reserveWarehouseStock(
      client,
      resolution.warehouseId,
      item.product_id,
      Number(item.quantity),
      { supplierId: supplier.id }
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
  const restaurantZoneIds = new Set()
  const address = { postalCode: restaurantPostalCode, zip: restaurantPostalCode }
  for (const zone of zones || []) {
    if (restaurantMatchesZone(zone, address)) restaurantZoneIds.add(zone.id)
  }
  for (const wh of warehouses || []) {
    const whZones = (zones || []).filter((z) => z.warehouse_id === wh.id)
    const inZone = whZones.some((z) => restaurantMatchesZone(z, address))
    restaurantInZoneByWarehouse.set(wh.id, inZone)
  }

  const defaultWarehouseId =
    warehouses?.find((w) => w.is_default || w.is_main)?.id ?? warehouses?.[0]?.id ?? null

  return simulateWarehouseRouting(items, {
    rules,
    warehouses,
    warehouseStock: warehouseStockMap,
    restaurantInZoneByWarehouse,
    restaurantZoneIds,
    defaultWarehouseId,
  })
}
function ruleMatchesCandidate(item, warehouseId, rules) {
  const productRules = rules.filter(
    (rule) =>
      rule.rule_type === 'product' && rule.product_id === (item.product_id ?? item.productId)
  )
  if (productRules.length && !productRules.some((rule) => rule.warehouse_id === warehouseId)) {
    return false
  }

  const categoryRules = rules.filter(
    (rule) => rule.rule_type === 'category' && rule.category_id === item.category_id
  )
  if (
    !productRules.length &&
    categoryRules.length &&
    !categoryRules.some((rule) => rule.warehouse_id === warehouseId)
  ) {
    return false
  }

  return true
}

function candidateRuleRank(items, warehouseId, rules, zoneEligible, matchedZoneIds = null) {
  const matching = []
  for (const item of items) {
    const productRule = rules.find(
      (rule) =>
        rule.rule_type === 'product' &&
        rule.product_id === (item.product_id ?? item.productId) &&
        rule.warehouse_id === warehouseId
    )
    const categoryRule = rules.find(
      (rule) =>
        rule.rule_type === 'category' &&
        rule.category_id === item.category_id &&
        rule.warehouse_id === warehouseId
    )
    if (productRule) matching.push([1, Number(productRule.priority ?? 1)])
    else if (categoryRule) matching.push([2, Number(categoryRule.priority ?? 1)])
  }
  if (zoneEligible) {
    const zoneRule = rules.find(
      (rule) =>
        rule.rule_type === 'zone' &&
        rule.warehouse_id === warehouseId &&
        (matchedZoneIds ? matchedZoneIds.has(rule.zone_id) : true)
    )
    if (zoneRule) matching.push([3, Number(zoneRule.priority ?? 1)])
  }
  const defaultRule = rules.find(
    (rule) => rule.rule_type === 'default' && rule.warehouse_id === warehouseId
  )
  if (defaultRule) matching.push([5, Number(defaultRule.priority ?? 1)])
  if (!matching.length) return [4, Number.MAX_SAFE_INTEGER]
  matching.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return matching[0]
}

/**
 * Resolve one warehouse for the complete order. The context is deliberately
 * supplier-tenant scoped: organization membership alone never permits a
 * sibling tenant's warehouse to fulfill another tenant's product.
 */
export function resolveSingleWarehouseForOrder(items, context) {
  const warehouses = (context.warehouses || []).filter((warehouse) => warehouse.is_active !== false)
  const activeWarehouseIds = new Set(warehouses.map((warehouse) => warehouse.id))
  const rules = (context.rules || []).filter((rule) => {
    if (rule.is_active === false) return false
    if (!activeWarehouseIds.size || !rule.warehouse_id) return true
    return activeWarehouseIds.has(rule.warehouse_id)
  })
  const failures = []
  const eligible = []

  for (const warehouse of warehouses) {
    const warehouseFailures = []
    if (context.zoneEligibleByWarehouse?.get(warehouse.id) === false) {
      warehouseFailures.push({ code: 'OUTSIDE_SERVICE_ZONE' })
    }
    for (const item of items) {
      const productId = item.product_id ?? item.productId
      if (!ruleMatchesCandidate(item, warehouse.id, rules)) {
        warehouseFailures.push({ productId, code: 'CATALOG_OR_ROUTING_RULE_MISMATCH' })
        continue
      }
      const stock = context.warehouseStock?.get(`${warehouse.id}:${productId}`)
      if (!stock || Number(stock.quantity_available) < Number(item.quantity)) {
        warehouseFailures.push({ productId, code: 'INSUFFICIENT_STOCK' })
      }
    }
    if (!warehouseFailures.length) {
      const [ruleRank, rulePriority] = candidateRuleRank(
        items,
        warehouse.id,
        rules,
        context.zoneEligibleByWarehouse?.get(warehouse.id) === true,
        context.restaurantZoneIds
      )
      const isDefault =
        warehouse.id === context.defaultWarehouseId ||
        Boolean(warehouse.is_default ?? warehouse.is_main)
      const warehousePoint = extractLatLng(warehouse.address)
      const destinationPoint = extractLatLng(context.destinationAddress)
      const distance =
        warehousePoint && destinationPoint
          ? haversineDistanceKm(
              warehousePoint.lat,
              warehousePoint.lng,
              destinationPoint.lat,
              destinationPoint.lng
            )
          : Number.POSITIVE_INFINITY
      eligible.push({ warehouse, ruleRank, rulePriority, isDefault, distance })
    } else {
      failures.push({ warehouseId: warehouse.id, reasons: warehouseFailures })
    }
  }

  if (!eligible.length) {
    const error = new Error('No single supplier fulfillment location can fulfill this basket')
    error.code = 'NO_SINGLE_FULFILLMENT_LOCATION'
    error.details = { failures }
    throw error
  }

  eligible.sort(
    (a, b) =>
      a.ruleRank - b.ruleRank ||
      a.rulePriority - b.rulePriority ||
      Number(b.isDefault) - Number(a.isDefault) ||
      a.distance - b.distance ||
      String(a.warehouse.id).localeCompare(String(b.warehouse.id))
  )
  const selected = eligible[0]
  return {
    warehouseId: selected.warehouse.id,
    warehouse: selected.warehouse,
    ruleType:
      selected.ruleRank === 1
        ? 'product'
        : selected.ruleRank === 2
          ? 'category'
          : selected.ruleRank === 3
            ? 'zone'
            : selected.ruleRank === 5
              ? 'default'
              : 'configured_priority',
    distanceKm: Number.isFinite(selected.distance) ? selected.distance : null,
  }
}

async function loadCanonicalRoutingContext(client, supplier, order, orderItems) {
  const supplierId = supplier.id
  const { getWarehouseSupplierColumn } = await import('../lib/warehouse-helpers.js')
  const supplierCol = await getWarehouseSupplierColumn((sql, params) => client.query(sql, params))
  const { rows: warehouses } = await client.query(
    `SELECT * FROM warehouse
     WHERE ${supplierCol} = $1 AND is_active = TRUE
     ORDER BY created_at ASC, id ASC`,
    [supplierId]
  )
  const { rows: rules } = await client.query(
    `SELECT * FROM warehouse_routing_rule
     WHERE supplier_id = $1 AND is_active = TRUE
     ORDER BY priority ASC, created_at ASC, id ASC`,
    [supplierId]
  )
  const productIds = [...new Set(orderItems.map((item) => item.product_id).filter(Boolean))]
  const { rows: products } = productIds.length
    ? await client.query(
        `SELECT id, supplier_id, category_id FROM product WHERE id = ANY($1::uuid[])`,
        [productIds]
      )
    : { rows: [] }
  const productMap = new Map(products.map((product) => [product.id, product]))
  const mismatched = products.filter((product) => product.supplier_id !== supplierId)
  if (mismatched.length || productMap.size !== productIds.length) {
    const error = new Error('Product is not owned by the active supplier tenant')
    error.code = 'SUPPLIER_TENANT_MISMATCH'
    error.details = {
      supplierTenantId: supplierId,
      productIds: mismatched.map((product) => product.id),
    }
    throw error
  }

  const { rows: stockRows } = productIds.length
    ? await client.query(
        `SELECT wi.warehouse_id, wi.product_id, wi.quantity_available
         FROM warehouse_inventory wi
         JOIN warehouse w ON w.id = wi.warehouse_id
         WHERE wi.product_id = ANY($1::uuid[])
           AND w.${supplierCol} = $2 AND w.is_active = TRUE
         ORDER BY wi.warehouse_id, wi.product_id
         FOR UPDATE OF wi`,
        [productIds, supplierId]
      )
    : { rows: [] }
  const warehouseStock = new Map(
    stockRows.map((row) => [`${row.warehouse_id}:${row.product_id}`, row])
  )

  const destinationAddress = await resolveRoutingDestination(client, order)

  const { rows: zones } = await client.query(
    `SELECT dz.id, dz.warehouse_id, dz.zone_type, dz.postal_codes, dz.geometry,
            dz.coverage_area_json, dz.radius_km, dz.center_lat, dz.center_lng
     FROM delivery_zone dz
     JOIN warehouse w ON w.id = dz.warehouse_id
     WHERE w.${supplierCol} = $1 AND dz.is_active = TRUE AND dz.warehouse_id IS NOT NULL`,
    [supplierId]
  )
  const zoneEligibleByWarehouse = new Map()
  const restaurantZoneIds = new Set()
  for (const zone of zones) {
    if (restaurantMatchesZone(zone, destinationAddress)) restaurantZoneIds.add(zone.id)
  }
  for (const warehouse of warehouses) {
    const warehouseZones = zones.filter((zone) => zone.warehouse_id === warehouse.id)
    zoneEligibleByWarehouse.set(
      warehouse.id,
      warehouseZones.length === 0 ||
        warehouseZones.some((zone) => restaurantMatchesZone(zone, destinationAddress))
    )
  }
  const enrichedItems = orderItems.map((item) => ({
    ...item,
    category_id: productMap.get(item.product_id)?.category_id ?? null,
  }))
  const activeIds = new Set(warehouses.map((warehouse) => warehouse.id))
  const defaultWarehouseId =
    (supplier.default_warehouse_id && activeIds.has(supplier.default_warehouse_id)
      ? supplier.default_warehouse_id
      : null) ||
    warehouses.find((warehouse) => warehouse.is_default || warehouse.is_main)?.id ||
    null
  return {
    warehouses,
    rules,
    warehouseStock,
    zoneEligibleByWarehouse,
    restaurantZoneIds,
    destinationAddress,
    defaultWarehouseId,
    enrichedItems,
  }
}

export async function assignWarehousesToOrder(client, { order, orderItems, supplier }) {
  const context = await loadCanonicalRoutingContext(client, supplier, order, orderItems)
  const resolution = resolveSingleWarehouseForOrder(context.enrichedItems, context)
  await reserveWarehouseStockBatch(
    client,
    resolution.warehouseId,
    orderItems.map((item) => ({ productId: item.product_id, quantity: item.quantity })),
    { supplierId: supplier.id }
  )
  const { rows } = await client.query(
    `INSERT INTO order_warehouse_assignment
       (order_id, order_item_id, warehouse_id, assigned_by, assignment_source, assignment_reason)
     VALUES ($1, NULL, $2, 'auto', 'automatic', $3::jsonb)
     RETURNING *`,
    [
      order.id,
      resolution.warehouseId,
      JSON.stringify({
        type: 'automatic_eligibility',
        ruleType: resolution.ruleType,
        supplierTenantId: supplier.id,
        supplierOrganizationId: supplier.organization_id || null,
        distanceKm: resolution.distanceKm,
      }),
    ]
  )
  return {
    mode: 'single',
    warehouseId: resolution.warehouseId,
    supplierTenantId: supplier.id,
    assignments: rows,
    reason: resolution.ruleType,
  }
}
