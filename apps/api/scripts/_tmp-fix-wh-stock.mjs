import pg from 'pg'

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const before = await client.query(`SELECT COUNT(*)::int AS c FROM warehouse_inventory`)
console.log('warehouse_inventory before', before.rows[0].c)

const result = await client.query(`
  WITH targets AS (
    SELECT
      COALESCE(w_main.id, w_any.id) AS warehouse_id,
      i.product_id,
      COALESCE(i.available_qty, 0) AS quantity_available,
      COALESCE(i.reserved_qty, 0) AS quantity_reserved
    FROM inventory i
    JOIN product p ON p.id = i.product_id
    LEFT JOIN LATERAL (
      SELECT id FROM warehouse
      WHERE supplier_id = p.supplier_id AND is_active = TRUE AND is_main = TRUE
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1
    ) w_main ON true
    LEFT JOIN LATERAL (
      SELECT id FROM warehouse
      WHERE supplier_id = p.supplier_id AND is_active = TRUE
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1
    ) w_any ON true
    WHERE COALESCE(w_main.id, w_any.id) IS NOT NULL
  )
  INSERT INTO warehouse_inventory (
    warehouse_id, product_id, quantity_available, quantity_reserved, quantity_on_hand, updated_at
  )
  SELECT
    warehouse_id,
    product_id,
    quantity_available,
    quantity_reserved,
    quantity_available + quantity_reserved,
    now()
  FROM targets
  ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
    quantity_available = EXCLUDED.quantity_available,
    quantity_reserved = EXCLUDED.quantity_reserved,
    quantity_on_hand = EXCLUDED.quantity_on_hand,
    updated_at = now()
  RETURNING product_id
`)

console.log('upserted rows', result.rowCount)

const after = await client.query(`
  SELECT s.slug,
    COUNT(DISTINCT p.id)::int AS products,
    COUNT(DISTINCT wi.product_id)::int AS wh_stock_rows,
    COALESCE(SUM(wi.quantity_available), 0)::int AS wh_available
  FROM supplier s
  LEFT JOIN product p ON p.supplier_id = s.id
  LEFT JOIN warehouse w ON w.supplier_id = s.id AND w.is_active = TRUE
  LEFT JOIN warehouse_inventory wi ON wi.warehouse_id = w.id AND wi.product_id = p.id
  GROUP BY s.slug
  ORDER BY s.slug
`)
console.log(JSON.stringify(after.rows, null, 2))

await client.end()
