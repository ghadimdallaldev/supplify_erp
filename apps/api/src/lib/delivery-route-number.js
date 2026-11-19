/** Allocate within the caller's transaction, after locking its affected orders. */
export async function nextRouteNumber(supplierId, client) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`delivery_route:${supplierId}`])
  const { rows } = await client.query(
    `
    SELECT
      to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') AS date_part,
      COALESCE((
        SELECT MAX(NULLIF(substring(route_number FROM '[0-9]+$'), '')::int)
        FROM delivery_route
        WHERE supplier_id = $1
          AND route_number LIKE 'R-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-%'
      ), 0) AS n
    `,
    [supplierId]
  )
  const datePart = rows[0]?.date_part || new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const seq = (Number(rows[0]?.n) || 0) + 1
  return `R-${datePart}-${String(seq).padStart(3, '0')}`
}
