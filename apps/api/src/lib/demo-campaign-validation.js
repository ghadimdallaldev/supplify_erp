import { z } from 'zod'

export const ROLES = ['restaurant', 'supplier']

export const LOCATION_BANDS = ['1', '2-5', '6-15', '16+']
export const CUSTOMER_BANDS = ['1-10', '11-50', '51-200', '200+']
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'demo_done', 'not_a_fit']

/**
 * Normalise a phone number to E.164-ish "+digits".
 * Lebanese local numbers (03 123 456, 71 123 456) are assumed +961 when no country code is given.
 * Returns null when the result is not 8-15 digits.
 */
export function normalizePhone(raw) {
  let s = raw.trim().replace(/[\s().-]/g, '')
  if (!/^\+?\d+$/.test(s.replace(/^00/, '+'))) return null
  if (s.startsWith('00')) s = '+' + s.slice(2)
  let digits
  if (s.startsWith('+')) {
    digits = s.slice(1)
  } else {
    const local = s.replace(/^0+/, '')
    digits = `961${local}`
    if (local.length < 7 || local.length > 8) {
      // Not a plausible Lebanese number without an explicit country code.
      return null
    }
  }
  if (digits.length < 8 || digits.length > 15) return null
  return `+${digits}`
}

const trimmed = (min, max, label) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} is required`)
    .max(max, `${label} is too long`)

const optionalAttr = z
  .string()
  .trim()
  .max(80)
  .regex(/^[\w\-.:~ +]*$/, 'Invalid attribution value')
  .optional()
  .transform((v) => (v ? v : undefined))

export const leadSchema = z
  .object({
    name: trimmed(2, 100, 'Name'),
    company: trimmed(2, 120, 'Company'),
    role: z.enum(ROLES, { errorMap: () => ({ message: 'Choose restaurant or supplier' }) }),
    whatsapp: trimmed(6, 32, 'WhatsApp number'),
    email: z
      .string()
      .trim()
      .max(160)
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(z.string().email('Enter a valid email address').optional()),
    locations: z.enum(LOCATION_BANDS).optional(),
    restaurantCustomers: z.enum(CUSTOMER_BANDS).optional(),
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Please confirm you agree to be contacted' }),
    }),
    // Honeypot: real people never fill this in.
    website: z.string().max(200).optional(),
    utm_source: optionalAttr,
    utm_medium: optionalAttr,
    utm_campaign: optionalAttr,
    utm_content: optionalAttr,
    qr_variant: optionalAttr,
    landing_role: optionalAttr,
  })
  .superRefine((v, ctx) => {
    if (!normalizePhone(v.whatsapp)) {
      ctx.addIssue({
        code: 'custom',
        path: ['whatsapp'],
        message: 'Enter a valid WhatsApp number, e.g. +961 71 123 456',
      })
    }
    if (v.role === 'restaurant' && !v.locations) {
      ctx.addIssue({
        code: 'custom',
        path: ['locations'],
        message: 'Choose roughly how many locations you run',
      })
    }
    if (v.role === 'supplier' && !v.restaurantCustomers) {
      ctx.addIssue({
        code: 'custom',
        path: ['restaurantCustomers'],
        message: 'Choose roughly how many restaurants you serve',
      })
    }
  })

export const EVENT_NAMES = [
  'page_visit',
  'role_selected',
  'video_start',
  'video_complete',
  'walkthrough_step',
  'walkthrough_complete',
  'form_open',
  'form_submit',
]

export const eventSchema = z.object({
  name: z.enum(EVENT_NAMES),
  sessionId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[\w-]+$/),
  role: z.enum(ROLES).optional(),
  detail: z
    .string()
    .max(40)
    .regex(/^[\w\-. ]*$/)
    .optional(),
  utm_source: optionalAttr,
  utm_medium: optionalAttr,
  utm_campaign: optionalAttr,
  qr_variant: optionalAttr,
})

export const leadPatchSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().max(4000).optional(),
})
