import { query } from '../lib/db.js'
import { getCache, setCache, deleteCache } from '../lib/cache.js'

const MENU_CACHE_TTL_SECONDS = 300

function isUuid(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return typeof str === 'string' && uuidRegex.test(str)
}

export function menuCacheKey(restaurantId, branchId) {
  return `consumer:menu:${restaurantId}:${branchId || 'all'}`
}

export async function resolveRestaurantBySlug(slugOrId) {
  const byId = isUuid(slugOrId)
  const { rows } = await query(
    byId
      ? `SELECT id, slug, name, phone FROM restaurant WHERE id = $1`
      : `SELECT id, slug, name, phone FROM restaurant WHERE slug = $1`,
    [slugOrId]
  )
  return rows[0] || null
}

export async function invalidateMenuCache(restaurantId, branchId = null) {
  await deleteCache(menuCacheKey(restaurantId, branchId)).catch(() => {})
  await deleteCache(menuCacheKey(restaurantId, null)).catch(() => {})
}

async function loadMenuFromDb(restaurantId, branchId) {
  const params = [restaurantId]
  let branchFilter = ''
  if (branchId) {
    params.push(branchId)
    branchFilter = `AND (c.branch_id IS NULL OR c.branch_id = $2)`
  }

  const { rows: categories } = await query(
    `
    SELECT c.*
    FROM menu_category c
    WHERE c.restaurant_id = $1
      AND c.is_active = TRUE
      ${branchFilter}
    ORDER BY c.sort_order, c.name
    `,
    params
  )

  if (!categories.length) {
    return { categories: [] }
  }

  const categoryIds = categories.map((c) => c.id)
  const itemParams = [restaurantId, categoryIds]
  let itemBranchFilter = ''
  if (branchId) {
    itemParams.push(branchId)
    itemBranchFilter = `AND (i.branch_id IS NULL OR i.branch_id = $3)`
  }

  const { rows: items } = await query(
    `
    SELECT i.*
    FROM menu_item i
    WHERE i.restaurant_id = $1
      AND i.category_id = ANY($2::uuid[])
      AND i.is_available = TRUE
      ${itemBranchFilter}
    ORDER BY i.sort_order, i.name
    `,
    itemParams
  )

  const itemIds = items.map((i) => i.id)
  let modifierGroups = []
  let modifierOptions = []

  if (itemIds.length) {
    const { rows: groups } = await query(
      `
      SELECT g.*
      FROM menu_modifier_group g
      WHERE g.menu_item_id = ANY($1::uuid[])
      ORDER BY g.sort_order, g.name
      `,
      [itemIds]
    )
    modifierGroups = groups

    if (groups.length) {
      const groupIds = groups.map((g) => g.id)
      const { rows: options } = await query(
        `
        SELECT o.*
        FROM menu_modifier_option o
        WHERE o.modifier_group_id = ANY($1::uuid[])
          AND o.is_available = TRUE
        ORDER BY o.sort_order, o.name
        `,
        [groupIds]
      )
      modifierOptions = options
    }
  }

  const optionsByGroup = modifierOptions.reduce((acc, opt) => {
    if (!acc[opt.modifier_group_id]) acc[opt.modifier_group_id] = []
    acc[opt.modifier_group_id].push(opt)
    return acc
  }, {})

  const groupsByItem = modifierGroups.reduce((acc, group) => {
    if (!acc[group.menu_item_id]) acc[group.menu_item_id] = []
    acc[group.menu_item_id].push({
      ...group,
      options: optionsByGroup[group.id] || [],
    })
    return acc
  }, {})

  const itemsByCategory = items.reduce((acc, item) => {
    if (!acc[item.category_id]) acc[item.category_id] = []
    acc[item.category_id].push({
      ...item,
      modifierGroups: groupsByItem[item.id] || [],
    })
    return acc
  }, {})

  return {
    categories: categories.map((cat) => ({
      ...cat,
      items: itemsByCategory[cat.id] || [],
    })),
  }
}

export async function getPublicMenu(restaurantId, branchId = null) {
  const cacheKey = menuCacheKey(restaurantId, branchId)
  const cached = await getCache(cacheKey)
  if (cached) return cached

  const menu = await loadMenuFromDb(restaurantId, branchId)
  await setCache(cacheKey, menu, MENU_CACHE_TTL_SECONDS).catch(() => {})
  return menu
}

export async function getAdminMenu(restaurantId, branchId = null) {
  const params = [restaurantId]
  let branchFilter = ''
  if (branchId) {
    params.push(branchId)
    branchFilter = `AND (c.branch_id IS NULL OR c.branch_id = $2)`
  }

  const { rows: categories } = await query(
    `
    SELECT c.*
    FROM menu_category c
    WHERE c.restaurant_id = $1
      ${branchFilter}
    ORDER BY c.sort_order, c.name
    `,
    params
  )

  const categoryIds = categories.map((c) => c.id)
  if (!categoryIds.length) return { categories: [] }

  const itemParams = [restaurantId, categoryIds]
  let itemBranchFilter = ''
  if (branchId) {
    itemParams.push(branchId)
    itemBranchFilter = `AND (i.branch_id IS NULL OR i.branch_id = $3)`
  }

  const { rows: items } = await query(
    `
    SELECT i.*
    FROM menu_item i
    WHERE i.restaurant_id = $1
      AND i.category_id = ANY($2::uuid[])
      ${itemBranchFilter}
    ORDER BY i.sort_order, i.name
    `,
    itemParams
  )

  const itemIds = items.map((i) => i.id)
  let modifierGroups = []
  let modifierOptions = []

  if (itemIds.length) {
    const { rows: groups } = await query(
      `
      SELECT g.*
      FROM menu_modifier_group g
      WHERE g.menu_item_id = ANY($1::uuid[])
      ORDER BY g.sort_order, g.name
      `,
      [itemIds]
    )
    modifierGroups = groups

    if (groups.length) {
      const groupIds = groups.map((g) => g.id)
      const { rows: options } = await query(
        `
        SELECT o.*
        FROM menu_modifier_option o
        WHERE o.modifier_group_id = ANY($1::uuid[])
        ORDER BY o.sort_order, o.name
        `,
        [groupIds]
      )
      modifierOptions = options
    }
  }

  const optionsByGroup = modifierOptions.reduce((acc, opt) => {
    if (!acc[opt.modifier_group_id]) acc[opt.modifier_group_id] = []
    acc[opt.modifier_group_id].push(opt)
    return acc
  }, {})

  const groupsByItem = modifierGroups.reduce((acc, group) => {
    if (!acc[group.menu_item_id]) acc[group.menu_item_id] = []
    acc[group.menu_item_id].push({
      ...group,
      options: optionsByGroup[group.id] || [],
    })
    return acc
  }, {})

  const itemsByCategory = items.reduce((acc, item) => {
    if (!acc[item.category_id]) acc[item.category_id] = []
    acc[item.category_id].push({
      ...item,
      modifierGroups: groupsByItem[item.id] || [],
    })
    return acc
  }, {})

  return {
    categories: categories.map((cat) => ({
      ...cat,
      items: itemsByCategory[cat.id] || [],
    })),
  }
}

export async function createModifierGroup(restaurantId, payload) {
  const { menuItemId, name, minSelections, maxSelections, isRequired, sortOrder } = payload
  const { rows: items } = await query(
    `SELECT id, branch_id FROM menu_item WHERE id = $1 AND restaurant_id = $2`,
    [menuItemId, restaurantId]
  )
  if (!items.length) {
    throw Object.assign(new Error('Menu item not found'), { name: 'ITEM_NOT_FOUND' })
  }

  const { rows } = await query(
    `
    INSERT INTO menu_modifier_group (
      restaurant_id, menu_item_id, name, min_selections, max_selections, is_required, sort_order
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [
      restaurantId,
      menuItemId,
      name,
      minSelections ?? 0,
      maxSelections ?? 1,
      isRequired ?? false,
      sortOrder ?? 0,
    ]
  )
  await invalidateMenuCache(restaurantId, items[0].branch_id)
  return rows[0]
}

export async function updateModifierGroup(restaurantId, groupId, payload) {
  const { rows } = await query(
    `
    UPDATE menu_modifier_group g
    SET
      name = COALESCE($1, g.name),
      min_selections = COALESCE($2, g.min_selections),
      max_selections = COALESCE($3, g.max_selections),
      is_required = COALESCE($4, g.is_required),
      sort_order = COALESCE($5, g.sort_order),
      updated_at = now()
    FROM menu_item i
    WHERE g.id = $6
      AND g.menu_item_id = i.id
      AND g.restaurant_id = $7
    RETURNING g.*, i.branch_id
    `,
    [
      payload.name ?? null,
      payload.minSelections ?? null,
      payload.maxSelections ?? null,
      payload.isRequired ?? null,
      payload.sortOrder ?? null,
      groupId,
      restaurantId,
    ]
  )
  if (!rows.length) {
    throw Object.assign(new Error('Modifier group not found'), { name: 'MODIFIER_GROUP_NOT_FOUND' })
  }
  await invalidateMenuCache(restaurantId, rows[0].branch_id)
  return rows[0]
}

export async function deleteModifierGroup(restaurantId, groupId) {
  const { rows } = await query(
    `
    DELETE FROM menu_modifier_group g
    USING menu_item i
    WHERE g.id = $1
      AND g.menu_item_id = i.id
      AND g.restaurant_id = $2
    RETURNING g.*, i.branch_id
    `,
    [groupId, restaurantId]
  )
  if (!rows.length) {
    throw Object.assign(new Error('Modifier group not found'), { name: 'MODIFIER_GROUP_NOT_FOUND' })
  }
  await invalidateMenuCache(restaurantId, rows[0].branch_id)
  return true
}

export async function createModifierOption(restaurantId, payload) {
  const { modifierGroupId, name, priceDelta, sortOrder, isAvailable } = payload
  const { rows: groups } = await query(
    `
    SELECT g.id, i.branch_id
    FROM menu_modifier_group g
    JOIN menu_item i ON i.id = g.menu_item_id
    WHERE g.id = $1 AND g.restaurant_id = $2
    `,
    [modifierGroupId, restaurantId]
  )
  if (!groups.length) {
    throw Object.assign(new Error('Modifier group not found'), { name: 'MODIFIER_GROUP_NOT_FOUND' })
  }

  const { rows } = await query(
    `
    INSERT INTO menu_modifier_option (modifier_group_id, name, price_delta, sort_order, is_available)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [modifierGroupId, name, priceDelta ?? 0, sortOrder ?? 0, isAvailable ?? true]
  )
  await invalidateMenuCache(restaurantId, groups[0].branch_id)
  return rows[0]
}

export async function updateModifierOption(restaurantId, optionId, payload) {
  const { rows } = await query(
    `
    UPDATE menu_modifier_option o
    SET
      name = COALESCE($1, o.name),
      price_delta = COALESCE($2, o.price_delta),
      sort_order = COALESCE($3, o.sort_order),
      is_available = COALESCE($4, o.is_available),
      updated_at = now()
    FROM menu_modifier_group g
    JOIN menu_item i ON i.id = g.menu_item_id
    WHERE o.id = $5
      AND o.modifier_group_id = g.id
      AND g.restaurant_id = $6
    RETURNING o.*, i.branch_id
    `,
    [
      payload.name ?? null,
      payload.priceDelta ?? null,
      payload.sortOrder ?? null,
      payload.isAvailable ?? null,
      optionId,
      restaurantId,
    ]
  )
  if (!rows.length) {
    throw Object.assign(new Error('Modifier option not found'), {
      name: 'MODIFIER_OPTION_NOT_FOUND',
    })
  }
  await invalidateMenuCache(restaurantId, rows[0].branch_id)
  return rows[0]
}

export async function deleteModifierOption(restaurantId, optionId) {
  const { rows } = await query(
    `
    DELETE FROM menu_modifier_option o
    USING menu_modifier_group g, menu_item i
    WHERE o.id = $1
      AND o.modifier_group_id = g.id
      AND g.menu_item_id = i.id
      AND g.restaurant_id = $2
    RETURNING o.*, i.branch_id
    `,
    [optionId, restaurantId]
  )
  if (!rows.length) {
    throw Object.assign(new Error('Modifier option not found'), {
      name: 'MODIFIER_OPTION_NOT_FOUND',
    })
  }
  await invalidateMenuCache(restaurantId, rows[0].branch_id)
  return true
}

export async function getFulfillmentOptions(restaurantId, branchId) {
  const { rows: branches } = await query(
    `
    SELECT b.id, b.name, b.code
    FROM branch b
    WHERE b.tenant_id = $1
      AND b.is_active = TRUE
      ${branchId ? 'AND b.id = $2' : ''}
    ORDER BY b.name
    `,
    branchId ? [restaurantId, branchId] : [restaurantId]
  )

  if (!branches.length) {
    return { branches: [] }
  }

  const branchIds = branches.map((b) => b.id)
  const { rows: configs } = await query(
    `
    SELECT *
    FROM branch_fulfillment_config
    WHERE branch_id = ANY($1::uuid[])
    `,
    [branchIds]
  )
  const configByBranch = Object.fromEntries(configs.map((c) => [c.branch_id, c]))

  const { rows: zones } = await query(
    `
    SELECT *
    FROM delivery_zone
    WHERE branch_id = ANY($1::uuid[])
      AND is_active = TRUE
    ORDER BY name
    `,
    [branchIds]
  )
  const zonesByBranch = zones.reduce((acc, zone) => {
    if (!acc[zone.branch_id]) acc[zone.branch_id] = []
    acc[zone.branch_id].push(zone)
    return acc
  }, {})

  return {
    branches: branches.map((branch) => {
      const config = configByBranch[branch.id]
      return {
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code,
        deliveryEnabled: config?.delivery_enabled ?? false,
        takeawayEnabled: config?.takeaway_enabled ?? true,
        dineInEnabled: config?.dine_in_enabled ?? true,
        minOrderAmount: Number(config?.min_order_amount ?? 0),
        deliveryFee: Number(config?.delivery_fee ?? 0),
        estimatedPrepMinutes: config?.estimated_prep_minutes ?? 30,
        deliveryZones: zonesByBranch[branch.id] || [],
      }
    }),
  }
}
