/**
 * Canonical identity normalization shared by authentication and account flows.
 * Do not apply provider-specific aliases (Gmail dots/+tags) here: those are not
 * guaranteed to identify the same person.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_PATTERN = /^[a-z0-9_]+$/
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'security',
  'supplify',
  'system',
  'root',
  'owner',
])

function invalidIdentity(message, code = 'INVALID_IDENTITY') {
  return Object.assign(new Error(message), { name: code, code })
}

export function normalizeIdentityEmail(raw) {
  if (typeof raw !== 'string')
    throw invalidIdentity('A valid email address is required', 'INVALID_EMAIL')
  const normalized = raw.trim().toLowerCase()
  if (!normalized || normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) {
    throw invalidIdentity('A valid email address is required', 'INVALID_EMAIL')
  }
  return normalized
}

export function isReservedUsername(raw) {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
  return RESERVED_USERNAMES.has(normalized)
}

export function normalizeConsumerUsername(raw) {
  if (typeof raw !== 'string')
    throw invalidIdentity('A valid username is required', 'INVALID_USERNAME')
  const normalized = raw.trim().toLowerCase()
  if (
    normalized.length < 3 ||
    normalized.length > 32 ||
    !USERNAME_PATTERN.test(normalized) ||
    isReservedUsername(normalized)
  ) {
    throw invalidIdentity(
      'Username must be 3–32 lowercase letters, numbers, or underscores',
      'INVALID_USERNAME'
    )
  }
  return normalized
}

/** Normalize a phone number to a conservative E.164 representation. */
export function normalizePhoneE164(raw, defaultCountry) {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string')
    throw invalidIdentity('A valid phone number is required', 'INVALID_PHONE')

  const compact = raw.trim().replace(/[().\-\s]/g, '')
  let normalized
  if (compact.startsWith('+')) {
    normalized = `+${compact.slice(1).replace(/\D/g, '')}`
  } else if (compact.startsWith('00')) {
    normalized = `+${compact.slice(2).replace(/\D/g, '')}`
  } else if (defaultCountry && /^\d{1,4}$/.test(String(defaultCountry))) {
    const localDigits = compact.replace(/\D/g, '')
    normalized = `+${defaultCountry}${localDigits.replace(/^0/, '')}`
  } else {
    throw invalidIdentity(
      'Phone numbers must include an international country code',
      'INVALID_PHONE'
    )
  }

  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
    throw invalidIdentity('A valid international phone number is required', 'INVALID_PHONE')
  }
  return normalized
}

export function isUniqueViolation(error) {
  return error?.code === '23505'
}

/** Map database uniqueness races to a safe, non-SQL error response. */
export function identityConflictResponse(res, field = 'email') {
  return res.status(409).json({
    ok: false,
    data: null,
    error: {
      name: 'IDENTITY_CONFLICT',
      message:
        field === 'email'
          ? 'An account with this email already exists'
          : 'This identity is already in use',
      field,
    },
    requestId: res.req?.requestId,
  })
}
