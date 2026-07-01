import { query } from '../lib/db.js'

/** Built-in metric conversions (normalized unit keys). */
const BUILTIN_CONVERSIONS = new Map([
  ['kg|g', 1000],
  ['g|kg', 0.001],
  ['l|ml', 1000],
  ['liter|ml', 1000],
  ['litre|ml', 1000],
  ['ml|l', 0.001],
  ['ml|liter', 0.001],
  ['ml|litre', 0.001],
])

/**
 * Normalize unit label for comparison.
 * @param {string | null | undefined} unit
 */
export function normalizeUnit(unit) {
  if (!unit) return ''
  return String(unit).trim().toLowerCase().replace(/\s+/g, '').replace(/s$/, '')
}

/**
 * @param {string} fromUnit
 * @param {string} toUnit
 * @returns {number | null}
 */
export function getBuiltinConversionFactor(fromUnit, toUnit) {
  const from = normalizeUnit(fromUnit)
  const to = normalizeUnit(toUnit)
  if (!from || !to) return null
  if (from === to) return 1
  return BUILTIN_CONVERSIONS.get(`${from}|${to}`) ?? null
}

/**
 * Resolve conversion factor from recipe unit to purchase unit.
 * @param {{
 *   restaurantId: string,
 *   fromUnit: string,
 *   toUnit: string,
 *   manualFactor?: number | null,
 * }} params
 * @param {Function} [dbQuery]
 * @returns {Promise<{ factor: number | null, missing: boolean, source: string | null }>}
 */
export async function resolveConversionFactor(
  { restaurantId, fromUnit, toUnit, manualFactor },
  dbQuery = query
) {
  const from = normalizeUnit(fromUnit)
  const to = normalizeUnit(toUnit)
  if (!from || !to) {
    return { factor: null, missing: true, source: null }
  }
  if (from === to) {
    return { factor: 1, missing: false, source: 'identity' }
  }
  if (manualFactor != null && Number(manualFactor) > 0) {
    return { factor: Number(manualFactor), missing: false, source: 'manual' }
  }
  const builtin = getBuiltinConversionFactor(from, to)
  if (builtin != null) {
    return { factor: builtin, missing: false, source: 'builtin' }
  }
  const { rows } = await dbQuery(
    `
    SELECT factor FROM recipe_unit_conversions
    WHERE restaurant_id = $1 AND from_unit = $2 AND to_unit = $3
    LIMIT 1
    `,
    [restaurantId, from, to]
  )
  if (rows.length && rows[0].factor != null) {
    return { factor: Number(rows[0].factor), missing: false, source: 'custom' }
  }
  return { factor: null, missing: true, source: null }
}

/**
 * @param {string} restaurantId
 * @param {{ fromUnit: string, toUnit: string, factor: number }} input
 * @param {Function} [dbQuery]
 */
export async function upsertUnitConversion(restaurantId, input, dbQuery = query) {
  const from = normalizeUnit(input.fromUnit)
  const to = normalizeUnit(input.toUnit)
  if (!from || !to || !(Number(input.factor) > 0)) {
    throw new Error('Invalid unit conversion')
  }
  const { rows } = await dbQuery(
    `
    INSERT INTO recipe_unit_conversions (restaurant_id, from_unit, to_unit, factor)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (restaurant_id, from_unit, to_unit)
    DO UPDATE SET factor = EXCLUDED.factor, updated_at = now()
    RETURNING *
    `,
    [restaurantId, from, to, input.factor]
  )
  return rows[0]
}

/**
 * @param {string} restaurantId
 * @param {Function} [dbQuery]
 */
export async function listUnitConversions(restaurantId, dbQuery = query) {
  const { rows } = await dbQuery(
    `
    SELECT * FROM recipe_unit_conversions
    WHERE restaurant_id = $1
    ORDER BY from_unit, to_unit
    `,
    [restaurantId]
  )
  return rows
}
