/** Quantity input rules derived from product unit (receiving, disputes, etc.). */

export type QuantityUnitRules = {
  step: number
  min: number
  allowDecimals: boolean
  decimalPlaces: number
}

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

/** Small discrete units — whole numbers only. */
const SMALL_DISCRETE_UNITS = new Set(['g', 'gram', 'grams', 'ml', 'milliliter', 'milliliters'])

/** Fractional weight / volume — step 0.1 by default. */
const FRACTIONAL_UNIT_STEP: Record<string, number> = {
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

export function normalizeProductUnit(unit?: string | null): string {
  return String(unit ?? 'unit')
    .trim()
    .toLowerCase()
}

function decimalPlacesForStep(step: number): number {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

export function getQuantityUnitRules(unit?: string | null): QuantityUnitRules {
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

  // Unknown packaging-style labels default to whole units.
  return { step: 1, min: 0, allowDecimals: false, decimalPlaces: 0 }
}

export function snapQuantityToUnit(value: number, unit?: string | null): number {
  const rules = getQuantityUnitRules(unit)
  if (!Number.isFinite(value)) return rules.min

  if (!rules.allowDecimals) {
    return Math.max(rules.min, Math.round(value))
  }

  const snapped = Math.round(value / rules.step) * rules.step
  const fixed = Number(snapped.toFixed(rules.decimalPlaces))
  return Math.max(rules.min, fixed)
}

/** Clamp received qty to [0, ordered] and product unit increments. */
export function normalizeReceivedQuantity(
  received: number,
  ordered: number,
  unit?: string | null
): number {
  const rules = getQuantityUnitRules(unit)
  const maxQ = snapQuantityToUnit(ordered, unit)
  let q = snapQuantityToUnit(received, unit)
  if (q > maxQ) q = maxQ
  return Math.max(rules.min, q)
}
