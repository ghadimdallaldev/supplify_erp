import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  getRequestTenant,
  resolveTenantContext,
  requirePermission,
} from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { getCache, setCache } from '../lib/cache.js'

const router = express.Router()

/** Schema probe is process-lifetime — migrations don't change mid-process. */
let customerOrderHasBranchIdPromise = null

async function customerOrderHasBranchId() {
  if (!customerOrderHasBranchIdPromise) {
    customerOrderHasBranchIdPromise = query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'customer_order'
            AND column_name = 'branch_id'
        ) AS exists
      `
    ).then((result) => result.rows[0]?.exists === true)
  }
  return customerOrderHasBranchIdPromise
}

/** Test-only: clear schema probe cache between cases. */
function __resetOrdersCalendarSchemaCacheForTests() {
  customerOrderHasBranchIdPromise = null
}

const calendarQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(100),
  start: z.string().optional(),
  end: z.string().optional(),
  status: z.string().optional(),
  supplier: z.string().uuid().optional(),
  branch: z.string().uuid().optional(),
  category: z.string().optional(),
  role: z.enum(['RESTAURANT', 'SUPPLIER']).optional(),
})

const COMPLETED_STATUSES = new Set(['COMPLETED', 'DELIVERED', 'RECEIVED_FULL'])
const IN_TRANSIT_STATUSES = new Set(['ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT'])
const PENDING_STATUSES = new Set(['DRAFT', 'PLACED', 'CONFIRMED', 'INVOICED'])
const CANCELLED_STATUSES = new Set(['CANCELLED'])

function getStatusCategory(status) {
  if (!status) return 'pending'
  const normalized = status.toUpperCase()
  if (CANCELLED_STATUSES.has(normalized)) return 'cancelled'
  if (COMPLETED_STATUSES.has(normalized)) return 'completed'
  if (IN_TRANSIT_STATUSES.has(normalized)) return 'in_transit'
  return 'pending'
}

function summarizeSuppliers(suppliers) {
  if (!Array.isArray(suppliers) || suppliers.length === 0) {
    return { primary: null, list: [] }
  }
  const unique = suppliers.filter(Boolean).map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
  }))
  const deduped = []
  const seen = new Set()
  for (const supplier of unique) {
    if (supplier?.id && !seen.has(supplier.id)) {
      seen.add(supplier.id)
      deduped.push(supplier)
    }
  }

  return {
    primary: deduped[0] || null,
    list: deduped,
  }
}

function buildOrderEvents(order, roleContext) {
  const events = []
  const statusCategory = getStatusCategory(order.status)
  const suppliersSummary = summarizeSuppliers(order.suppliers)
  const counterpart =
    roleContext === 'RESTAURANT'
      ? suppliersSummary.primary?.name || 'Supplier'
      : order.restaurant_name || 'Restaurant'

  events.push({
    id: `${order.id}-order`,
    orderId: order.id,
    type: roleContext === 'RESTAURANT' ? 'RECEIVED_ORDER' : 'PURCHASE_ORDER',
    source: 'ORDER',
    title: `${roleContext === 'RESTAURANT' ? 'Order' : 'Purchase'} #${order.id.slice(0, 8)}`,
    status: order.status,
    statusCategory,
    start: order.placed_at || order.created_at,
    end: null,
    totalAmount: Number(order.total_amount) || 0,
    currency: order.currency,
    counterpartName: counterpart,
    supplierId: suppliersSummary.primary?.id || null,
    supplierName: suppliersSummary.primary?.name || null,
    supplierList: suppliersSummary.list,
    branchId: order.branch_id,
    branchName: order.branch_name,
    categories: order.categories || [],
    role: roleContext,
  })

  return events
}

function buildInvoiceEvents(invoice, roleContext, orderLookup) {
  const order = invoice.order_id ? orderLookup.get(invoice.order_id) : null
  const categories = order?.categories || []
  const branchId = order?.branch_id || null
  const branchName = order?.branch_name || null
  const supplierInfo = order?.supplierList?.[0] || null

  const counterpart =
    roleContext === 'RESTAURANT'
      ? supplierInfo?.name || invoice.supplier_name || 'Supplier'
      : invoice.restaurant_name || 'Restaurant'

  const statusCategory = getStatusCategory(invoice.status)
  return {
    id: `${invoice.id}-invoice`,
    orderId: invoice.order_id,
    invoiceId: invoice.id,
    type: roleContext === 'RESTAURANT' ? 'PAYMENT_DUE' : 'PAYMENT_COLLECTION',
    source: 'INVOICE',
    title: `Payment ${invoice.status?.toLowerCase() === 'paid' ? 'Received' : 'Due'}`,
    status: invoice.status,
    statusCategory,
    start: invoice.due_date || invoice.invoice_date || invoice.created_at,
    end: null,
    totalAmount: Number(invoice.total_amount) || 0,
    currency: invoice.currency,
    counterpartName: counterpart,
    supplierId: supplierInfo?.id || invoice.supplier_id || null,
    supplierName: supplierInfo?.name || invoice.supplier_name || null,
    supplierList: order?.supplierList || [],
    branchId,
    branchName,
    categories,
    role: roleContext,
  }
}

router.use(requireAuth, resolveTenantContext, requirePermission('ORDERS_VIEW'))

router.get(
  '/',
  requireFeature(
    'order_calendar',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res) => {
    try {
      const params = calendarQuerySchema.parse(req.query)
      const userRole = req.userData?.role

      if (!['ADMIN', 'RESTAURANT', 'SUPPLIER'].includes(userRole)) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Access denied',
          },
          requestId: req.requestId,
        })
      }

      // When admin is impersonating, use that tenant; otherwise resolve by role and email
      const requestTenant = await getRequestTenant(req)
      let effectiveRole = userRole === 'ADMIN' ? params.role || 'RESTAURANT' : userRole
      let tenant

      if (requestTenant) {
        effectiveRole = requestTenant.tenantType
        tenant = {
          id: requestTenant.tenantId,
          name: requestTenant.tenantName || requestTenant.tenantId,
        }
      } else {
        const email = req.userData?.email
        if (!email) {
          return res.status(400).json({
            ok: false,
            data: null,
            error: {
              name: 'INVALID_USER',
              message: 'User email is required to determine organization context',
            },
            requestId: req.requestId,
          })
        }
        const tenantQuery =
          effectiveRole === 'RESTAURANT'
            ? 'SELECT id, name FROM restaurant WHERE contact_email = $1 LIMIT 1'
            : 'SELECT id, name FROM supplier WHERE contact_email = $1 LIMIT 1'
        const tenantResult = await query(tenantQuery, [email])
        if (tenantResult.rows.length === 0) {
          return res.status(404).json({
            ok: false,
            data: null,
            error: {
              name: 'TENANT_NOT_FOUND',
              message:
                effectiveRole === 'RESTAURANT'
                  ? 'Restaurant not found for user'
                  : 'Supplier not found for user',
            },
            requestId: req.requestId,
          })
        }
        tenant = tenantResult.rows[0]
      }
      const startDate = params.start ? new Date(params.start) : null
      const endDate = params.end ? new Date(params.end) : null

      const cacheKey = `orders-calendar:${tenant.id}:${effectiveRole}:${JSON.stringify({
        page: params.page,
        pageSize: params.pageSize,
        start: startDate ? startDate.toISOString() : null,
        end: endDate ? endDate.toISOString() : null,
        status: params.status || null,
        supplier: params.supplier || null,
        branch: params.branch || null,
        category: params.category || null,
      })}`

      const cached = await getCache(cacheKey)
      if (cached) {
        return res.json({
          ok: true,
          data: cached,
          error: null,
          requestId: req.requestId,
        })
      }

      const hasBranchColumn = await customerOrderHasBranchId()

      if (params.branch && !hasBranchColumn) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'UNSUPPORTED_FILTER',
            message: 'Branch filtering is unavailable in this environment',
          },
          requestId: req.requestId,
        })
      }

      const baseParams = []
      const whereParts = []
      const addParam = (value) => {
        baseParams.push(value)
        return `$${baseParams.length}`
      }

      if (effectiveRole === 'RESTAURANT') {
        whereParts.push(`o.restaurant_id = ${addParam(tenant.id)}`)
      } else {
        whereParts.push(
          `EXISTS (SELECT 1 FROM order_item oi_role WHERE oi_role.order_id = o.id AND oi_role.supplier_id = ${addParam(tenant.id)})`
        )
      }

      if (params.supplier) {
        whereParts.push(
          `EXISTS (SELECT 1 FROM order_item oi_sup WHERE oi_sup.order_id = o.id AND oi_sup.supplier_id = ${addParam(params.supplier)})`
        )
      }

      if (params.branch && hasBranchColumn) {
        whereParts.push(`o.branch_id = ${addParam(params.branch)}`)
      }

      if (params.category) {
        whereParts.push(
          `EXISTS (
          SELECT 1 
          FROM order_item oi_cat 
          JOIN product p_cat ON p_cat.id = oi_cat.product_id 
          WHERE oi_cat.order_id = o.id 
            AND LOWER(p_cat.category) = LOWER(${addParam(params.category)})
        )`
        )
      }

      if (startDate) {
        whereParts.push(
          `COALESCE(o.placed_at, o.created_at) >= ${addParam(startDate.toISOString())}`
        )
      }

      if (endDate) {
        whereParts.push(`COALESCE(o.placed_at, o.created_at) <= ${addParam(endDate.toISOString())}`)
      }

      const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''
      const pageOffset = (params.page - 1) * params.pageSize

      const buildInvoiceWhereParts = (addInvoiceParamFn) => {
        const parts = []
        if (effectiveRole === 'RESTAURANT') {
          parts.push(`i.restaurant_id = ${addInvoiceParamFn(tenant.id)}`)
        } else {
          parts.push(`i.supplier_id = ${addInvoiceParamFn(tenant.id)}`)
        }

        if (startDate) {
          parts.push(
            `COALESCE(i.due_date, i.invoice_date, i.created_at) >= ${addInvoiceParamFn(startDate.toISOString())}`
          )
        }

        if (endDate) {
          parts.push(
            `COALESCE(i.due_date, i.invoice_date, i.created_at) <= ${addInvoiceParamFn(endDate.toISOString())}`
          )
        }

        return parts
      }

      const invoiceParams = []
      const addInvoiceParamForUnion = (value) => {
        invoiceParams.push(value)
        return `$${baseParams.length + invoiceParams.length}`
      }

      const invoiceWhereParts = buildInvoiceWhereParts(addInvoiceParamForUnion)
      const invoiceWhereClause = invoiceWhereParts.length
        ? `WHERE ${invoiceWhereParts.join(' AND ')}`
        : ''

      const invoiceCountParams = []
      const addInvoiceCountParam = (value) => {
        invoiceCountParams.push(value)
        return `$${invoiceCountParams.length}`
      }
      const invoiceCountWhereParts = buildInvoiceWhereParts(addInvoiceCountParam)
      const invoiceCountWhereClause = invoiceCountWhereParts.length
        ? `WHERE ${invoiceCountWhereParts.join(' AND ')}`
        : ''

      const orderEventSql = `
        SELECT
          'order'::text AS source,
          o.id::text AS source_id,
          COALESCE(o.placed_at, o.created_at) AS event_start,
          o.status::text AS event_status
        FROM customer_order o
        ${whereClause}
      `

      const invoiceEventSql = `
        SELECT
          'invoice'::text AS source,
          i.id::text AS source_id,
          COALESCE(i.due_date, i.invoice_date, i.created_at) AS event_start,
          i.status::text AS event_status
        FROM invoice i
        ${invoiceWhereClause}
      `

      const unionParams = [...baseParams, ...invoiceParams]
      if (params.status) {
        unionParams.push(params.status)
      }
      const statusFilterIdx = unionParams.length
      const statusFilterSql = params.status ? `WHERE event_status = $${statusFilterIdx}` : ''

      const paginationParams = [...unionParams, params.pageSize, pageOffset]
      const limitIdx = paginationParams.length - 1
      const offsetIdx = paginationParams.length

      const paginatedSql = `
        WITH combined AS (
          ${orderEventSql}
          UNION ALL
          ${invoiceEventSql}
        )
        SELECT source, source_id, event_start, event_status
        FROM combined
        ${statusFilterSql}
        ORDER BY event_start ASC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `

      const countEventsSql = `
        WITH combined AS (
          ${orderEventSql}
          UNION ALL
          ${invoiceEventSql}
        )
        SELECT COUNT(*)::int AS count
        FROM combined
        ${statusFilterSql}
      `

      const orderCountSql = `
        SELECT COUNT(*)::int AS count
        FROM customer_order o
        ${whereClause}
      `

      const invoiceCountSql = `
        SELECT COUNT(*)::int AS count
        FROM invoice i
        ${invoiceCountWhereClause}
      `

      const [pageResult, totalEventResult, orderCountResult, invoiceCountResult] =
        await Promise.all([
          query(paginatedSql, paginationParams),
          query(countEventsSql, unionParams),
          query(orderCountSql, baseParams),
          query(invoiceCountSql, invoiceCountParams),
        ])

      const totalEvents = Number(totalEventResult.rows?.[0]?.count || 0)
      const totalOrders = Number(orderCountResult.rows?.[0]?.count || 0)
      const totalInvoices = Number(invoiceCountResult.rows?.[0]?.count || 0)

      const pageRows = pageResult.rows || []
      const orderIds = pageRows.filter((r) => r.source === 'order').map((r) => r.source_id)
      const invoiceIds = pageRows.filter((r) => r.source === 'invoice').map((r) => r.source_id)

      let orderRows = []
      if (orderIds.length > 0) {
        const orderDetailSql = `
          SELECT 
            o.id,
            o.status,
            o.total_amount,
            o.currency,
            COALESCE(o.placed_at, o.created_at) AS placed_at,
            o.created_at,
            o.updated_at,
            ${hasBranchColumn ? 'o.branch_id,' : ''}
            ${hasBranchColumn ? 'b.name AS branch_name,' : ''}
            o.restaurant_id,
            r.name AS restaurant_name,
            COALESCE((
              SELECT json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name))
              FROM order_item oi
              JOIN supplier s ON s.id = oi.supplier_id
              WHERE oi.order_id = o.id
            ), '[]'::json) AS suppliers,
            COALESCE((
              SELECT array_remove(array_agg(DISTINCT p.category), NULL)
              FROM order_item oi
              JOIN product p ON p.id = oi.product_id
              WHERE oi.order_id = o.id
            ), ARRAY[]::text[]) AS categories
          FROM customer_order o
          JOIN restaurant r ON r.id = o.restaurant_id
          ${hasBranchColumn ? 'LEFT JOIN branch b ON b.id = o.branch_id' : ''}
          WHERE o.id = ANY($1::uuid[])
        `
        const orderDetailResult = await query(orderDetailSql, [orderIds])
        orderRows = orderDetailResult.rows || []
      }

      let invoiceRows = []
      if (invoiceIds.length > 0) {
        const invoiceDetailSql = `
          SELECT 
            i.id,
            i.order_id,
            i.invoice_date,
            i.due_date,
            i.total_amount,
            i.currency,
            i.status,
            i.supplier_id,
            i.restaurant_id,
            i.created_at,
            s.name AS supplier_name,
            r.name AS restaurant_name
          FROM invoice i
          LEFT JOIN supplier s ON s.id = i.supplier_id
          LEFT JOIN restaurant r ON r.id = i.restaurant_id
          WHERE i.id = ANY($1::uuid[])
        `
        const invoiceDetailResult = await query(invoiceDetailSql, [invoiceIds])
        invoiceRows = invoiceDetailResult.rows || []
      }

      const orderLookup = new Map()
      orderRows.forEach((order) => {
        const supplierSummary = summarizeSuppliers(order.suppliers)
        order.supplierList = supplierSummary.list
        orderLookup.set(order.id, order)
      })

      const orderById = new Map(orderRows.map((order) => [order.id, order]))
      const invoiceById = new Map(invoiceRows.map((invoice) => [invoice.id, invoice]))

      const paginatedEvents = []
      const statusSet = new Set()
      const supplierMap = new Map()
      const branchMap = new Map()
      const categorySet = new Set()

      for (const pageRow of pageRows) {
        if (pageRow.source === 'order') {
          const order = orderById.get(pageRow.source_id)
          if (!order) continue
          for (const event of buildOrderEvents(order, effectiveRole)) {
            paginatedEvents.push(event)
            if (event.status) statusSet.add(event.status)
            if (effectiveRole === 'SUPPLIER') {
              if (order.restaurant_id && order.restaurant_name) {
                supplierMap.set(order.restaurant_id, order.restaurant_name)
              }
            } else if (event.supplierId && event.supplierName) {
              supplierMap.set(event.supplierId, event.supplierName)
            }
            if (hasBranchColumn && event.branchId && event.branchName) {
              branchMap.set(event.branchId, event.branchName)
            }
            if (Array.isArray(event.categories)) {
              event.categories.filter(Boolean).forEach((category) => categorySet.add(category))
            }
          }
          continue
        }

        const invoice = invoiceById.get(pageRow.source_id)
        if (!invoice) continue
        const invoiceEvent = buildInvoiceEvents(invoice, effectiveRole, orderLookup)
        if (!invoiceEvent.start) continue
        paginatedEvents.push(invoiceEvent)
        if (invoiceEvent.status) statusSet.add(invoiceEvent.status)
        if (effectiveRole === 'SUPPLIER') {
          if (invoice.restaurant_id && invoice.restaurant_name) {
            supplierMap.set(invoice.restaurant_id, invoice.restaurant_name)
          }
        } else if (invoiceEvent.supplierId && invoiceEvent.supplierName) {
          supplierMap.set(invoiceEvent.supplierId, invoiceEvent.supplierName)
        }
        if (hasBranchColumn && invoiceEvent.branchId && invoiceEvent.branchName) {
          branchMap.set(invoiceEvent.branchId, invoiceEvent.branchName)
        }
        if (Array.isArray(invoiceEvent.categories)) {
          invoiceEvent.categories.filter(Boolean).forEach((category) => categorySet.add(category))
        }
      }

      const responseData = {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          role: effectiveRole,
        },
        events: paginatedEvents,
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total: totalEvents,
        },
        filters: {
          statuses: Array.from(statusSet).sort(),
          suppliers: Array.from(supplierMap.entries()).map(([id, name]) => ({ id, name })),
          branches: hasBranchColumn
            ? Array.from(branchMap.entries()).map(([id, name]) => ({ id, name }))
            : [],
          categories: Array.from(categorySet).sort(),
          totalOrders,
          totalInvoices,
        },
      }

      await setCache(cacheKey, responseData, 300)

      res.json({
        ok: true,
        data: responseData,
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid calendar parameters',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error('Orders calendar fetch failed', {
        error: error.message,
        stack: error.stack,
        requestId: req.requestId,
      })

      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to load calendar events',
        },
        requestId: req.requestId,
      })
    }
  }
)

export { router as ordersCalendarRoutes, __resetOrdersCalendarSchemaCacheForTests }
