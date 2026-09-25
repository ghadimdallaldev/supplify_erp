/**
 * Postal coverage for warehouse zones.
 * A full code matches after spaces and case are ignored.
 * A shorter code matches a longer one only at a real boundary:
 * "E1" matches "E1 6AN", "SW1" matches "SW1A 1AA", and "SW1" does not match "SW10".
 * Numeric codes stay exact, so "11" does not cover "1100".
 */

export function normalizePostalCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/

function letterSuffix(shorter, longer) {
  if (!longer.startsWith(shorter) || longer.length === shorter.length) return false
  return /^[A-Z]/.test(longer.slice(shorter.length))
}

export function postalCodeMatches(zoneCode, destination) {
  const code = normalizePostalCode(zoneCode)
  const dest = normalizePostalCode(destination)
  if (!code || !dest) return false
  if (code === dest) return true

  const destSpaced = String(destination).trim().toUpperCase().replace(/\s+/g, ' ')
  const codeSpaced = String(zoneCode).trim().toUpperCase().replace(/\s+/g, ' ')
  if (destSpaced.startsWith(`${codeSpaced} `)) return true

  const uk = dest.match(UK_POSTCODE)
  if (!uk) return false
  const outward = uk[1]
  return code === outward || letterSuffix(code, outward)
}
