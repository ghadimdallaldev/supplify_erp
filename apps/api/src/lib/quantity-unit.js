/** Quantity validation by product unit — keep in sync with apps/web/src/lib/quantityUnit.ts */

const INTEGER_UNITS = new Set([
  'piece',
  'pieces',
  'unit',
  'units',
  'each',
  'ea',
  'pack',
  'packs',
  'bottle',
  'bottles',
  'box',
  'boxes',
  'carton',
  'cartons',
  'bag',
  'bags',
  'can',
  'cans',
  'jar',
  'jars',
  'case',
  'cases',
  'dozen',
  'bundle',
  'bunch',
  'tray',
  'trays',
  'crate',
  'crates',
  'pallet',
  'pcs',
  'pc',
  'ct',
  'count',
  'head',
  'heads',
])

const SMALL_DISCRETE_UNITS = new Set(['g', 'gram', 'grams', 'ml', 'milliliter', 'milliliters'])

const FRACTIONAL_UNIT_STEP = {
  kg: 0.1,
  kilogram: 0.1,
  kilograms: 0.1,
  lb: 0.1,
  lbs: 0.1,
  pound: 0.1,
  pounds: 0.1,
  oz: 0.1,
  ounce: 0.1,
  ounces: 0.1,
  liter: 0.1,
  liters: 0.1,
  l: 0.1,
}

export function normalizeProductUnit(unit) {
  return String(unit ?? 'unit')
    .trim()
    .toLowerCase()
}

function decimalPlacesForStep(step) {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

export function getQuantityUnitRules(unit) {
  const u = normalizeProductUnit(unit)

  if (INTEGER_UNITS.has(u) || SMALL_DISCRETE_UNITS.has(u)) {
    return { step: 1, min: 0, allowDecimals: false, decimalPlaces: 0 }
  }

  const fractionalStep = FRACTIONAL_UNIT_STEP[u]
  if (fractionalStep != null) {
    return {
      step: fractionalStep,
      min: 0,
      allowDecimals: true,
      decimalPlaces: decimalPlacesForStep(fractionalStep),
    }
  }

  return { step: 1, min: 0, allowDecimals: false, decimalPlaces: 0 }
}

export function snapQuantityToUnit(value, unit) {
  const rules = getQuantityUnitRules(unit)
  if (!Number.isFinite(value)) return rules.min

  if (!rules.allowDecimals) {
    return Math.max(rules.min, Math.round(value))
  }

  const snapped = Math.round(value / rules.step) * rules.step
  const fixed = Number(snapped.toFixed(rules.decimalPlaces))
  return Math.max(rules.min, fixed)
}

export function normalizeReceivedQuantity(received, ordered, unit) {
  const maxQ = snapQuantityToUnit(ordered, unit)
  let q = snapQuantityToUnit(received, unit)
  if (q > maxQ) q = maxQ
  const rules = getQuantityUnitRules(unit)
  return Math.max(rules.min, q)
}

export function assertValidQuantityForUnit(value, unit, { fieldName = 'quantity' } = {}) {
  const rules = getQuantityUnitRules(unit)
  const snapped = snapQuantityToUnit(value, unit)
  if (Math.abs(snapped - Number(value)) > 1e-9) {
    const hint = rules.allowDecimals ? `increments of ${rules.step}` : 'whole numbers only'
    const err = new Error(
      `${fieldName} for unit "${unit || 'unit'}" must use ${hint} (got ${value})`
    )
    err.name = 'ValidationError'
    throw err
  }
  return snapped
}
