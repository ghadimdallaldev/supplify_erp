import { query } from './db.js'

/** @type {'warehouse' | 'branch' | 'none' | null} */
let cachedDeliveryZoneJoinMode = null

async function resolveDeliveryZoneJoinMode() {
  if (cachedDeliveryZoneJoinMode) return cachedDeliveryZoneJoinMode

  let rows = []
  try {
    const result = await query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'delivery_zone'
        AND column_name IN ('warehouse_id', 'branch_id', 'supplier_id')
      `
    )
    rows = Array.isArray(result?.rows) ? result.rows : []
  } catch {
    // A failed probe must not stick: the next call retries once the database is reachable.
    return 'none'
  }

  const columns = new Set(rows.map((row) => row.column_name))

  if (columns.has('warehouse_id')) {
    cachedDeliveryZoneJoinMode = 'warehouse'
  } else if (columns.has('branch_id')) {
    cachedDeliveryZoneJoinMode = 'branch'
  } else {
    cachedDeliveryZoneJoinMode = 'none'
  }

  return cachedDeliveryZoneJoinMode
}

/**
 * Destination used for zone labels: order snapshot, then branch, then restaurant.
 */
export function buildZoneAddressExprs({
  hasSnapshot = false,
  hasBranchAddress = false,
  hasBranchCoords = false,
  hasRestaurantAddress = false,
  hasRestaurantCoords = false,
} = {}) {
  const postal = []
  const lat = []
  const lng = []
  if (hasSnapshot) {
    postal.push(
      `CASE WHEN jsonb_typeof(o.delivery_location_snapshot->'address') = 'object' THEN COALESCE(
        o.delivery_location_snapshot#>>'{address,postalCode}',
        o.delivery_location_snapshot#>>'{address,postal_code}',
        o.delivery_location_snapshot#>>'{address,zip}'
      ) END`,
      `o.delivery_location_snapshot->>'postalCode'`,
      `o.delivery_location_snapshot->>'postal_code'`,
      `o.delivery_location_snapshot->>'zip'`
    )
    lat.push(
      `NULLIF(o.delivery_location_snapshot->>'latitude', '')`,
      `NULLIF(o.delivery_location_snapshot->>'lat', '')`,
      `NULLIF(o.delivery_location_snapshot->>'deliveryLatitude', '')`
    )
    lng.push(
      `NULLIF(o.delivery_location_snapshot->>'longitude', '')`,
      `NULLIF(o.delivery_location_snapshot->>'lng', '')`,
      `NULLIF(o.delivery_location_snapshot->>'lon', '')`,
      `NULLIF(o.delivery_location_snapshot->>'deliveryLongitude', '')`
    )
  }
  if (hasBranchAddress) {
    postal.push(`b.address->>'postalCode'`, `b.address->>'postal_code'`, `b.address->>'zip'`)
  }
  if (hasBranchCoords) {
    lat.push(`NULLIF(b.delivery_latitude::text, '')`)
    lng.push(`NULLIF(b.delivery_longitude::text, '')`)
  }
  if (hasRestaurantCoords) {
    lat.push(`NULLIF(r.delivery_latitude::text, '')`)
    lng.push(`NULLIF(r.delivery_longitude::text, '')`)
  }
  if (hasRestaurantAddress) {
    postal.push(
      `r.address_json->>'postalCode'`,
      `r.address_json->>'postal_code'`,
      `r.address_json->>'zip'`
    )
    lat.push(`NULLIF(r.address_json->>'lat', '')`, `NULLIF(r.address_json->>'latitude', '')`)
    lng.push(
      `NULLIF(r.address_json->>'lng', '')`,
      `NULLIF(r.address_json->>'lon', '')`,
      `NULLIF(r.address_json->>'longitude', '')`
    )
  }
  const coalesce = (parts) => (parts.length ? `COALESCE(${parts.join(', ')}, '')` : `''`)
  return {
    postalExpr: coalesce(postal),
    latExpr: coalesce(lat),
    lngExpr: coalesce(lng),
  }
}

/** Route-stop queries always join order `o`, branch `b`, and restaurant `r`. */
export const {
  postalExpr: ROUTE_ZONE_POSTAL_EXPR,
  latExpr: ROUTE_ZONE_LAT_EXPR,
  lngExpr: ROUTE_ZONE_LNG_EXPR,
} = buildZoneAddressExprs({
  hasSnapshot: true,
  hasBranchAddress: true,
  hasBranchCoords: true,
  hasRestaurantAddress: true,
  hasRestaurantCoords: true,
})

/**
 * Match a warehouse zone to the delivery destination.
 * Postal codes ignore spaces and case, and a district prefix matches at a token boundary. Radius uses the zone center.
 * A zone that merely belongs to the warehouse is not a match.
 */
export function deliveryZoneAddressMatchSql({
  postalExpr = ROUTE_ZONE_POSTAL_EXPR,
  latExpr = ROUTE_ZONE_LAT_EXPR,
  lngExpr = ROUTE_ZONE_LNG_EXPR,
} = {}) {
  return `
  AND (
    (
      dz.zone_type = 'postal_codes'
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(dz.postal_codes, ARRAY[]::text[])) AS code
        WHERE upper(regexp_replace(btrim(code), '\\s+', '', 'g')) <> ''
          AND (
            upper(regexp_replace(btrim(code), '\\s+', '', 'g')) = upper(regexp_replace(
              COALESCE(${postalExpr}, ''),
              '\\s+',
              '',
              'g'
            ))
            OR upper(regexp_replace(btrim(COALESCE(${postalExpr}, '')), '\\s+', ' ', 'g'))
              LIKE upper(regexp_replace(btrim(code), '\\s+', ' ', 'g')) || ' %'
            OR (
              substring(
                upper(regexp_replace(COALESCE(${postalExpr}, ''), '\\s+', '', 'g'))
                from '^([A-Z]{1,2}[0-9][A-Z0-9]?)[0-9][A-Z]{2}$'
              ) IS NOT NULL
              AND (
                upper(regexp_replace(btrim(code), '\\s+', '', 'g')) = substring(
                  upper(regexp_replace(COALESCE(${postalExpr}, ''), '\\s+', '', 'g'))
                  from '^([A-Z]{1,2}[0-9][A-Z0-9]?)[0-9][A-Z]{2}$'
                )
                OR (
                  substring(
                    upper(regexp_replace(COALESCE(${postalExpr}, ''), '\\s+', '', 'g'))
                    from '^([A-Z]{1,2}[0-9][A-Z0-9]?)[0-9][A-Z]{2}$'
                  ) LIKE upper(regexp_replace(btrim(code), '\\s+', '', 'g')) || '%'
                  AND substring(
                    substring(
                      upper(regexp_replace(COALESCE(${postalExpr}, ''), '\\s+', '', 'g'))
                      from '^([A-Z]{1,2}[0-9][A-Z0-9]?)[0-9][A-Z]{2}$'
                    )
                    from length(upper(regexp_replace(btrim(code), '\\s+', '', 'g'))) + 1
                    for 1
                  ) ~ '^[A-Z]'
                )
              )
            )
          )
      )
    )
    OR (
      dz.zone_type = 'radius'
      AND dz.center_lat IS NOT NULL
      AND dz.center_lng IS NOT NULL
      AND dz.radius_km IS NOT NULL
      AND COALESCE(${latExpr}, '') ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$'
      AND COALESCE(${lngExpr}, '') ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$'
      AND (
        6371 * acos(LEAST(1::float8, GREATEST(-1::float8,
          cos(radians(dz.center_lat::float8))
            * cos(radians((${latExpr})::float8))
            * cos(radians((${lngExpr})::float8) - radians(dz.center_lng::float8))
          + sin(radians(dz.center_lat::float8))
            * sin(radians((${latExpr})::float8))
        )))
      ) <= dz.radius_km
    )
  )`
}

export function warehouseZoneLateralSql({
  supplierClause = '',
  activeClause = ' AND COALESCE(dz.is_active, TRUE) = TRUE',
  postalExpr = ROUTE_ZONE_POSTAL_EXPR,
  latExpr = ROUTE_ZONE_LAT_EXPR,
  lngExpr = ROUTE_ZONE_LNG_EXPR,
} = {}) {
  return `LEFT JOIN LATERAL (
      SELECT dz.name
      FROM delivery_zone dz
      WHERE dz.warehouse_id = owa.warehouse_id${activeClause}${supplierClause}
        ${deliveryZoneAddressMatchSql({ postalExpr, latExpr, lngExpr })}
      ORDER BY CASE dz.zone_type WHEN 'postal_codes' THEN 0 WHEN 'radius' THEN 1 ELSE 2 END,
               dz.updated_at DESC NULLS LAST
      LIMIT 1
    ) dz ON TRUE`
}

/** Branch zones use the same destination match as warehouse zones. */
export function branchZoneLateralSql({
  postalExpr = ROUTE_ZONE_POSTAL_EXPR,
  latExpr = ROUTE_ZONE_LAT_EXPR,
  lngExpr = ROUTE_ZONE_LNG_EXPR,
} = {}) {
  return `LEFT JOIN LATERAL (
      SELECT dz.name
      FROM delivery_zone dz
      WHERE dz.branch_id = o.branch_id
        AND COALESCE(dz.is_active, TRUE) = TRUE
        ${deliveryZoneAddressMatchSql({ postalExpr, latExpr, lngExpr })}
      ORDER BY CASE dz.zone_type WHEN 'postal_codes' THEN 0 WHEN 'radius' THEN 1 ELSE 2 END,
               dz.updated_at DESC NULLS LAST
      LIMIT 1
    ) dz ON TRUE`
}

/**
 * SQL fragment for joining delivery_zone to customer_order rows.
 * Supports supplier warehouse zones and consumer branch zones.
 */
export async function getDeliveryZoneJoinSql({ supplierParam } = {}) {
  const mode = await resolveDeliveryZoneJoinMode()

  if (mode === 'warehouse') {
    const supplierClause = supplierParam ? ` AND dz.supplier_id = ${supplierParam}` : ''
    return warehouseZoneLateralSql({ supplierClause })
  }

  if (mode === 'branch') {
    return branchZoneLateralSql()
  }

  return `LEFT JOIN delivery_zone dz ON FALSE`
}

/** Reset cached schema mode after DDL (startup ensure / tests). */
export function resetDeliveryZoneJoinCache() {
  cachedDeliveryZoneJoinMode = null
}

/** @deprecated use resetDeliveryZoneJoinCache */
export function resetDeliveryZoneJoinCacheForTests() {
  resetDeliveryZoneJoinCache()
}
