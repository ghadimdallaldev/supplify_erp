import { z } from 'zod'

export const BUSINESS_DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

const dayHoursSchema = z
  .object({
    open: z.string().regex(timePattern).optional(),
    close: z.string().regex(timePattern).optional(),
    closed: z.boolean().optional(),
  })
  .superRefine((day, ctx) => {
    if (day.closed) return
    if (day.open && day.close) {
      if (day.open >= day.close) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'close must be after open',
        })
      }
      return
    }
    if (!day.open && !day.close) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'open and close are required when the day is not closed',
    })
  })

const operatingHoursSchema = z.record(z.enum(BUSINESS_DAY_KEYS), dayHoursSchema)

export const supplierBusinessSettingsUpdateSchema = z
  .object({
    operatingHours: operatingHoursSchema.optional(),
    minimumOrderAmount: z.number().min(0).nullable().optional(),
    paymentTerms: z.string().max(200).nullable().optional(),
    returnPolicy: z.string().max(5000).nullable().optional(),
    termsAndConditions: z.string().max(10000).nullable().optional(),
  })
  .refine(
    (body) =>
      body.operatingHours !== undefined ||
      body.minimumOrderAmount !== undefined ||
      body.paymentTerms !== undefined ||
      body.returnPolicy !== undefined ||
      body.termsAndConditions !== undefined,
    { message: 'At least one field is required' }
  )

/** @returns {Record<string, { open: string; close: string; closed: boolean }>} */
export function defaultOperatingHours() {
  /** @type {Record<string, { open: string; close: string; closed: boolean }>} */
  const hours = {}
  for (const day of BUSINESS_DAY_KEYS) {
    hours[day] = { open: '09:00', close: '17:00', closed: false }
  }
  return hours
}

/**
 * @param {unknown} raw
 * @returns {Record<string, { open: string; close: string; closed: boolean }>}
 */
export function normalizeOperatingHoursFromDb(raw) {
  const base = defaultOperatingHours()
  if (!raw || typeof raw !== 'object') return base

  for (const day of BUSINESS_DAY_KEYS) {
    const entry = /** @type {Record<string, unknown>} */ (raw)[day]
    if (!entry || typeof entry !== 'object') continue
    const closed = entry.closed === true
    const open = typeof entry.open === 'string' ? entry.open : base[day].open
    const close = typeof entry.close === 'string' ? entry.close : base[day].close
    base[day] = closed ? { open: '', close: '', closed: true } : { open, close, closed: false }
  }
  return base
}

/**
 * @param {Record<string, { open?: string; close?: string; closed?: boolean }>} operatingHours
 */
export function serializeOperatingHoursForDb(operatingHours) {
  /** @type {Record<string, { open?: string; close?: string; closed: boolean }>} */
  const out = {}
  for (const day of BUSINESS_DAY_KEYS) {
    const dayHours = operatingHours[day]
    if (!dayHours) continue
    if (dayHours.closed) {
      out[day] = { closed: true }
      continue
    }
    out[day] = {
      open: dayHours.open,
      close: dayHours.close,
      closed: false,
    }
  }
  return out
}

/** @param {Record<string, unknown>} row */
export function mapSupplierBusinessSettingsRow(row) {
  return {
    operatingHours: normalizeOperatingHoursFromDb(row.business_hours_json),
    minimumOrderAmount: row.minimum_order_amount != null ? Number(row.minimum_order_amount) : null,
    paymentTerms: row.payment_terms ?? null,
    returnPolicy: row.return_policy ?? null,
    termsAndConditions: row.terms_and_conditions ?? null,
  }
}
