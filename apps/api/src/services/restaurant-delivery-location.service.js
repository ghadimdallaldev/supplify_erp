import { query } from '../lib/db.js'
import {
  mapDeliveryLocationRow,
  resolveDestinationFromOrderRow,
  validateDeliveryCoordinates,
} from '../lib/delivery-coordinates.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'

const ORDER_DESTINATION_SQL = `
  SELECT
    o.id AS order_id,
    o.branch_id,
    o.restaurant_id,
    r.name AS restaurant_name,
    r.delivery_latitude AS restaurant_delivery_latitude,
    r.delivery_longitude AS restaurant_delivery_longitude,
    r.delivery_location_label AS restaurant_delivery_location_label,
    b.name AS branch_name,
    b.delivery_latitude AS branch_delivery_latitude,
    b.delivery_longitude AS branch_delivery_longitude,
    b.delivery_location_label AS branch_delivery_location_label
  FROM customer_order o
  JOIN restaurant r ON r.id = o.restaurant_id
  LEFT JOIN branch b ON b.id = o.branch_id
  WHERE o.id = $1
`

export async function loadOrderDestination(orderId) {
  const { rows } = await query(ORDER_DESTINATION_SQL, [orderId])
  if (!rows.length) return null
  return resolveDestinationFromOrderRow(rows[0])
}

export async function listRestaurantDeliveryLocations(restaurantId) {
  const { rows: restaurantRows } = await query(
    `SELECT id, name, delivery_latitude, delivery_longitude, delivery_location_label, delivery_address_notes
     FROM restaurant WHERE id = $1`,
    [restaurantId]
  )
  if (!restaurantRows.length) throw new NotFoundError('Restaurant not found')

  const { rows: branchRows } = await query(
    `SELECT id, name, code, delivery_latitude, delivery_longitude, delivery_location_label, delivery_address_notes
     FROM branch
     WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
     ORDER BY name ASC`,
    [restaurantId]
  )

  return {
    restaurant: mapDeliveryLocationRow(restaurantRows[0]),
    branches: branchRows.map(mapDeliveryLocationRow),
  }
}

/**
 * Resolve the delivery location for a supplier order. Missing location data
 * remains compatible only when there is one active operational branch (or no
 * branches, where the legacy restaurant address is the only destination).
 */
export async function resolveOrderDeliveryLocation(
  restaurantId,
  requestedBranchId = null,
  dbQuery = query
) {
  const { rows: restaurantRows } = await dbQuery(
    `SELECT id, name, address_json, delivery_latitude, delivery_longitude,
            delivery_location_label, delivery_address_notes
     FROM restaurant WHERE id = $1`,
    [restaurantId]
  )
  if (!restaurantRows.length) throw new NotFoundError('Restaurant not found')

  const { rows: branches } = await dbQuery(
    `SELECT id, name, code, address, delivery_latitude, delivery_longitude,
            delivery_location_label, delivery_address_notes
     FROM branch
     WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
     ORDER BY name ASC, id ASC`,
    [restaurantId]
  )

  let selected = null
  if (requestedBranchId) {
    selected = branches.find((branch) => branch.id === requestedBranchId)
    if (!selected) {
      const error = new ValidationError('Selected delivery location is not available')
      error.code = 'DELIVERY_LOCATION_INVALID'
      throw error
    }
  } else if (branches.length === 1) {
    selected = branches[0]
  } else if (branches.length > 1) {
    const error = new ValidationError(
      'Select a restaurant delivery location before placing this order'
    )
    error.code = 'DELIVERY_LOCATION_REQUIRED'
    error.details = { locationCount: branches.length }
    throw error
  }

  const row = selected || restaurantRows[0]
  const location = mapDeliveryLocationRow(row)
  return {
    branchId: selected?.id || null,
    source: selected ? 'branch' : 'restaurant',
    snapshot: {
      id: location.id,
      type: selected ? 'RESTAURANT_BRANCH' : 'RESTAURANT_ACCOUNT',
      name: location.name,
      code: location.code || null,
      latitude: location.deliveryLatitude,
      longitude: location.deliveryLongitude,
      label: location.deliveryLocationLabel,
      addressNotes: location.deliveryAddressNotes,
      address: selected?.address || row.address_json || null,
    },
  }
}

/**
 * First defined alias wins. Accepts camelCase (web), snake_case (legacy web),
 * and the bare `latitude`/`label`/`addressNotes` shape shipped by mobile clients.
 */
function pickAlias(body, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(body, alias) && body[alias] !== undefined) {
      return body[alias]
    }
  }
  return undefined
}

function parseDeliveryLocationInput(body) {
  const source = body && typeof body === 'object' ? body : {}

  const latitude = pickAlias(source, ['deliveryLatitude', 'delivery_latitude', 'latitude'])
  const longitude = pickAlias(source, ['deliveryLongitude', 'delivery_longitude', 'longitude'])

  const coords =
    latitude !== undefined || longitude !== undefined
      ? validateDeliveryCoordinates(latitude ?? null, longitude ?? null)
      : null

  const label = pickAlias(source, ['deliveryLocationLabel', 'delivery_location_label', 'label'])
  const notes = pickAlias(source, [
    'deliveryAddressNotes',
    'delivery_address_notes',
    'addressNotes',
    'address_notes',
  ])

  if (coords == null && label === undefined && notes === undefined) {
    throw new ValidationError('No delivery location fields to update')
  }

  return { coords, label, notes }
}

export async function updateRestaurantDeliveryLocation(restaurantId, body) {
  const { coords, label, notes } = parseDeliveryLocationInput(body)
  const updates = []
  const values = []
  let idx = 1

  if (coords) {
    updates.push(`delivery_latitude = $${idx++}`)
    values.push(coords.latitude)
    updates.push(`delivery_longitude = $${idx++}`)
    values.push(coords.longitude)
  }
  if (label !== undefined) {
    updates.push(`delivery_location_label = $${idx++}`)
    values.push(label === '' ? null : label)
  }
  if (notes !== undefined) {
    updates.push(`delivery_address_notes = $${idx++}`)
    values.push(notes === '' ? null : notes)
  }

  updates.push('updated_at = NOW()')
  values.push(restaurantId)

  const { rows } = await query(
    `UPDATE restaurant SET ${updates.join(', ')} WHERE id = $${idx}
     RETURNING id, name, delivery_latitude, delivery_longitude, delivery_location_label, delivery_address_notes`,
    values
  )
  if (!rows.length) throw new NotFoundError('Restaurant not found')
  return mapDeliveryLocationRow(rows[0])
}

export async function updateBranchDeliveryLocation(restaurantId, branchId, body) {
  const { rows: owned } = await query(
    `SELECT id FROM branch WHERE id = $1 AND tenant_id = $2 AND COALESCE(is_active, TRUE) = TRUE`,
    [branchId, restaurantId]
  )
  if (!owned.length) throw new NotFoundError('Branch not found')

  const { coords, label, notes } = parseDeliveryLocationInput(body)
  const updates = []
  const values = []
  let idx = 1

  if (coords) {
    updates.push(`delivery_latitude = $${idx++}`)
    values.push(coords.latitude)
    updates.push(`delivery_longitude = $${idx++}`)
    values.push(coords.longitude)
  }
  if (label !== undefined) {
    updates.push(`delivery_location_label = $${idx++}`)
    values.push(label === '' ? null : label)
  }
  if (notes !== undefined) {
    updates.push(`delivery_address_notes = $${idx++}`)
    values.push(notes === '' ? null : notes)
  }

  updates.push('updated_at = NOW()')
  values.push(branchId)

  const { rows } = await query(
    `UPDATE branch SET ${updates.join(', ')} WHERE id = $${idx}
     RETURNING id, name, code, delivery_latitude, delivery_longitude, delivery_location_label, delivery_address_notes`,
    values
  )
  return mapDeliveryLocationRow(rows[0])
}

/** Supplier fulfillment: destination coords only when order belongs to supplier. */
export async function loadOrderDestinationForSupplier(orderId, supplierId) {
  const { rows } = await query(
    `${ORDER_DESTINATION_SQL}
     AND EXISTS (
       SELECT 1 FROM order_item oi
       WHERE oi.order_id = o.id AND oi.supplier_id = $2
     )`,
    [orderId, supplierId]
  )
  if (!rows.length) return null
  return resolveDestinationFromOrderRow(rows[0])
}
