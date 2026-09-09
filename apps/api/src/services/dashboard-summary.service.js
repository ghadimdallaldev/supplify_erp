import { query } from '../lib/db.js'
import { deliveredOrderStatusInSql } from '../lib/order-statuses.js'
import {
  computeSupplierStockFlags,
  DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD,
} from '../lib/supplier-stock-status.js'
import { supplierUsesWarehouseInventory } from './supplier-stock.service.js'
import { getWarehouseSupplierColumn } from '../lib/warehouse-helpers.js'
import { deleteCache } from '../lib/cache.js'

const RECENT_ORDER_LIMIT = 7
const LOW_STOCK_PREVIEW_LIMIT = 3
const SPEND_TREND_DAYS = 30

export function dashboardSummaryCacheKey(tenantType, tenantId) {
  return `dashboard:summary:v1:${tenantType}:${tenantId}`
}

export async function invalidateDashboardSummaryCache(tenants) {
  const list = Array.isArray(tenants) ? tenants : [tenants]
  await Promise.all(
    list
      .filter((t) => t?.tenantType && t?.tenantId)
      .map((t) => deleteCache(dashboardSummaryCacheKey(t.tenantType, t.tenantId)).catch(() => {}))
  )
}

async function buildSupplierStats(supplierId) {
  const [
    { rows: totalProducts },
    { rows: totalOrders },
    { rows: pendingOrders },
    { rows: completedOrders },
    { rows: totalRevenue },
    { rows: totalRestaurants },
  ] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM product WHERE supplier_id = $1', [supplierId]),
    query('SELECT COUNT(DISTINCT order_id)::int AS count FROM order_item WHERE supplier_id = $1', [
      supplierId,
    ]),
    query(
      `SELECT COUNT(DISTINCT oi.order_id)::int AS count
       FROM order_item oi
       JOIN customer_order o ON o.id = oi.order_id
       WHERE oi.supplier_id = $1 AND o.status IN ('PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')`,
      [supplierId]
    ),
    query(
      `SELECT COUNT(DISTINCT oi.order_id)::int AS count
       FROM order_item oi
       JOIN customer_order o ON o.id = oi.order_id
       WHERE oi.supplier_id = $1 AND ${deliveredOrderStatusInSql('o.status')}`,
      [supplierId]
    ),
    query(
      `SELECT COALESCE(SUM(oi.line_total), 0)::float AS total
       FROM order_item oi
       JOIN customer_order o ON o.id = oi.order_id
       WHERE oi.supplier_id = $1 AND ${deliveredOrderStatusInSql('o.status')}`,
      [supplierId]
    ),
    query(
      `SELECT COUNT(DISTINCT o.restaurant_id)::int AS count
       FROM order_item oi
       JOIN customer_order o ON o.id = oi.order_id
       WHERE oi.supplier_id = $1`,
      [supplierId]
    ),
  ])

  return {
    totalProducts: totalProducts[0]?.count ?? 0,
    totalOrders: totalOrders[0]?.count ?? 0,
    pendingOrders: pendingOrders[0]?.count ?? 0,
    completedOrders: completedOrders[0]?.count ?? 0,
    totalRevenue: parseFloat(totalRevenue[0]?.total ?? 0),
    totalRestaurants: totalRestaurants[0]?.count ?? 0,
  }
}

async function buildRestaurantStats(restaurantId) {
  const [
    { rows: totalProducts },
    { rows: totalOrders },
    { rows: pendingOrders },
    { rows: completedOrders },
    { rows: totalSpent },
    { rows: totalSuppliers },
  ] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count
       FROM product p
       WHERE EXISTS (
         SELECT 1 FROM supplier_follow sf
         WHERE sf.supplier_id = p.supplier_id AND sf.restaurant_id = $1
       )
       AND NOT EXISTS (
         SELECT 1 FROM supplier_blocklist sb
         WHERE sb.supplier_id = p.supplier_id AND sb.restaurant_id = $1
       )`,
      [restaurantId]
    ),
    query('SELECT COUNT(*)::int AS count FROM customer_order WHERE restaurant_id = $1', [
      restaurantId,
    ]),
    query(
      `SELECT COUNT(*)::int AS count FROM customer_order
       WHERE restaurant_id = $1 AND status IN ('PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')`,
      [restaurantId]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM customer_order
       WHERE restaurant_id = $1 AND ${deliveredOrderStatusInSql()}`,
      [restaurantId]
    ),
    query(
      `SELECT COALESCE(SUM(total_amount), 0)::float AS total FROM customer_order
       WHERE restaurant_id = $1 AND ${deliveredOrderStatusInSql()}`,
      [restaurantId]
    ),
    query(
      `SELECT COUNT(DISTINCT p.supplier_id)::int AS count
       FROM order_item oi
       JOIN customer_order o ON o.id = oi.order_id
       JOIN product p ON p.id = oi.product_id
       WHERE o.restaurant_id = $1`,
      [restaurantId]
    ),
  ])

  const spent = parseFloat(totalSpent[0]?.total ?? 0)
  return {
    totalProducts: totalProducts[0]?.count ?? 0,
    totalOrders: totalOrders[0]?.count ?? 0,
    pendingOrders: pendingOrders[0]?.count ?? 0,
    completedOrders: completedOrders[0]?.count ?? 0,
    totalSpent: spent,
    totalRevenue: spent,
    totalSuppliers: totalSuppliers[0]?.count ?? 0,
  }
}

async function fetchRecentRestaurantOrders(restaurantId) {
  const { rows } = await query(
    `SELECT
       o.id,
       o.status,
       o.total_amount,
       COALESCE(o.placed_at, o.created_at) AS created_at,
       r.name AS restaurant_name,
       (
         SELECT MIN(s.name)
         FROM order_item oi
         JOIN product p ON p.id = oi.product_id
         JOIN supplier s ON s.id = p.supplier_id
         WHERE oi.order_id = o.id
       ) AS supplier_name
     FROM customer_order o
     JOIN restaurant r ON r.id = o.restaurant_id
     WHERE o.restaurant_id = $1
     ORDER BY COALESCE(o.placed_at, o.created_at) DESC
     LIMIT $2`,
    [restaurantId, RECENT_ORDER_LIMIT]
  )
  return rows
}

async function fetchRecentSupplierOrders(supplierId) {
  const { rows } = await query(
    `SELECT
       o.id,
       o.status,
       o.total_amount,
       COALESCE(o.placed_at, o.created_at) AS created_at,
       r.name AS restaurant_name
     FROM customer_order o
     JOIN restaurant r ON r.id = o.restaurant_id
     WHERE EXISTS (
       SELECT 1 FROM order_item oi
       WHERE oi.order_id = o.id AND oi.supplier_id = $1
     )
     ORDER BY COALESCE(o.placed_at, o.created_at) DESC
     LIMIT $2`,
    [supplierId, RECENT_ORDER_LIMIT]
  )
  return rows
}

async function fetchRestaurantSpendTrend(restaurantId, days = SPEND_TREND_DAYS) {
  const { rows } = await query(
    `SELECT
       TO_CHAR(DATE(COALESCE(placed_at, created_at)), 'MM-DD') AS date,
       COALESCE(SUM(total_amount), 0)::float AS total
     FROM customer_order
     WHERE restaurant_id = $1
       AND status NOT IN ('DRAFT', 'CANCELLED')
       AND COALESCE(placed_at, created_at) >= NOW() - ($2::int * INTERVAL '1 day')
     GROUP BY DATE(COALESCE(placed_at, created_at))
     ORDER BY DATE(COALESCE(placed_at, created_at)) ASC`,
    [restaurantId, days]
  )
  return rows.map((row) => ({ name: row.date, value: parseFloat(row.total) || 0 }))
}

async function fetchSupplierLowStockPreview(supplierId) {
  const useWh = await supplierUsesWarehouseInventory(supplierId)
  let rows
  if (useWh) {
    const supplierCol = await getWarehouseSupplierColumn()
    ;({ rows } = await query(
      `
      SELECT
        p.id,
        p.name AS product_name,
        COALESCE(SUM(wi.quantity_available), 0)::numeric AS available_qty,
        COALESCE(pis.low_stock_threshold, $2)::int AS low_stock_threshold
      FROM product p
      LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
      LEFT JOIN warehouse_inventory wi ON wi.product_id = p.id
      LEFT JOIN warehouse w ON w.id = wi.warehouse_id
        AND w.${supplierCol} = $1
        AND w.is_active = TRUE
      WHERE p.supplier_id = $1
      GROUP BY p.id, p.name, pis.low_stock_threshold
      HAVING COALESCE(SUM(wi.quantity_available), 0) > 0
         AND COALESCE(SUM(wi.quantity_available), 0) <= COALESCE(pis.low_stock_threshold, $2)
      ORDER BY COALESCE(SUM(wi.quantity_available), 0) ASC, p.name ASC
      LIMIT $3
      `,
      [supplierId, DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD, LOW_STOCK_PREVIEW_LIMIT]
    ))
  } else {
    ;({ rows } = await query(
      `
      SELECT
        p.id,
        p.name AS product_name,
        COALESCE(i.available_qty, 0)::numeric AS available_qty,
        COALESCE(pis.low_stock_threshold, $2)::int AS low_stock_threshold
      FROM product p
      LEFT JOIN inventory i ON i.product_id = p.id
      LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
      WHERE p.supplier_id = $1
        AND COALESCE(i.available_qty, 0) > 0
        AND COALESCE(i.available_qty, 0) <= COALESCE(pis.low_stock_threshold, $2)
      ORDER BY COALESCE(i.available_qty, 0) ASC, p.name ASC
      LIMIT $3
      `,
      [supplierId, DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD, LOW_STOCK_PREVIEW_LIMIT]
    ))
  }

  return rows.map((row) => {
    const available_qty = Number(row.available_qty) || 0
    const flags = computeSupplierStockFlags(available_qty, row.low_stock_threshold)
    return {
      id: row.id,
      product_name: row.product_name,
      available_qty,
      low_stock_threshold: flags.lowStockThreshold,
      isLowStock: flags.isLowStock,
    }
  })
}

/**
 * Lightweight dashboard bundle for above-the-fold widgets (no line items).
 * @param {{ tenantType: 'RESTAURANT' | 'SUPPLIER', tenantId: string }} tenant
 */
export async function buildDashboardSummary(tenant) {
  if (tenant.tenantType === 'SUPPLIER') {
    const [stats, recentOrders, lowStockPreview] = await Promise.all([
      buildSupplierStats(tenant.tenantId),
      fetchRecentSupplierOrders(tenant.tenantId),
      fetchSupplierLowStockPreview(tenant.tenantId),
    ])
    return { stats, recentOrders, spendTrend: [], lowStockPreview }
  }

  if (tenant.tenantType === 'RESTAURANT') {
    const [stats, recentOrders, spendTrend] = await Promise.all([
      buildRestaurantStats(tenant.tenantId),
      fetchRecentRestaurantOrders(tenant.tenantId),
      fetchRestaurantSpendTrend(tenant.tenantId),
    ])
    return { stats, recentOrders, spendTrend, lowStockPreview: [] }
  }

  return { stats: {}, recentOrders: [], spendTrend: [], lowStockPreview: [] }
}
