/** Call with the order locked, before locking any driver assignment. */
export async function lockDeliveryRoutesForOrder(client, { supplierId, orderId }) {
  const { rows } = await client.query(
    `SELECT dr.id, dr.driver_id, dr.status
     FROM delivery_route dr
     WHERE dr.supplier_id = $1 AND dr.status IN ('PLANNED', 'IN_PROGRESS')
       AND EXISTS (SELECT 1 FROM route_stop rs WHERE rs.route_id = dr.id AND rs.order_id = $2)
     ORDER BY dr.id FOR UPDATE OF dr`,
    [supplierId, orderId]
  )
  return rows
}

/** Route-wide writes acquire all affected order locks before the route header. */
export async function lockRouteOrders(client, routeId, additionalOrderIds = []) {
  await client.query(
    `SELECT o.id FROM customer_order o
     WHERE o.id IN (SELECT rs.order_id FROM route_stop rs WHERE rs.route_id = $1)
        OR o.id = ANY($2::uuid[])
     ORDER BY o.id FOR UPDATE OF o`,
    [routeId, additionalOrderIds]
  )
}

/** Derive one stop from all of this route driver's current warehouse legs. */
export async function syncDriverRouteState(client, { supplierId, orderId, driverId, routes }) {
  const ownRoutes = routes.filter((route) => route.driver_id === driverId)
  if (!ownRoutes.length) return
  const {
    rows: [counts],
  } = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
            COUNT(*) FILTER (WHERE status IN ('picked_up', 'out_for_delivery'))::int AS en_route
     FROM (
       SELECT DISTINCT ON (COALESCE(warehouse_assignment_id, '00000000-0000-0000-0000-000000000000'::uuid)) status
       FROM driver_assignments
       WHERE order_id = $1 AND supplier_id = $2 AND driver_id = $3
         AND status NOT IN ('reassigned', 'superseded')
       ORDER BY COALESCE(warehouse_assignment_id, '00000000-0000-0000-0000-000000000000'::uuid),
                created_at DESC, id DESC
     ) current_legs`,
    [orderId, supplierId, driverId]
  )
  if (!counts.total) return
  const terminal = counts.delivered + counts.failed === counts.total
  const status = terminal
    ? counts.failed
      ? 'FAILED'
      : 'COMPLETED'
    : counts.en_route || counts.delivered || counts.failed
      ? 'IN_TRANSIT'
      : 'PLANNED'
  for (const route of ownRoutes) {
    await client.query(
      `UPDATE route_stop SET status = $1,
         departed_at = CASE WHEN $1 IN ('IN_TRANSIT','COMPLETED','FAILED') THEN COALESCE(departed_at, now()) ELSE departed_at END,
         completed_at = CASE WHEN $1 = 'COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END,
         actual_arrival = CASE WHEN $1 = 'COMPLETED' THEN COALESCE(actual_arrival, now()) ELSE actual_arrival END
       WHERE route_id = $2 AND order_id = $3 AND status NOT IN ('COMPLETED','FAILED')`,
      [status, route.id, orderId]
    )
    if (status !== 'PLANNED') {
      await client.query(
        `UPDATE delivery_route SET status = CASE
           WHEN NOT EXISTS (SELECT 1 FROM route_stop rs WHERE rs.route_id = delivery_route.id AND rs.status NOT IN ('COMPLETED','FAILED'))
             THEN 'COMPLETED' ELSE 'IN_PROGRESS' END,
           started_at = COALESCE(started_at, now()),
           completed_at = CASE
             WHEN NOT EXISTS (SELECT 1 FROM route_stop rs WHERE rs.route_id = delivery_route.id AND rs.status NOT IN ('COMPLETED','FAILED'))
               THEN COALESCE(completed_at, now()) ELSE completed_at END,
           updated_at = now()
         WHERE id = $1 AND supplier_id = $2 AND status IN ('PLANNED','IN_PROGRESS')`,
        [route.id, supplierId]
      )
    }
  }
}
