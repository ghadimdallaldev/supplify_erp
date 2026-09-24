import { query } from '../lib/db.js'

const DEFAULT_DAYS = 180
const MIN_DAYS = 30
const MAX_DAYS = 365
const MIN_PAIR_ORDERS = 2
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/**
 * Find customer-level, evidence-only cross-sell opportunities from exact products
 * that other customers repeatedly ordered in the same supplier order.
 */
export async function listSupplierCrossSellOpportunities(
  supplierId,
  { days = DEFAULT_DAYS, limit = DEFAULT_LIMIT } = {}
) {
  const parsedDays = Number.parseInt(days, 10)
  const observationDays = Math.min(MAX_DAYS, Math.max(MIN_DAYS, parsedDays || DEFAULT_DAYS))
  const parsedLimit = Number.parseInt(limit, 10)
  const resultLimit = Math.min(MAX_LIMIT, Math.max(1, parsedLimit || DEFAULT_LIMIT))

  const { rows } = await query(
    `
      WITH supplier_orders AS (
        SELECT co.id AS order_id, co.restaurant_id
        FROM customer_order co
        JOIN order_item oi ON oi.order_id = co.id AND oi.supplier_id = $1
        WHERE co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
          AND COALESCE(co.placed_at, co.created_at) >= now() - ($2::int * INTERVAL '1 day')
        GROUP BY co.id, co.restaurant_id
      ),
      order_products AS (
        SELECT DISTINCT so.order_id, so.restaurant_id, oi.product_id
        FROM supplier_orders so
        JOIN order_item oi ON oi.order_id = so.order_id AND oi.supplier_id = $1
      ),
      pair_evidence AS (
        SELECT
          anchor.product_id AS anchor_product_id,
          candidate.product_id AS candidate_product_id,
          COUNT(DISTINCT anchor.order_id)::int AS paired_order_count
        FROM order_products anchor
        JOIN order_products candidate
          ON candidate.order_id = anchor.order_id
         AND candidate.product_id <> anchor.product_id
        GROUP BY anchor.product_id, candidate.product_id
        HAVING COUNT(DISTINCT anchor.order_id) >= $3
      ),
      customer_products AS (
        SELECT DISTINCT restaurant_id, product_id
        FROM order_products
      )
      SELECT
        customer_anchor.restaurant_id,
        restaurant.name AS restaurant_name,
        anchor_product.id AS anchor_product_id,
        anchor_product.name AS anchor_product_name,
        anchor_product.sku AS anchor_sku,
        candidate_product.id AS candidate_product_id,
        candidate_product.name AS candidate_product_name,
        candidate_product.sku AS candidate_sku,
        evidence.paired_order_count
      FROM customer_products customer_anchor
      JOIN pair_evidence evidence ON evidence.anchor_product_id = customer_anchor.product_id
      LEFT JOIN customer_products customer_candidate
        ON customer_candidate.restaurant_id = customer_anchor.restaurant_id
       AND customer_candidate.product_id = evidence.candidate_product_id
      JOIN restaurant ON restaurant.id = customer_anchor.restaurant_id
      JOIN product anchor_product ON anchor_product.id = evidence.anchor_product_id AND anchor_product.supplier_id = $1
      JOIN product candidate_product ON candidate_product.id = evidence.candidate_product_id AND candidate_product.supplier_id = $1
      WHERE customer_candidate.product_id IS NULL
      ORDER BY evidence.paired_order_count DESC, restaurant.name, anchor_product.name, candidate_product.name
      LIMIT $4
    `,
    [supplierId, observationDays, MIN_PAIR_ORDERS, resultLimit]
  )

  return {
    observationDays,
    minPairedOrders: MIN_PAIR_ORDERS,
    opportunities: rows.map((row) => ({
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      anchorProduct: {
        productId: row.anchor_product_id,
        productName: row.anchor_product_name,
        sku: row.anchor_sku || null,
      },
      candidateProduct: {
        productId: row.candidate_product_id,
        productName: row.candidate_product_name,
        sku: row.candidate_sku || null,
      },
      pairedOrderCount: Number(row.paired_order_count) || 0,
    })),
  }
}
