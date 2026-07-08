import { query, withTransaction } from '../lib/db.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'

const PICK_ELIGIBLE_ORDER_STATUSES = ['ACKNOWLEDGED', 'PROCESSING', 'SHIPPED']
const ACTIVE_WAVE_STATUSES = ['PENDING', 'PICKING']

function todayDateString() {
  return new Date().toISOString().slice(0, 10)
}

async function nextWaveNumber(supplierId, scheduledDate, client) {
  const db = client ? (sql, p) => client.query(sql, p) : query
  const { rows } = await db(
    `
    SELECT COUNT(*)::int AS n
    FROM delivery_wave
    WHERE supplier_id = $1 AND scheduled_date = $2::date
    `,
    [supplierId, scheduledDate]
  )
  const seq = (rows[0]?.n ?? 0) + 1
  const datePart = String(scheduledDate).replace(/-/g, '')
  return `W-${datePart}-${String(seq).padStart(3, '0')}`
}

async function assertWaveAccess(supplierId, waveId) {
  const { rows } = await query(`SELECT * FROM delivery_wave WHERE id = $1 AND supplier_id = $2`, [
    waveId,
    supplierId,
  ])
  if (!rows.length) throw new NotFoundError('Wave not found')
  return rows[0]
}

async function assertPickListAccess(supplierId, pickListId) {
  const { rows } = await query(
    `
    SELECT pl.*, dw.supplier_id, dw.id AS wave_id, dw.status AS wave_status
    FROM pick_list pl
    JOIN delivery_wave dw ON dw.id = pl.wave_id
    WHERE pl.id = $1 AND dw.supplier_id = $2
    `,
    [pickListId, supplierId]
  )
  if (!rows.length) throw new NotFoundError('Pick list not found')
  return rows[0]
}

function mapWaveSummary(row) {
  return {
    id: row.id,
    waveNumber: row.wave_number,
    scheduledDate: row.scheduled_date,
    status: row.status,
    pickListCount: row.pick_list_count ?? 0,
    orderCount: row.order_count ?? 0,
    itemCount: row.item_count ?? 0,
    itemsPicked: row.items_picked ?? 0,
    createdAt: row.created_at,
  }
}

function mapPickListItem(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku,
    orderItemId: row.order_item_id,
    quantityOrdered: parseFloat(row.quantity_ordered) || 0,
    quantityPicked: row.quantity_picked != null ? parseFloat(row.quantity_picked) : null,
    locationCode: row.location_code,
    notes: row.notes,
  }
}

function mapPickList(row, items = []) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderLabel: row.order_id ? String(row.order_id).slice(0, 8).toUpperCase() : null,
    restaurantName: row.restaurant_name,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
    status: row.status,
    pickedAt: row.picked_at,
    itemCount: items.length,
    itemsPicked: items.filter((i) => i.quantityPicked != null).length,
    items,
  }
}

async function loadWavePickLists(waveId) {
  const { rows: pickLists } = await query(
    `
    SELECT
      pl.*,
      r.name AS restaurant_name,
      w.name AS warehouse_name
    FROM pick_list pl
    JOIN customer_order o ON o.id = pl.order_id
    JOIN restaurant r ON r.id = o.restaurant_id
    LEFT JOIN warehouse w ON w.id = pl.warehouse_id
    WHERE pl.wave_id = $1
    ORDER BY pl.created_at
    `,
    [waveId]
  )

  if (!pickLists.length) return []

  const pickListIds = pickLists.map((pl) => pl.id)
  const { rows: itemRows } = await query(
    `
    SELECT
      pli.*,
      p.name AS product_name,
      p.sku AS product_sku
    FROM pick_list_item pli
    JOIN product p ON p.id = pli.product_id
    WHERE pli.pick_list_id = ANY($1::uuid[])
    ORDER BY p.name
    `,
    [pickListIds]
  )

  const itemsByList = new Map()
  for (const row of itemRows) {
    const list = itemsByList.get(row.pick_list_id) ?? []
    list.push(mapPickListItem(row))
    itemsByList.set(row.pick_list_id, list)
  }

  return pickLists.map((pl) => mapPickList(pl, itemsByList.get(pl.id) ?? []))
}

async function resolveEligibleOrderIds(supplierId, { scheduledDate, warehouseId, orderIds }) {
  if (orderIds?.length) {
    const { rows } = await query(
      `
      SELECT DISTINCT o.id
      FROM customer_order o
      JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
      WHERE o.id = ANY($2::uuid[])
        AND o.status = ANY($3::order_status[])
      `,
      [supplierId, orderIds, PICK_ELIGIBLE_ORDER_STATUSES]
    )
    const found = new Set(rows.map((r) => r.id))
    const missing = orderIds.filter((id) => !found.has(id))
    if (missing.length) {
      throw new ValidationError('One or more orders are not eligible for picking')
    }
    return orderIds
  }

  const params = [supplierId, scheduledDate, PICK_ELIGIBLE_ORDER_STATUSES, ACTIVE_WAVE_STATUSES]
  let warehouseClause = ''
  if (warehouseId) {
    params.push(warehouseId)
    warehouseClause = ` AND EXISTS (
      SELECT 1 FROM order_warehouse_assignment owa
      WHERE owa.order_id = o.id AND owa.warehouse_id = $${params.length}
    )`
  }

  const { rows } = await query(
    `
    SELECT DISTINCT o.id
    FROM customer_order o
    JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
    WHERE o.status = ANY($3::order_status[])
      AND NOT EXISTS (
        SELECT 1
        FROM pick_list pl
        JOIN delivery_wave dw ON dw.id = pl.wave_id
        WHERE pl.order_id = o.id
          AND dw.supplier_id = $1
          AND dw.scheduled_date = $2::date
          AND dw.status = ANY($4::text[])
      )
      ${warehouseClause}
    ORDER BY o.created_at
    `,
    params
  )

  return rows.map((r) => r.id)
}

async function loadOrderItemsForPicking(supplierId, orderId, warehouseId) {
  const params = [orderId, supplierId]
  let warehouseClause = ''
  if (warehouseId) {
    warehouseClause = ' AND (owa.warehouse_id = $3 OR owa.warehouse_id IS NULL)'
    params.push(warehouseId)
  }

  const { rows } = await query(
    `
    SELECT
      oi.id,
      oi.product_id,
      oi.quantity,
      owa.warehouse_id
    FROM order_item oi
    LEFT JOIN order_warehouse_assignment owa ON owa.order_item_id = oi.id
    WHERE oi.order_id = $1 AND oi.supplier_id = $2
      ${warehouseClause}
    ORDER BY oi.id
    `,
    params
  )
  return rows
}

export async function generateWave(supplierId, { date, warehouseId, orderIds } = {}) {
  const scheduledDate = date || todayDateString()
  const eligibleOrderIds = await resolveEligibleOrderIds(supplierId, {
    scheduledDate,
    warehouseId,
    orderIds,
  })

  if (!eligibleOrderIds.length) {
    throw new ValidationError('No eligible orders found for wave generation')
  }

  const wave = await withTransaction(async (client) => {
    const waveNumber = await nextWaveNumber(supplierId, scheduledDate, client)
    const { rows: waveRows } = await client.query(
      `
      INSERT INTO delivery_wave (supplier_id, wave_number, scheduled_date, status)
      VALUES ($1, $2, $3::date, 'PICKING')
      RETURNING *
      `,
      [supplierId, waveNumber, scheduledDate]
    )
    const createdWave = waveRows[0]

    for (const orderId of eligibleOrderIds) {
      const items = await loadOrderItemsForPicking(supplierId, orderId, warehouseId)
      if (!items.length) {
        throw new ValidationError(`Order ${orderId.slice(0, 8)} has no pickable line items`)
      }

      const orderWarehouseId =
        warehouseId || items.find((i) => i.warehouse_id)?.warehouse_id || null

      const { rows: pickListRows } = await client.query(
        `
        INSERT INTO pick_list (wave_id, order_id, warehouse_id, status)
        VALUES ($1, $2, $3, 'PENDING')
        RETURNING *
        `,
        [createdWave.id, orderId, orderWarehouseId]
      )
      const pickList = pickListRows[0]

      for (const item of items) {
        await client.query(
          `
          INSERT INTO pick_list_item (
            pick_list_id, product_id, order_item_id, quantity_ordered, quantity_picked
          ) VALUES ($1, $2, $3, $4, NULL)
          `,
          [pickList.id, item.product_id, item.id, item.quantity]
        )
      }

      if (orderWarehouseId) {
        await client.query(
          `
          UPDATE order_warehouse_assignment
          SET status = 'picking', notes = COALESCE(notes, '')
          WHERE order_id = $1 AND warehouse_id = $2 AND status = 'pending'
          `,
          [orderId, orderWarehouseId]
        )
      }
    }

    return createdWave
  })

  const pickLists = await loadWavePickLists(wave.id)
  return {
    ...mapWaveSummary({
      ...wave,
      pick_list_count: pickLists.length,
      order_count: pickLists.length,
      item_count: pickLists.reduce((n, pl) => n + pl.itemCount, 0),
      items_picked: 0,
    }),
    pickLists,
  }
}

export async function listWaves(supplierId, date) {
  const scheduledDate = date || todayDateString()
  const { rows } = await query(
    `
    SELECT
      dw.*,
      COUNT(DISTINCT pl.id)::int AS pick_list_count,
      COUNT(DISTINCT pl.order_id)::int AS order_count,
      COUNT(pli.id)::int AS item_count,
      COUNT(pli.id) FILTER (WHERE pli.quantity_picked IS NOT NULL)::int AS items_picked
    FROM delivery_wave dw
    LEFT JOIN pick_list pl ON pl.wave_id = dw.id
    LEFT JOIN pick_list_item pli ON pli.pick_list_id = pl.id
    WHERE dw.supplier_id = $1 AND dw.scheduled_date = $2::date
    GROUP BY dw.id
    ORDER BY dw.created_at DESC
    `,
    [supplierId, scheduledDate]
  )
  return rows.map(mapWaveSummary)
}

export async function getWave(waveId, supplierId) {
  const wave = await assertWaveAccess(supplierId, waveId)
  const pickLists = await loadWavePickLists(waveId)
  return {
    ...mapWaveSummary({
      ...wave,
      pick_list_count: pickLists.length,
      order_count: pickLists.length,
      item_count: pickLists.reduce((n, pl) => n + pl.itemCount, 0),
      items_picked: pickLists.reduce((n, pl) => n + pl.itemsPicked, 0),
    }),
    pickLists,
  }
}

export async function updatePickListItem(
  supplierId,
  pickListId,
  itemId,
  { quantityPicked, notes } = {}
) {
  const pickList = await assertPickListAccess(supplierId, pickListId)
  if (!['PENDING', 'IN_PROGRESS', 'PICKING'].includes(pickList.wave_status)) {
    throw new ValidationError('Wave is no longer open for picking')
  }
  if (pickList.status === 'COMPLETED') {
    throw new ValidationError('Pick list is already completed')
  }

  const { rows: itemRows } = await query(
    `SELECT * FROM pick_list_item WHERE id = $1 AND pick_list_id = $2`,
    [itemId, pickListId]
  )
  if (!itemRows.length) throw new NotFoundError('Pick list item not found')
  const item = itemRows[0]

  if (quantityPicked != null) {
    const qty = Number(quantityPicked)
    if (!Number.isFinite(qty) || qty < 0) {
      throw new ValidationError('quantityPicked must be a non-negative number')
    }
    if (qty > parseFloat(item.quantity_ordered)) {
      throw new ValidationError('quantityPicked cannot exceed quantity ordered')
    }
  }

  const { rows: updatedRows } = await query(
    `
    UPDATE pick_list_item
    SET
      quantity_picked = COALESCE($3, quantity_picked),
      notes = COALESCE($4, notes)
    WHERE id = $1 AND pick_list_id = $2
    RETURNING *
    `,
    [itemId, pickListId, quantityPicked ?? null, notes ?? null]
  )

  if (pickList.status === 'PENDING') {
    await query(`UPDATE pick_list SET status = 'IN_PROGRESS', updated_at = now() WHERE id = $1`, [
      pickListId,
    ])
  }
  if (pickList.wave_status === 'PENDING') {
    await query(`UPDATE delivery_wave SET status = 'PICKING', updated_at = now() WHERE id = $1`, [
      pickList.wave_id,
    ])
  }

  const { rows: productRows } = await query(
    `SELECT name AS product_name, sku AS product_sku FROM product WHERE id = $1`,
    [updatedRows[0].product_id]
  )

  return mapPickListItem({ ...updatedRows[0], ...productRows[0] })
}

export async function completeWave(waveId, supplierId) {
  const wave = await assertWaveAccess(supplierId, waveId)
  if (!ACTIVE_WAVE_STATUSES.includes(wave.status)) {
    throw new ValidationError('Wave is not open for completion')
  }

  const { rows: incomplete } = await query(
    `
    SELECT COUNT(*)::int AS n
    FROM pick_list pl
    JOIN pick_list_item pli ON pli.pick_list_id = pl.id
    WHERE pl.wave_id = $1 AND pli.quantity_picked IS NULL
    `,
    [waveId]
  )
  if ((incomplete[0]?.n ?? 0) > 0) {
    throw new ValidationError('All pick lines must have a picked quantity before completing')
  }

  await withTransaction(async (client) => {
    await client.query(
      `
      UPDATE pick_list
      SET status = 'COMPLETED', picked_at = now(), updated_at = now()
      WHERE wave_id = $1
      `,
      [waveId]
    )
    await client.query(
      `
      UPDATE delivery_wave
      SET status = 'PICKED', updated_at = now()
      WHERE id = $1
      `,
      [waveId]
    )
    await client.query(
      `
      UPDATE order_warehouse_assignment owa
      SET status = 'packed'
      FROM pick_list pl
      WHERE pl.wave_id = $1
        AND owa.order_id = pl.order_id
        AND owa.status IN ('pending', 'picking')
      `,
      [waveId]
    )
  })

  return getWave(waveId, supplierId)
}
