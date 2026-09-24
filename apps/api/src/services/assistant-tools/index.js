import { query } from '../../lib/db.js'
import { hasPermission } from '../../lib/permissions.js'
import { rolesIncludeOwner } from '../../lib/tenant-roles.js'
import { PERMISSION_KEYS as P } from '../../lib/permission-keys.js'
import { isFeatureEnabledForTenant, getResolvedFeatureValue } from '../../lib/feature-flags.js'
import { hasSmartReorderCapability } from '../../lib/smart-reorder-tier.js'
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
import { listSupplierSlowMovingInventory } from '../supplier-slow-moving-intelligence.service.js'
import { listSupplierDemandForecast } from '../supplier-demand-forecast.service.js'
import { buildAdminOverviewMetrics } from '../../lib/admin-overview-metrics.js'
import { getTenantSubscription } from '../../lib/subscription.js'
import { assertDriverAssignmentAccess, isDriverOnlyPermissions } from '../../lib/driver-rbac.js'
import {
  getProductPriceHistory,
  listPriceChangeAlerts,
} from '../restaurant-price-intelligence.service.js'
import { getWasteIntelligence } from '../restaurant-waste-intelligence.service.js'
import { listSupplierReliability } from '../restaurant-supplier-reliability.service.js'
import { listWeakMarginMenuItems } from '../restaurant-margin-intelligence.service.js'
import { listOverOrderingIntelligence } from '../restaurant-over-ordering-intelligence.service.js'
import { listInvoiceAnomalies } from '../restaurant-invoice-anomaly-intelligence.service.js'
import {
  restaurantOrgBranchComparison,
  restaurantOrgStockTransferSuggestions,
} from '../org-reports.service.js'
import { getUserRestaurantOrgMembership } from '../../lib/restaurant-org.js'
import {
  getIntelligenceTierForTenant,
  INTELLIGENCE_TIER_ORDER,
} from '../../lib/intelligence-tier.js'

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
  if (ctx.isAdmin && !ctx.isImpersonating)
    return hasPermission(ctx.permissions || [], P.ADMIN_ACCESS)
  if (rolesIncludeOwner(ctx.roles)) return true
  return hasPermission(ctx.permissions || [], permissionKey)
}

async function featureOn(ctx, key) {
  if (!ctx.tenantId || !ctx.tenantType || ctx.tenantType === 'ADMIN') return false
  return isFeatureEnabledForTenant(ctx.tenantId, ctx.tenantType, key)
}

async function intelligenceAtLeast(ctx, minimum) {
  const resolved = await getIntelligenceTierForTenant(ctx.tenantId, ctx.tenantType)
  return INTELLIGENCE_TIER_ORDER.indexOf(resolved.tier) >= INTELLIGENCE_TIER_ORDER.indexOf(minimum)
}
function cap(rows) {
  return Array.isArray(rows) ? rows.slice(0, ROW_CAP) : rows
}

async function getRestaurantOrgScope(ctx) {
  if (ctx.restaurantOrgScopeResolved) return ctx.restaurantOrgScope
  ctx.restaurantOrgScopeResolved = true
  ctx.restaurantOrgScope = null

  if (ctx.tenantType !== 'RESTAURANT' || !ctx.userId) return null
  const membership = await getUserRestaurantOrgMembership(ctx.userId)
  const organizationId = membership?.organization_id
  if (!organizationId) return null

  const { rows: mainRows } = await query(
    `SELECT id FROM restaurant WHERE organization_id = $1 AND is_main_branch = true LIMIT 1`,
    [organizationId]
  )
  const primaryRestaurantId = mainRows[0]?.id
  if (!primaryRestaurantId) return null

  ctx.restaurantOrgScope = { organizationId, primaryRestaurantId }
  return ctx.restaurantOrgScope
}

async function organizationFeatureOn(ctx, featureKey) {
  const org = await getRestaurantOrgScope(ctx)
  if (!org) return false
  return isFeatureEnabledForTenant(org.primaryRestaurantId, 'RESTAURANT', featureKey)
}

async function organizationHasForecast(ctx) {
  const org = await getRestaurantOrgScope(ctx)
  if (!org) return false
  const featureValue = await getResolvedFeatureValue(
    org.primaryRestaurantId,
    'RESTAURANT',
    'smart_reorder'
  )
  return hasSmartReorderCapability(featureValue, 'forecast')
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
          search: {
            type: 'string',
            description: 'Optional order id fragment or counterparty name',
          },
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
              WHERE oi_s.order_id = o.id AND oi_s.supplier_id = $1
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
          ${
            ctx.tenantType === 'SUPPLIER'
              ? ''
              : `OR EXISTS (
            SELECT 1 FROM order_item oi_q
            JOIN product p_q ON p_q.id = oi_q.product_id
            JOIN supplier s_q ON s_q.id = COALESCE(oi_q.supplier_id, p_q.supplier_id)
            WHERE oi_q.order_id = o.id AND s_q.name ILIKE $${params.length}
          )`
          }
        )`
      }
      params.push(ROW_CAP)
      const { rows } = await query(
        `
        SELECT
          o.id,
          'ORD-' || UPPER(SUBSTRING(o.id::text FROM 1 FOR 8)) AS "orderNumber",
          o.status,
          ${ctx.tenantType === 'SUPPLIER' ? '(SELECT COALESCE(SUM(oi_total.line_total), 0) FROM order_item oi_total WHERE oi_total.order_id = o.id AND oi_total.supplier_id = $1)' : 'o.total_amount'} AS "totalAmount",
          o.currency,
          COALESCE(o.placed_at, o.created_at) AS "placedAt",
          r.name AS "restaurantName",
          ${
            ctx.tenantType === 'SUPPLIER'
              ? '(SELECT s_current.name FROM supplier s_current WHERE s_current.id = $1)'
              : `(
            SELECT s2.name
            FROM order_item oi2
            JOIN product p2 ON p2.id = oi2.product_id
            JOIN supplier s2 ON s2.id = COALESCE(oi2.supplier_id, p2.supplier_id)
            WHERE oi2.order_id = o.id
            LIMIT 1
          )`
          } AS "supplierName"
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
      const uuidMatch = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      const short = raw.replace(/^ORD-/i, '').toLowerCase()
      const tenantFilter =
        ctx.tenantType === 'RESTAURANT'
          ? 'o.restaurant_id = $1'
          : `EXISTS (
              SELECT 1 FROM order_item oi_s
              WHERE oi_s.order_id = o.id AND oi_s.supplier_id = $1
            )`
      const { rows } = await query(
        `
        SELECT
          o.id,
          'ORD-' || UPPER(SUBSTRING(o.id::text FROM 1 FOR 8)) AS "orderNumber",
          o.status,
          ${ctx.tenantType === 'SUPPLIER' ? '(SELECT COALESCE(SUM(oi_total.line_total), 0) FROM order_item oi_total WHERE oi_total.order_id = o.id AND oi_total.supplier_id = $1)' : 'o.total_amount'} AS "totalAmount",
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
      const itemParams = [rows[0].id]
      const itemTenantFilter = ctx.tenantType === 'SUPPLIER' ? ' AND oi.supplier_id = $2' : ''
      if (ctx.tenantType === 'SUPPLIER') itemParams.push(ctx.tenantId)
      itemParams.push(ROW_CAP)
      const { rows: items } = await query(
        `
        SELECT p.name AS "productName", oi.quantity, p.unit AS unit, oi.line_total AS "lineTotal"
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        WHERE oi.order_id = $1${itemTenantFilter}
        ORDER BY p.name
        LIMIT $${itemParams.length}
        `,
        itemParams
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
        if (ctx.driverId && isDriverOnlyPermissions(ctx.permissions)) {
          await assertDriverAssignmentAccess({
            userId: ctx.userId,
            supplierId: ctx.tenantId,
            orderId,
            permissions: ctx.permissions,
          })
        }
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

  get_price_history: {
    definition: {
      name: 'get_price_history',
      description: 'Observed purchase-price history for one restaurant catalog product.',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'Restaurant catalog product ID' },
          days: { type: 'number', description: 'Lookback days, default 180' },
        },
        required: ['productId'],
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.CATALOG_VIEW) &&
      (await intelligenceAtLeast(ctx, 'basic')),
    run: async (ctx, args) => {
      const productId = String(args.productId || '').trim()
      if (!productId) return { productId: null, events: [], summary: null }
      const days = Math.min(Math.max(Number(args.days) || 180, 1), 730)
      const result = await getProductPriceHistory(ctx.tenantId, productId, { days, limit: ROW_CAP })
      return { ...result, events: cap(result.events) }
    },
  },
  get_price_changes: {
    definition: {
      name: 'get_price_changes',
      description: 'Meaningful observed restaurant purchase-price changes.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number' },
          minChangePct: { type: 'number' },
          direction: { type: 'string', enum: ['up', 'down', 'any'] },
        },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.CATALOG_VIEW) &&
      (await intelligenceAtLeast(ctx, 'advanced')),
    run: async (ctx, args) => {
      const days = Math.min(Math.max(Number(args.days) || 30, 1), 365)
      const result = await listPriceChangeAlerts(ctx.tenantId, {
        days,
        minChangePct: args.minChangePct,
        direction: args.direction,
      })
      return { ...result, alerts: cap(result.alerts) }
    },
  },
  get_waste_intelligence: {
    definition: {
      name: 'get_waste_intelligence',
      description: 'Repeated or rising restaurant waste and spoilage signals.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Lookback days, default 30' },
        },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.INVENTORY_VIEW) &&
      (await featureOn(ctx, 'waste_tracking')) &&
      (await intelligenceAtLeast(ctx, 'advanced')),
    run: async (ctx, args) => {
      const days = Math.min(Math.max(Number(args.days) || 30, 7), 365)
      const result = await getWasteIntelligence(ctx.tenantId, { days, limit: ROW_CAP })
      return { ...result, hotspots: cap(result.hotspots) }
    },
  },
  get_supplier_reliability: {
    definition: {
      name: 'get_supplier_reliability',
      description: 'Observed receiving, delivery, and dispute reliability facts by supplier.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Lookback days, default 90' },
        },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.RECEIVING_VIEW) &&
      (await featureOn(ctx, 'receiving_quality')) &&
      (await intelligenceAtLeast(ctx, 'advanced')),
    run: async (ctx, args) => {
      const days = Math.min(Math.max(Number(args.days) || 90, 7), 730)
      const result = await listSupplierReliability(ctx.tenantId, { days })
      return { ...result, suppliers: cap(result.suppliers) }
    },
  },
  get_recipe_profitability: {
    definition: {
      name: 'get_recipe_profitability',
      description:
        'Computed menu-item profitability facts below a selected gross-margin threshold.',
      parameters: {
        type: 'object',
        properties: {
          maxMarginPct: {
            type: 'number',
            description: 'Gross-margin display threshold, default 60',
          },
        },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.RECIPES_VIEW_COSTS) &&
      (await featureOn(ctx, 'recipe_costing')) &&
      (await intelligenceAtLeast(ctx, 'advanced')),
    run: async (ctx, args) => {
      const result = await listWeakMarginMenuItems(ctx.tenantId, {
        maxMarginPct: args.maxMarginPct,
        limit: ROW_CAP,
      })
      return { ...result, items: cap(result.items) }
    },
  },
  get_over_ordering: {
    definition: {
      name: 'get_over_ordering',
      description:
        'Coverage-aware signals of restaurant stock purchased faster than observed depletion.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Lookback days, default 90' },
        },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.INVENTORY_VIEW) &&
      can(ctx, P.RECEIVING_VIEW) &&
      (await featureOn(ctx, 'waste_tracking')) &&
      (await featureOn(ctx, 'receiving_quality')) &&
      (await intelligenceAtLeast(ctx, 'advanced')),
    run: async (ctx, args) => {
      const days = Math.min(Math.max(Number(args.days) || 90, 30), 365)
      const result = await listOverOrderingIntelligence(ctx.tenantId, { days, limit: ROW_CAP })
      return { ...result, products: cap(result.products) }
    },
  },
  get_invoice_anomalies: {
    definition: {
      name: 'get_invoice_anomalies',
      description:
        'Factual invoice-line differences from order, contract, and prior invoice records.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Lookback days, default 90' },
          minChangePct: { type: 'number', description: 'Minimum prior-price movement percentage' },
        },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.INVOICES_VIEW) &&
      (await featureOn(ctx, 'finance_invoices')) &&
      (await intelligenceAtLeast(ctx, 'advanced')),
    run: async (ctx, args) => {
      const days = Math.min(Math.max(Number(args.days) || 90, 7), 365)
      const result = await listInvoiceAnomalies(ctx.tenantId, {
        days,
        minChangePct: args.minChangePct,
        limit: ROW_CAP,
      })
      return { ...result, invoices: cap(result.invoices) }
    },
  },
  get_branch_comparison: {
    definition: {
      name: 'get_branch_comparison',
      description: 'Authorized cross-branch purchasing, inventory, waste, and receiving facts.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
          to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.ORDERS_VIEW) &&
      can(ctx, P.INVENTORY_VIEW) &&
      can(ctx, P.RECEIVING_VIEW) &&
      (await organizationFeatureOn(ctx, 'multi_branch')) &&
      (await organizationFeatureOn(ctx, 'waste_tracking')) &&
      (await organizationFeatureOn(ctx, 'receiving_quality')) &&
      (await intelligenceAtLeast(ctx, 'scale')),
    run: async (ctx, args) => {
      const org = await getRestaurantOrgScope(ctx)
      if (!org) throw new Error('Restaurant organization access is required')
      const result = await restaurantOrgBranchComparison(ctx.userId, org.organizationId, {
        from: args.from,
        to: args.to,
      })
      return {
        ...result,
        data: { ...result.data, branches: cap(result.data?.branches) },
      }
    },
  },
  get_transfer_suggestions: {
    definition: {
      name: 'get_transfer_suggestions',
      description:
        'Read-only cross-branch stock-transfer suggestions from fresh forecasts and observed surplus.',
      parameters: { type: 'object', properties: {} },
    },
    available: async (ctx) =>
      ctx.tenantType === 'RESTAURANT' &&
      can(ctx, P.INVENTORY_VIEW) &&
      (await organizationFeatureOn(ctx, 'multi_branch')) &&
      (await organizationHasForecast(ctx)) &&
      (await intelligenceAtLeast(ctx, 'scale')),
    run: async (ctx) => {
      const org = await getRestaurantOrgScope(ctx)
      if (!org) throw new Error('Restaurant organization access is required')
      const result = await restaurantOrgStockTransferSuggestions(ctx.userId, org.organizationId)
      return { ...result, data: { ...result.data, suggestions: cap(result.data?.suggestions) } }
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

  get_supplier_demand_forecast: {
    definition: {
      name: 'get_supplier_demand_forecast',
      description: 'Recorded supplier product-demand forecast; review only.',
      parameters: {
        type: 'object',
        properties: {
          horizonDays: { type: 'number', description: 'Forecast horizon in days, default 14' },
        },
      },
    },
    available: async (ctx) => {
      if (ctx.tenantType !== 'SUPPLIER' || !can(ctx, P.ORDERS_VIEW)) return false
      const smartReorderValue = await getResolvedFeatureValue(
        ctx.tenantId,
        ctx.tenantType,
        'smart_reorder'
      )
      return (
        hasSmartReorderCapability(smartReorderValue, 'forecast') &&
        (await intelligenceAtLeast(ctx, 'scale'))
      )
    },
    run: async (ctx, args) => {
      const horizonDays = Math.min(Math.max(Number(args.horizonDays) || 14, 1), 90)
      const result = await listSupplierDemandForecast(ctx.tenantId, {
        horizonDays,
        limit: ROW_CAP,
      })
      return { ...result, forecasts: cap(result.forecasts) }
    },
  },
  get_supplier_slow_moving_inventory: {
    definition: {
      name: 'get_supplier_slow_moving_inventory',
      description: 'Recorded supplier stock cover for repeatedly sold products; review only.',
      parameters: {
        type: 'object',
        properties: { days: { type: 'number', description: 'Lookback days, default 90' } },
      },
    },
    available: async (ctx) =>
      ctx.tenantType === 'SUPPLIER' &&
      can(ctx, P.WAREHOUSES_VIEW) &&
      (await featureOn(ctx, 'inventory_management')) &&
      (await intelligenceAtLeast(ctx, 'scale')),
    run: async (ctx, args) => {
      const days = Math.min(Math.max(Number(args.days) || 90, 30), 365)
      const result = await listSupplierSlowMovingInventory(ctx.tenantId, { days, limit: ROW_CAP })
      return { ...result, products: cap(result.products) }
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
      Boolean(ctx.driverId) && ctx.tenantType === 'SUPPLIER' && can(ctx, P.DRIVER_DELIVERIES_VIEW),
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
  const availableTools = await Promise.all(
    Object.entries(TOOLS).map(async ([name, tool]) => ({
      name,
      definition: tool.definition,
      enabled: await tool.available(ctx),
    }))
  )
  const enabledTools = availableTools.filter((tool) => tool.enabled)
  return {
    names: enabledTools.map((tool) => tool.name),
    definitions: enabledTools.map((tool) => tool.definition),
  }
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
