import { query } from '../lib/db.js'
import { listSupplierStockDisplay } from './supplier-stock.service.js'

const DEFAULT_DAYS = 90
const MIN_SALES = 2
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export async function listSupplierSlowMovingInventory(
  supplierId,
  { days = DEFAULT_DAYS, limit = DEFAULT_LIMIT } = {}
) {
  const parsedDays = Number.parseInt(days, 10)
  const windowDays = Math.min(365, Math.max(30, parsedDays || DEFAULT_DAYS))
  const parsedLimit = Number.parseInt(limit, 10)
  const resultLimit = Math.min(MAX_LIMIT, Math.max(1, parsedLimit || DEFAULT_LIMIT))
  const stock = await listSupplierStockDisplay(supplierId)
  const productIds = stock
    .filter((row) => Number(row.available_qty) > 0)
    .map((row) => row.product_id)
  if (!productIds.length) {
    return {
      windowDays,
      coverage: { stockedProducts: 0, productsWithSalesHistory: 0, slowMovingProducts: 0 },
      products: [],
    }
  }

  const { rows } = await query(
    `SELECT p.id AS product_id, p.name AS product_name, p.sku,
            COALESCE(SUM(recent_sales.quantity), 0)::numeric AS sold_quantity,
            COUNT(DISTINCT recent_sales.order_id)::int AS order_count
       FROM product p
       LEFT JOIN (
         SELECT oi.product_id, oi.order_id, oi.quantity
           FROM order_item oi
           JOIN customer_order co ON co.id = oi.order_id
          WHERE oi.supplier_id = $1
            AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
            AND COALESCE(co.placed_at, co.created_at) >= now() - ($3::int * INTERVAL '1 day')
       ) recent_sales ON recent_sales.product_id = p.id
      WHERE p.supplier_id = $1 AND p.id = ANY($2::uuid[])
      GROUP BY p.id, p.name, p.sku`,
    [supplierId, productIds, windowDays]
  )
  const stockByProduct = new Map(
    stock.map((row) => [row.product_id, Number(row.available_qty) || 0])
  )
  const eligible = rows.filter(
    (row) => Number(row.order_count) >= MIN_SALES && Number(row.sold_quantity) > 0
  )
  const slowMoving = eligible
    .map((row) => {
      const availableQty = stockByProduct.get(row.product_id) || 0
      const dailySales = Number(row.sold_quantity) / windowDays
      return {
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku || null,
        availableQty,
        soldQuantity: Number(row.sold_quantity),
        orderCount: Number(row.order_count),
        stockCoverDays: availableQty / dailySales,
      }
    })
    .filter((row) => row.stockCoverDays >= windowDays)
    .sort((a, b) => b.stockCoverDays - a.stockCoverDays)

  return {
    windowDays,
    coverage: {
      stockedProducts: productIds.length,
      productsWithSalesHistory: eligible.length,
      slowMovingProducts: slowMoving.length,
    },
    products: slowMoving.slice(0, resultLimit),
  }
}
