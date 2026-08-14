import { query } from '../../lib/db.js'
import { hasPermission } from '../../lib/permissions.js'
import { PERMISSION_KEYS as P } from '../../lib/permission-keys.js'
import { isFeatureEnabledForTenant } from '../../lib/feature-flags.js'
import { getReorderAssistance } from '../restaurant-reorder-assistance.service.js'
import { getOrderTracking } from '../driver-location.service.js'
import { getRestaurantPayables } from '../restaurant-payables.service.js'
import { getSupplierReceivables } from '../supplier-receivables.service.js'
import { listRecipes } from '../recipe.service.js'
import { parseReportQuery } from '../reports.service.js'
import * as reports from '../reports.service.js'
import { listDeliveryRoutes, getDriverActiveRoute } from '../delivery-routes.service.js'
import { listSupplierStockDisplay } from '../supplier-stock.service.js'
import { getSupplierCommandCenter } from '../supplier-command-center.service.js'
import { buildAdminOverviewMetrics } from '../../lib/admin-overview-metrics.js'
import { getTenantSubscription } from '../../lib/subscription.js'

const ROW_CAP = 15

/**
 * @typedef {object} AssistantToolContext
 * @property {string|null} tenantId
 * @property {'RESTAURANT'|'SUPPLIER'|'ADMIN'|null} tenantType
 * @property {string} userId
 * @property {string[]} permissions
 * @property {string[]} roles
 * @property {boolean} isAdmin
 * @property {boolean} isImpersonating
 * @property {string|null} driverId
 * @property {string|null} preferredLocale
 */

function can(ctx, permissionKey) {
  if (ctx.isAdmin && !ctx.isImpersonating) return true
  if (ctx.roles?.includes('Owner')) return true
  return hasPermission(ctx.permissions || [], permissionKey)
}

async function featureOn(ctx, key) {
  if (!ctx.tenantId || !ctx.tenantType || ctx.tenantType === 'ADMIN') return false
  return isFeatureEnabledForTenant(ctx.tenantId, ctx.tenantType, key)
}

function cap(rows) {
  return Array.isArray(rows) ? rows.slice(0, ROW_CAP) : rows
}

/** @type {Record<string, { definition: import('../../lib/ai/provider.js').AiToolDefinition, available: (ctx: AssistantToolContext) => Promise<boolean>, run: (ctx: AssistantToolContext, args: Record<string, unknown>) => Promise<unknown> }>} */
const TOOLS = {
  get_inventory: {
    definition: {
      name: 'get_inventory',
      description:
        'Look up restaurant on-hand stock by product name (e.g. tomatoes). Returns quantity and unit.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Product name fragment to search' },
        },
        required: ['search'],
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.INVENTORY_VIEW) &&
      (await featureOn(ctx, 'inventory_management')),
    run: async (ctx, args) => {
      const search = String(args.search || '').trim()
      if (!search) return { items: [] }
      const { rows } = await query(
        `
        SELECT
          ri.product_id AS "productId",
          p.name AS "productName",
          p.sku AS sku,
          p.unit AS unit,
          ri.quantity AS quantity,
          ri.low_stock_threshold AS "lowStockThreshold",
          CASE
            WHEN ri.low_stock_threshold IS NOT NULL AND ri.quantity <= ri.low_stock_threshold
            THEN true ELSE false
          END AS "isLowStock"
        FROM restaurant_inventory ri
        JOIN product p ON p.id = ri.product_id
        WHERE ri.restaurant_id = $1
          AND (
            p.name ILIKE '%' || $2 || '%'
            OR COALESCE(p.sku, '') ILIKE '%' || $2 || '%'
          )
        ORDER BY
          CASE WHEN lower(p.name) = lower($2) THEN 0
               WHEN lower(p.name) LIKE lower($2) || '%' THEN 1
               ELSE 2 END,
          p.name
        LIMIT $3
        `,
        [ctx.tenantId, search, ROW_CAP]
      )
      return { items: rows }
    },
  },

  get_reorder_need: {
    definition: {
      name: 'get_reorder_need',
      description:
        'Suggested buy quantities (how much the restaurant needs to order), optionally filtered by product name.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Optional product name filter' },
        },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.INVENTORY_VIEW) &&
      (await featureOn(ctx, 'smart_reorder')),
    run: async (ctx, args) => {
      const sub = await getTenantSubscription(ctx.tenantId, 'RESTAURANT')
      const featureValue = sub?.features?.smart_reorder
      const assistance = await getReorderAssistance(ctx.tenantId, {
        smartReorderFeatureValue: featureValue,
        limit: 40,
      })
      const search = String(args.search || '')
        .trim()
        .toLowerCase()
      let suggestions = (assistance.suggestions || []).map((s) => ({
        productId: s.productId,
        productName: s.productName,
        suggestedQty: s.suggestedQty,
        urgency: s.urgency,
        reasonCode: s.reasonCode,
        supplierName: s.supplierName,
        unit: s.unit || s.productUnit || null,
      }))
      if (search) {
        suggestions = suggestions.filter((s) =>
          String(s.productName || '')
            .toLowerCase()
            .includes(search)
        )
      }
      return { suggestions: cap(suggestions), tier: assistance.smartReorder?.tier || null }
    },
  },

  get_orders: {
    definition: {
      name: 'get_orders',
      description: 'List recent orders for the current tenant. Optionally filter by status.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Optional order status filter' },
          search: { type: 'string', description: 'Optional order id fragment or counterparty name' },
        },
      },
    },
    available: async (ctx) =>
      (ctx.tenantType === 'RESTAURANT' || ctx.tenantType === 'SUPPLIER') && can(ctx, P.ORDERS_VIEW),
    run: async (ctx, args) => {
      const status = args.status ? String(args.status).trim().toUpperCase() : null
      const search = String(args.search || '').trim()
      const params = [ctx.tenantId]
      let where =
        ctx.tenantType === 'RESTAURANT'
          ? 'o.restaurant_id = $1'
          : `EXISTS (
              SELECT 1 FROM order_item oi_s
              JOIN product p_s ON p_s.id = oi_s.product_id
              WHERE oi_s.order_id = o.id AND (oi_s.supplier_id = $1 OR p_s.supplier_id = $1)
            )`
      if (status) {
        params.push(status)
        where += ` AND o.status = $${params.length}`
      }
      if (search) {
        params.push(`%${search}%`)
        where += ` AND (
          o.id::text ILIKE $${params.length}
          OR COALESCE(r.name, '') ILIKE $${params.length}
          OR EXISTS (
            SELECT 1 FROM order_item oi_q
            JOIN product p_q ON p_q.id = oi_q.product_id
            JOIN supplier s_q ON s_q.id = COALESCE(oi_q.supplier_id, p_q.supplier_id)
            WHERE oi_q.order_id = o.id AND s_q.name ILIKE $${params.length}
          )
        )`
      }
      params.push(ROW_CAP)
      const { rows } = await query(
        `
        SELECT
          o.id,
          'ORD-' || UPPER(SUBSTRING(o.id::text FROM 1 FOR 8)) AS "orderNumber",
          o.status,
          o.total_amount AS "totalAmount",
          o.currency,
          COALESCE(o.placed_at, o.created_at) AS "placedAt",
          r.name AS "restaurantName",
          (
            SELECT s2.name
            FROM order_item oi2
            JOIN product p2 ON p2.id = oi2.product_id
            JOIN supplier s2 ON s2.id = COALESCE(oi2.supplier_id, p2.supplier_id)
            WHERE oi2.order_id = o.id
            LIMIT 1
          ) AS "supplierName"
        FROM customer_order o
        JOIN restaurant r ON r.id = o.restaurant_id
        WHERE ${where}
          AND o.status <> 'DRAFT'
        ORDER BY COALESCE(o.placed_at, o.created_at) DESC
        LIMIT $${params.length}
        `,
        params
      )
      return { orders: rows }
    },
  },

  get_order: {
    definition: {
      name: 'get_order',
      description: 'Get one order by id (UUID or ORD-xxxxxxxx), including line items summary.',
      parameters: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'Order UUID or ORD- short code' },
        },
        required: ['orderId'],
      },
    },
    available: async (ctx) =>
      (ctx.tenantType === 'RESTAURANT' || ctx.tenantType === 'SUPPLIER') && can(ctx, P.ORDERS_VIEW),
    run: async (ctx, args) => {
      const raw = String(args.orderId || '').trim()
      if (!raw) return { error: 'orderId required' }
      const uuidMatch = raw.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
      )
      const short = raw.replace(/^ORD-/i, '').toLowerCase()
      const tenantFilter =
        ctx.tenantType === 'RESTAURANT'
          ? 'o.restaurant_id = $1'
          : `EXISTS (
              SELECT 1 FROM order_item oi_s
              JOIN product p_s ON p_s.id = oi_s.product_id
              WHERE oi_s.order_id = o.id AND (oi_s.supplier_id = $1 OR p_s.supplier_id = $1)
            )`
      const { rows } = await query(
        `
        SELECT
          o.id,
          'ORD-' || UPPER(SUBSTRING(o.id::text FROM 1 FOR 8)) AS "orderNumber",
          o.status,
          o.total_amount AS "totalAmount",
          o.currency,
          COALESCE(o.placed_at, o.created_at) AS "placedAt",
          r.name AS "restaurantName"
        FROM customer_order o
        JOIN restaurant r ON r.id = o.restaurant_id
        WHERE ${tenantFilter}
          AND (
            ($2::uuid IS NOT NULL AND o.id = $2::uuid)
            OR LOWER(SUBSTRING(o.id::text FROM 1 FOR 8)) = $3
          )
        LIMIT 1
        `,
        [ctx.tenantId, uuidMatch ? uuidMatch[0] : null, short.slice(0, 8)]
      )
      if (!rows[0]) return { error: 'Order not found' }
      const { rows: items } = await query(
        `
        SELECT p.name AS "productName", oi.quantity, p.unit AS unit, oi.line_total AS "lineTotal"
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        WHERE oi.order_id = $1
        ORDER BY p.name
        LIMIT $2
        `,
        [rows[0].id, ROW_CAP]
      )
      return { order: rows[0], items }
    },
  },

  get_deliveries: {
    definition: {
      name: 'get_deliveries',
      description: 'Delivery / ETA tracking for an order the tenant can see.',
      parameters: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'Order UUID' },
        },
        required: ['orderId'],
      },
    },
    available: async (ctx) => {
      if (ctx.tenantType === 'RESTAURANT' || ctx.tenantType === 'SUPPLIER') {
        return can(ctx, P.ORDERS_VIEW)
      }
      if (ctx.driverId) return can(ctx, P.DRIVER_DELIVERIES_VIEW)
      return false
    },
    run: async (ctx, args) => {
      const orderId = String(args.orderId || '')
      if (!orderId) return { error: 'orderId required' }
      try {
        const tracking = await getOrderTracking({
          orderId,
          supplierId: ctx.tenantType === 'SUPPLIER' ? ctx.tenantId : undefined,
          restaurantId: ctx.tenantType === 'RESTAURANT' ? ctx.tenantId : undefined,
          exposeDriverPhone: false,
        })
        return { tracking }
      } catch (err) {
        return { error: err?.message || 'Tracking unavailable' }
      }
    },
  },

  get_invoices: {
    definition: {
      name: 'get_invoices',
      description: 'Open invoices / payables (restaurant) or receivables (supplier).',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    available: async (ctx) =>
      (ctx.tenantType === 'RESTAURANT' || ctx.tenantType === 'SUPPLIER') &&
      can(ctx, P.INVOICES_VIEW) &&
      (await featureOn(ctx, 'finance_invoices')),
    run: async (ctx) => {
      if (ctx.tenantType === 'RESTAURANT') {
        const data = await getRestaurantPayables(ctx.tenantId)
        return {
          summary: data.summary,
          invoices: cap(
            (data.invoices || []).map((inv) => ({
              id: inv.id,
              number: inv.invoice_number || inv.number,
              status: inv.status,
              total: inv.total_amount || inv.total,
              dueDate: inv.due_date || inv.dueDate,
              counterparty: inv.supplier_name || inv.supplierName,
            }))
          ),
        }
      }
      const data = await getSupplierReceivables(ctx.tenantId)
      return {
        summary: data.summary,
        invoices: cap(
          (data.invoices || []).map((inv) => ({
            id: inv.id,
            number: inv.invoice_number || inv.number,
            status: inv.status,
            total: inv.total_amount || inv.total,
            dueDate: inv.due_date || inv.dueDate,
            counterparty: inv.restaurant_name || inv.restaurantName,
          }))
        ),
      }
    },
  },

  get_recipes: {
    definition: {
      name: 'get_recipes',
      description: 'Search restaurant recipes / costing. Costs only included when permitted.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Recipe name search' },
        },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.RECIPES_VIEW) &&
      (await featureOn(ctx, 'recipe_costing')),
    run: async (ctx, args) => {
      const includeCosts = can(ctx, P.RECIPES_VIEW_COSTS)
      const { recipes } = await listRecipes(
        ctx.tenantId,
        { search: args.search ? String(args.search) : undefined, active: 'true' },
        { includeCosts, limit: ROW_CAP, offset: 0 }
      )
      return {
        recipes: (recipes || []).slice(0, ROW_CAP).map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          portionCount: r.portionCount,
          yieldUnit: r.yieldUnit,
          ...(includeCosts
            ? {
                costPerPortion: r.costPerPortion,
                foodCostPct: r.foodCostPct,
              }
            : {}),
        })),
      }
    },
  },

  get_waste: {
    definition: {
      name: 'get_waste',
      description: 'Restaurant waste / spoilage analytics for a recent period.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Lookback days (default 30)' },
        },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.ORDERS_VIEW) &&
      (await featureOn(ctx, 'waste_tracking')) &&
      (await featureOn(ctx, 'reports')),
    run: async (ctx, args) => {
      const days = Math.min(Math.max(Number(args.days) || 30, 1), 90)
      const to = new Date()
      const from = new Date(Date.now() - days * 86400000)
      const params = parseReportQuery({
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        granularity: 'day',
      })
      const result = await reports.restaurantWaste(ctx.tenantId, params)
      return { periodDays: days, data: cap(result.data || []), meta: result.meta }
    },
  },

  get_reports: {
    definition: {
      name: 'get_reports',
      description:
        'High-level report summary. Restaurant: spend_by_supplier|order_volume|top_products. Supplier: revenue_trend|top_restaurants|fulfillment.',
      parameters: {
        type: 'object',
        properties: {
          report: {
            type: 'string',
            description: 'Report key',
          },
          days: { type: 'number', description: 'Lookback days (default 30)' },
        },
        required: ['report'],
      },
    },
    available: async (ctx) =>
      (ctx.tenantType === 'RESTAURANT' || ctx.tenantType === 'SUPPLIER') &&
      can(ctx, P.ORDERS_VIEW) &&
      (await featureOn(ctx, 'reports')),
    run: async (ctx, args) => {
      const days = Math.min(Math.max(Number(args.days) || 30, 1), 90)
      const to = new Date()
      const from = new Date(Date.now() - days * 86400000)
      const params = parseReportQuery({
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        granularity: 'day',
      })
      const key = String(args.report || '').toLowerCase()
      let result
      if (ctx.tenantType === 'RESTAURANT') {
        const map = {
          spend_by_supplier: reports.restaurantSpendBySupplier,
          order_volume: reports.restaurantOrderVolume,
          top_products: reports.restaurantTopProducts,
          invoice_aging: reports.restaurantInvoiceAging,
        }
        const fn = map[key] || reports.restaurantSpendBySupplier
        result = await fn(ctx.tenantId, params)
      } else {
        const map = {
          revenue_trend: reports.supplierRevenueTrend,
          top_restaurants: reports.supplierTopRestaurants,
          fulfillment: reports.supplierFulfillmentPerformance,
          top_products: reports.supplierTopProducts,
        }
        const fn = map[key] || reports.supplierRevenueTrend
        result = await fn(ctx.tenantId, params)
      }
      return { report: key, periodDays: days, data: cap(result.data || []), meta: result.meta }
    },
  },

  get_fulfillment_board: {
    definition: {
      name: 'get_fulfillment_board',
      description: 'Supplier fulfillment snapshot: active routes and command-center counters.',
      parameters: { type: 'object', properties: {} },
    },
    available: async (ctx) =>
      ctx.tenantType === 'SUPPLIER' &&
      can(ctx, P.FULFILLMENT_VIEW) &&
      (await featureOn(ctx, 'fulfillment_tools')),
    run: async (ctx) => {
      const [routes, command] = await Promise.all([
        listDeliveryRoutes(ctx.tenantId, { includeCancelled: false }),
        getSupplierCommandCenter(ctx.tenantId).catch(() => null),
      ])
      return {
        routes: cap(
          (routes || []).map((r) => ({
            id: r.id,
            name: r.name || r.label,
            status: r.status,
            driverName: r.driver_name || r.driverName,
            stopCount: r.stop_count || r.stops?.length || null,
          }))
        ),
        commandCenter: command
          ? {
              ordersToPrepare: command.ordersToPrepare ?? command.orders_to_prepare,
              deliveriesPending: command.deliveriesPending ?? command.deliveries_pending,
              lowStock: command.lowStock ?? command.low_stock,
            }
          : null,
      }
    },
  },

  get_warehouse_stock: {
    definition: {
      name: 'get_warehouse_stock',
      description: 'Supplier sellable / warehouse stock, optionally filtered by product name.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Product name filter' },
        },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'SUPPLIER' &&
      can(ctx, P.INVENTORY_VIEW) &&
      (await featureOn(ctx, 'inventory_management')),
    run: async (ctx, args) => {
      const search = String(args.search || '').trim()
      const stock = await listSupplierStockDisplay(ctx.tenantId, {})
      const productIds = (stock || []).map((r) => r.product_id).filter(Boolean)
      if (!productIds.length) return { items: [] }
      const { rows: products } = await query(
        `
        SELECT id, name, unit, sku
        FROM product
        WHERE id = ANY($1::uuid[])
          AND ($2::text = '' OR name ILIKE '%' || $2 || '%' OR COALESCE(sku,'') ILIKE '%' || $2 || '%')
        `,
        [productIds, search]
      )
      const byId = new Map(products.map((p) => [p.id, p]))
      const items = []
      for (const row of stock) {
        const p = byId.get(row.product_id)
        if (!p) continue
        items.push({
          productId: row.product_id,
          productName: p.name,
          availableQty: row.available_qty,
          unit: p.unit,
          sku: p.sku,
        })
        if (items.length >= ROW_CAP) break
      }
      return { items }
    },
  },

  get_my_stops: {
    definition: {
      name: 'get_my_stops',
      description: 'Driver assigned active route and stops for today.',
      parameters: { type: 'object', properties: {} },
    },
    available: async (ctx) =>
      Boolean(ctx.driverId) &&
      ctx.tenantType === 'SUPPLIER' &&
      can(ctx, P.DRIVER_DELIVERIES_VIEW),
    run: async (ctx) => {
      const route = await getDriverActiveRoute(ctx.tenantId, ctx.driverId)
      if (!route) return { route: null, stops: [] }
      return {
        route: {
          id: route.id,
          name: route.name || route.label,
          status: route.status,
        },
        stops: cap(
          (route.stops || []).map((s) => ({
            orderId: s.order_id || s.orderId,
            orderNumber: s.order_number || s.orderNumber,
            restaurantName: s.restaurant_name || s.restaurantName,
            status: s.status,
            sequence: s.sequence || s.stop_sequence,
            address: s.address || s.delivery_address,
          }))
        ),
      }
    },
  },

  get_admin_overview: {
    definition: {
      name: 'get_admin_overview',
      description: 'Platform admin overview metrics (tenants, orders, MRR, ops counters).',
      parameters: { type: 'object', properties: {} },
    },
    available: async (ctx) => ctx.isAdmin && !ctx.isImpersonating && can(ctx, P.ADMIN_ACCESS),
    run: async () => {
      const metrics = await buildAdminOverviewMetrics()
      return { metrics }
    },
  },
}

/**
 * Resolve which tools the current user may call.
 * @param {AssistantToolContext} ctx
 */
export async function resolveAvailableTools(ctx) {
  const names = []
  const definitions = []
  for (const [name, tool] of Object.entries(TOOLS)) {
    if (await tool.available(ctx)) {
      names.push(name)
      definitions.push(tool.definition)
    }
  }
  return { names, definitions }
}

/**
 * Execute a tool by name under the caller's context.
 * @param {AssistantToolContext} ctx
 * @param {string} name
 * @param {Record<string, unknown>} args
 */
export async function executeAssistantTool(ctx, name, args) {
  const tool = TOOLS[name]
  if (!tool) {
    const err = new Error(`Unknown tool: ${name}`)
    err.code = 'UNKNOWN_TOOL'
    throw err
  }
  if (!(await tool.available(ctx))) {
    const err = new Error(`Tool not available: ${name}`)
    err.code = 'TOOL_FORBIDDEN'
    throw err
  }
  return tool.run(ctx, args || {})
}

export const ASSISTANT_TOOL_NAMES = Object.keys(TOOLS)
