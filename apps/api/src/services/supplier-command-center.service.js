import { query } from '../lib/db.js'
import { getSupplierReceivables } from './supplier-receivables.service.js'
import { getReorderIntelligence } from './supplier-reorder-intelligence.service.js'
import { buildTrackingPayload } from '../lib/delivery-tracking-payload.js'
import { isGpsTrackingEnabled } from '../lib/delivery-tracking-payload.js'
import { getSupplierGrowthMetrics } from './supplier-growth-metrics.service.js'
import { DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD } from '../lib/supplier-stock-status.js'

const OPEN_INVOICE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']

export async function getSupplierCommandCenter(supplierId) {
  const [
    ordersToPrepare,
    deliveriesPending,
    ordersNeedingAction,
    lowStock,
    disputesOpen,
    fulfillmentAlerts,
    receivables,
    reorderIntel,
    boostedDeals,
    customerGrowth,
  ] = await Promise.all([
    countOrdersToPrepareToday(supplierId),
    countDeliveriesPendingToday(supplierId),
    countOrdersNeedingSupplierAction(supplierId),
    getLowStockProducts(supplierId),
    countOpenDisputes(supplierId),
    countFulfillmentAlerts(supplierId),
    getSupplierReceivables(supplierId),
    getReorderIntelligence(supplierId),
    getBoostedDealsSummary(supplierId),
    getSupplierGrowthMetrics(supplierId).catch(() => null),
  ])

  const priorities = buildPriorities({
    ordersToPrepare,
    deliveriesPending,
    ordersNeedingAction,
    receivables,
    reorderIntel,
    lowStock,
    disputesOpen,
    fulfillmentAlerts,
  })

  return {
    kpis: {
      ordersToPrepareToday: ordersToPrepare,
      deliveriesPendingToday: deliveriesPending,
      ordersWaitingAction: ordersNeedingAction,
      unpaidBalance: receivables.summary.unpaidTotal,
      overdueBalance: receivables.summary.overdueTotal,
      customersDueReorder: reorderIntel.dueCount,
      lowStockCount: lowStock.length,
      openDisputes: disputesOpen,
      fulfillmentAlerts,
    },
    todaysPriorities: priorities.slice(0, 8),
    needsAttention: priorities,
    previews: {
      deliveries: await getDeliveryPreview(supplierId),
      deliveryGpsSummary: await getDeliveryGpsSummary(supplierId),
      receivables: {
        unpaidTotal: receivables.summary.unpaidTotal,
        overdueTotal: receivables.summary.overdueTotal,
        topDebtors: receivables.topDebtors.slice(0, 5),
        aging: receivables.aging,
      },
      reorderOpportunities: reorderIntel.customersAtRisk.slice(0, 5),
      lowStock: lowStock.slice(0, 5),
      boostedDeals,
      customerGrowth,
    },
  }
}

async function countOrdersToPrepareToday(supplierId) {
  const { rows } = await query(
    `
    SELECT COUNT(DISTINCT o.id)::int AS count
    FROM customer_order o
    JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
    WHERE o.status IN ('ACKNOWLEDGED', 'PROCESSING')
      AND COALESCE(o.placed_at, o.created_at) >= date_trunc('day', now())
    `,
    [supplierId]
  )
  return rows[0]?.count ?? 0
}

async function countDeliveriesPendingToday(supplierId) {
  const { rows } = await query(
    `
    SELECT COUNT(DISTINCT o.id)::int AS count
    FROM customer_order o
    JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
    LEFT JOIN LATERAL (
      SELECT da.status FROM driver_assignments da
      WHERE da.order_id = o.id AND da.status NOT IN ('reassigned', 'delivered')
      ORDER BY da.created_at DESC LIMIT 1
    ) da ON true
    WHERE o.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')
      AND (da.status IS NULL OR da.status IN ('assigned', 'picked_up', 'out_for_delivery', 'rescheduled'))
    `,
    [supplierId]
  )
  return rows[0]?.count ?? 0
}

async function countOrdersNeedingSupplierAction(supplierId) {
  const { rows } = await query(
    `
    SELECT COUNT(DISTINCT o.id)::int AS count
    FROM customer_order o
    JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
    WHERE o.status IN ('PLACED', 'PENDING_APPROVAL')
       OR EXISTS (
         SELECT 1 FROM order_amendments oa
         WHERE oa.order_id = o.id
           AND oa.status = 'pending'
           AND oa.requested_by_role = 'restaurant'
       )
    `,
    [supplierId]
  )
  return rows[0]?.count ?? 0
}

async function getLowStockProducts(supplierId) {
  const { rows } = await query(
    `
    SELECT p.id, p.name, p.sku, i.available_qty, COALESCE(pis.low_stock_threshold, ${DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD}) AS reorder_point
    FROM product p
    JOIN inventory i ON i.product_id = p.id
    LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
    WHERE p.supplier_id = $1
      AND i.available_qty > 0
      AND i.available_qty <= COALESCE(pis.low_stock_threshold, ${DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD})
    ORDER BY i.available_qty ASC
    LIMIT 20
    `,
    [supplierId]
  )
  return rows.map((r) => ({
    productId: r.id,
    name: r.name,
    sku: r.sku,
    availableQty: parseFloat(r.available_qty) || 0,
    reorderPoint: parseFloat(r.reorder_point) || 0,
  }))
}

async function countOpenDisputes(supplierId) {
  const { rows } = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM disputes d
    WHERE d.supplier_id = $1
      AND d.status IN ('open', 'under_review', 'escalated')
    `,
    [supplierId]
  )
  return rows[0]?.count ?? 0
}

async function countFulfillmentAlerts(supplierId) {
  const { rows } = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM fulfillment_exceptions fe
    WHERE fe.supplier_id = $1 AND fe.status = 'open'
    `,
    [supplierId]
  )
  return rows[0]?.count ?? 0
}

async function getBoostedDealsSummary(supplierId) {
  try {
    const { rows } = await query(
      `
      SELECT
        COUNT(*) FILTER (WHERE dp.status = 'active')::int AS active_deals,
        COALESCE(SUM(dp.impressions), 0)::int AS total_views,
        COALESCE(SUM(dp.clicks), 0)::int AS total_clicks
      FROM deal_promotions dp
      WHERE dp.supplier_id = $1
        AND dp.status IN ('active', 'paused')
        AND dp.created_at >= NOW() - interval '30 days'
      `,
      [supplierId]
    )
    const row = rows[0] || {}
    return {
      activeBoostedDeals: row.active_deals ?? 0,
      totalViews: row.total_views ?? 0,
      totalClicks: row.total_clicks ?? 0,
    }
  } catch {
    return { activeBoostedDeals: 0, totalViews: 0, totalClicks: 0 }
  }
}

async function getDeliveryGpsSummary(supplierId) {
  if (!isGpsTrackingEnabled()) {
    return { active: 0, live: 0, stale: 0, noGps: 0, failed: 0 }
  }

  const { rows } = await query(
    `
    SELECT
      da.order_id,
      da.driver_id,
      da.status AS assignment_status,
      dll.recorded_at,
      dll.order_id AS loc_order_id,
      dll.latitude,
      dll.longitude
    FROM driver_assignments da
    JOIN customer_order o ON o.id = da.order_id
    JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
    LEFT JOIN driver_latest_location dll ON dll.driver_id = da.driver_id
    WHERE da.supplier_id = $1
      AND da.status IN ('assigned', 'picked_up', 'out_for_delivery')
      AND o.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
      AND COALESCE(o.placed_at, o.created_at) >= date_trunc('day', now())
    `,
    [supplierId]
  )

  let live = 0
  let stale = 0
  let noGps = 0
  const failedRows = await query(
    `
    SELECT COUNT(DISTINCT da.order_id)::int AS count
    FROM driver_assignments da
    WHERE da.supplier_id = $1
      AND da.status = 'failed'
      AND da.failed_at >= date_trunc('day', now())
    `,
    [supplierId]
  )
  const failed = failedRows.rows[0]?.count ?? 0

  for (const row of rows) {
    const tracking = buildTrackingPayload({
      orderId: row.order_id,
      locationRow: row.latitude
        ? {
            latitude: row.latitude,
            longitude: row.longitude,
            recordedAt: row.recorded_at,
            orderId: row.loc_order_id,
          }
        : null,
      allowDriverFallback: true,
    })
    if (!tracking.hasLocation) noGps += 1
    else if (tracking.isStale) stale += 1
    else live += 1
  }

  return {
    active: rows.length,
    live,
    stale,
    noGps,
    failed,
  }
}

async function getDeliveryPreview(supplierId) {
  const { rows } = await query(
    `
    SELECT DISTINCT ON (o.id)
      o.id,
      r.name AS restaurant_name,
      COALESCE(da.status, 'pending') AS delivery_status,
      d.full_name AS driver_name
    FROM customer_order o
    JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
    JOIN restaurant r ON r.id = o.restaurant_id
    LEFT JOIN LATERAL (
      SELECT * FROM driver_assignments da2
      WHERE da2.order_id = o.id AND da2.status NOT IN ('reassigned')
      ORDER BY da2.created_at DESC LIMIT 1
    ) da ON true
    LEFT JOIN drivers d ON d.id = da.driver_id
    WHERE o.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')
    ORDER BY o.id, o.created_at DESC
    LIMIT 8
    `,
    [supplierId]
  )
  return rows.map((r) => ({
    orderId: r.id,
    restaurantName: r.restaurant_name,
    deliveryStatus: r.delivery_status,
    driverName: r.driver_name,
  }))
}

function buildPriorities(ctx) {
  const items = []
  if (ctx.ordersNeedingAction > 0) {
    items.push({
      id: 'orders-action',
      type: 'orders',
      title: `${ctx.ordersNeedingAction} order(s) need your action`,
      href: '/app/orders?status=PLACED',
      severity: 'high',
    })
  }
  if (ctx.deliveriesPending > 0) {
    items.push({
      id: 'deliveries',
      type: 'delivery',
      title: `${ctx.deliveriesPending} delivery(ies) pending today`,
      href: '/app/fulfillment',
      severity: 'high',
    })
  }
  if (ctx.receivables.summary.overdueTotal > 0) {
    items.push({
      id: 'overdue-invoices',
      type: 'finance',
      title: `Overdue receivables: ${ctx.receivables.summary.overdueTotal.toFixed(2)}`,
      href: '/app/invoices?filter=overdue',
      severity: 'medium',
    })
  }
  if (ctx.reorderIntel.dueCount > 0) {
    items.push({
      id: 'reorder',
      type: 'customers',
      title: `${ctx.reorderIntel.dueCount} restaurant(s) due to reorder`,
      href: '/app/command-center#reorder',
      severity: 'medium',
    })
  }
  if (ctx.lowStock.length > 0) {
    items.push({
      id: 'low-stock',
      type: 'inventory',
      title: `${ctx.lowStock.length} product(s) low on stock`,
      href: '/app/inventory',
      severity: 'medium',
    })
  }
  if (ctx.disputesOpen > 0) {
    items.push({
      id: 'disputes',
      type: 'disputes',
      title: `${ctx.disputesOpen} dispute(s) need response`,
      href: '/app/disputes',
      severity: 'high',
    })
  }
  if (ctx.fulfillmentAlerts > 0) {
    items.push({
      id: 'fulfillment',
      type: 'fulfillment',
      title: `${ctx.fulfillmentAlerts} fulfillment alert(s)`,
      href: '/app/fulfillment',
      severity: 'low',
    })
  }
  return items
}

export { OPEN_INVOICE_STATUSES }
