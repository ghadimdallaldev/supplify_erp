import { query } from '../lib/db.js'
import { NotFoundError } from '../middlewares/errorHandler.js'
import { resolveDestinationFromOrderRow } from '../lib/delivery-coordinates.js'

/** Operational allow-list for drivers; prices, billing and customer PII are intentionally excluded. */
export async function getDriverDeliveryDetail(orderId, supplierId) {
  const { rows } = await query(
    `
    SELECT
      o.id AS order_id,
      o.status AS order_status,
      o.requested_delivery_date,
      o.created_at AS order_created_at,
      o.delivery_location_snapshot,
      r.name AS restaurant_name,
      r.address_json AS restaurant_address,
      b.id AS branch_id,
      b.name AS branch_name,
      b.address AS branch_address,
      b.delivery_latitude AS branch_delivery_latitude,
      b.delivery_longitude AS branch_delivery_longitude,
      b.delivery_location_label AS branch_delivery_location_label,
      da.id AS assignment_id,
      da.driver_id,
      da.warehouse_assignment_id,
      da.status AS assignment_status,
      da.assigned_at,
      da.scheduled_delivery_date,
      da.picked_up_at,
      da.delivered_at,
      da.failed_at,
      da.failure_reason,
      da.notes AS assignment_notes,
      dr.id AS route_id,
      dr.route_number,
      dr.scheduled_date AS route_date,
      rs.id AS route_stop_id,
      rs.sequence_number,
      EXISTS (SELECT 1 FROM proof_of_delivery pod WHERE pod.order_id = o.id) AS pod_available
    FROM customer_order o
    JOIN restaurant r ON r.id = o.restaurant_id
    LEFT JOIN branch b ON b.id = o.branch_id
    LEFT JOIN LATERAL (
      SELECT da2.*
      FROM driver_assignments da2
      WHERE da2.order_id = o.id
        AND da2.supplier_id = $2
        AND da2.status NOT IN ('reassigned', 'superseded')
      ORDER BY da2.created_at DESC
      LIMIT 1
    ) da ON TRUE
    LEFT JOIN route_stop rs ON rs.order_id = o.id
    LEFT JOIN delivery_route dr ON dr.id = rs.route_id AND dr.supplier_id = $2
    WHERE o.id = $1
      AND EXISTS (SELECT 1 FROM order_item oi WHERE oi.order_id = o.id AND oi.supplier_id = $2)
      AND (da.id IS NOT NULL OR EXISTS (
        SELECT 1 FROM driver_assignments any_da
        WHERE any_da.order_id = o.id AND any_da.supplier_id = $2
      ))
    ORDER BY dr.scheduled_date DESC NULLS LAST
    LIMIT 1
    `,
    [orderId, supplierId]
  )
  if (!rows.length) throw new NotFoundError('Delivery not found')

  const row = rows[0]
  const destination = resolveDestinationFromOrderRow({
    delivery_location_snapshot: row.delivery_location_snapshot,
    branch_delivery_latitude: row.branch_delivery_latitude,
    branch_delivery_longitude: row.branch_delivery_longitude,
    branch_delivery_location_label: row.branch_delivery_location_label,
    branch_name: row.branch_name,
    branch_address: row.branch_address,
    restaurant_address: row.restaurant_address,
    restaurant_name: row.restaurant_name,
  })
  const { rows: items } = await query(
    `
    SELECT oi.id, oi.quantity, oi.product_id,
           COALESCE(p.name, 'Item') AS item_name,
           p.sku AS sku
    FROM order_item oi
    LEFT JOIN product p ON p.id = oi.product_id
    WHERE oi.order_id = $1 AND oi.supplier_id = $2
    ORDER BY oi.id
    `,
    [orderId, supplierId]
  )

  return {
    orderId: row.order_id,
    orderStatus: row.order_status,
    restaurantName: row.restaurant_name,
    orderReference: row.order_number ?? null,
    deliveryStatus: row.assignment_status ?? null,
    deliveryWindow: row.requested_delivery_time ?? null,
    notes: row.assignment_notes ?? null,
    failureReason: row.failure_reason ?? null,
    branch: row.branch_id
      ? { id: row.branch_id, name: row.branch_name, address: row.branch_address ?? null }
      : null,
    destination: destination
      ? {
          coordinatesAvailable: destination.latitude != null && destination.longitude != null,
          latitude: destination.latitude,
          longitude: destination.longitude,
          label: destination.label ?? null,
          address: destination.address ?? null,
          addressNotes: destination.addressNotes ?? null,
          source: destination.source,
        }
      : null,
    items: items.map((item) => ({
      id: item.id,
      name: item.item_name,
      sku: item.sku ?? null,
      quantity: Number(item.quantity),
    })),
    scheduledDeliveryDate:
      row.scheduled_delivery_date?.toISOString?.().slice(0, 10) ??
      row.scheduled_delivery_date ??
      row.route_date?.toISOString?.().slice(0, 10) ??
      row.route_date ??
      row.requested_delivery_date?.toISOString?.().slice(0, 10) ??
      row.requested_delivery_date ??
      row.assigned_at?.toISOString?.().slice(0, 10) ??
      row.assigned_at ??
      row.order_created_at?.toISOString?.().slice(0, 10) ??
      row.order_created_at ??
      null,
    assignment: row.assignment_id
      ? {
          id: row.assignment_id,
          driverId: row.driver_id,
          warehouseAssignmentId: row.warehouse_assignment_id,
          status: row.assignment_status,
          assignedAt: row.assigned_at,
          pickedUpAt: row.picked_up_at,
          deliveredAt: row.delivered_at,
          failedAt: row.failed_at,
          failureReason: row.failure_reason,
          notes: row.assignment_notes,
        }
      : null,
    route: row.route_id
      ? {
          id: row.route_id,
          routeNumber: row.route_number,
          scheduledDate: row.route_date,
          stopId: row.route_stop_id,
          sequenceNumber: row.sequence_number,
        }
      : null,
    podAvailable: Boolean(row.pod_available),
  }
}
