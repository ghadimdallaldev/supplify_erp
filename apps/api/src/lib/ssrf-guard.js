import { ValidationError } from '../middlewares/errorHandler.js'

/**
 * Shared SSRF guard for outbound requests whose target URL is influenced by
 * tenant input (notification webhooks, image import from URL, ...).
 *
 * Hostname checks alone cannot make an outbound fetch safe — a public hostname
 * can resolve to a private address (DNS rebinding) and a public host can 302 to
 * an internal one. Callers must therefore ALSO:
 *   - pass `redirect: 'manual'` and reject 3xx, and
 *   - re-validate `response.url` when following anything.
 */

/** Strip the brackets Node keeps on IPv6 hostnames (`[::1]` -> `::1`). */
function unbracket(host) {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

/**
 * Parse the many legal spellings of an IPv4 literal that `\d+\.\d+\.\d+\.\d+`
 * misses: `http://2130706433/`, `http://0x7f000001/`, `http://127.1/` and
 * `http://0177.0.0.1/` all reach 127.0.0.1.
 *
 * @returns {number[]|null} four octets, or null when not an IPv4 literal.
 */
function parseIpv4(host) {
  const parts = host.split('.')
  if (parts.length > 4) return null

  const values = []
  for (const part of parts) {
    if (part === '') return null
    let value
    if (/^0[xX][0-9a-fA-F]+$/.test(part)) {
      value = Number.parseInt(part.slice(2), 16)
    } else if (/^0[0-7]+$/.test(part)) {
      value = Number.parseInt(part.slice(1), 8)
    } else if (/^\d+$/.test(part)) {
      value = Number.parseInt(part, 10)
    } else {
      return null
    }
    if (!Number.isSafeInteger(value) || value < 0) return null
    values.push(value)
  }

  // Trailing part absorbs the remaining octets: `127.1` -> 127.0.0.1
  const last = values.pop()
  const maxLast = 256 ** (4 - values.length)
  if (last >= maxLast) return null
  if (values.some((v) => v > 255)) return null

  const octets = [...values]
  for (let i = 4 - values.length - 1; i >= 0; i -= 1) {
    octets.push(Math.floor(last / 256 ** i) % 256)
  }
  return octets
}

function isPrivateIpv4(octets) {
  const [a, b] = octets
  if (a === 0) return true // 0.0.0.0/8 "this host"
  if (a === 10) return true // RFC1918
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true // RFC6598 carrier-grade NAT
  if (a === 192 && b === 0) return true // RFC5737 / protocol assignments
  if (a >= 224) return true // multicast + reserved + broadcast
  return false
}

function isPrivateIpv6(host) {
  const addr = host.toLowerCase()
  if (addr === '::1' || addr === '::') return true // loopback / unspecified
  if (/^f[cd][0-9a-f]{0,2}:/.test(addr)) return true // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]?:/.test(addr)) return true // fe80::/10 link-local

  // IPv4-mapped / -translated (::ffff:127.0.0.1, ::ffff:7f00:1)
  const mapped = addr.match(/^::ffff:(.+)$/)
  if (mapped) {
    const octets = parseIpv4(mapped[1])
    if (octets) return isPrivateIpv4(octets)
  }
  return false
}

/**
 * True when the hostname is loopback, link-local, RFC1918, or otherwise not a
 * routable public address. Does NOT resolve DNS — see the module note.
 */
export function isPrivateHostname(hostname) {
  const host = unbracket(
    String(hostname || '')
      .trim()
      .toLowerCase()
  )
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) {
    return true
  }

  if (host.includes(':')) return isPrivateIpv6(host)

  const octets = parseIpv4(host)
  if (octets) return isPrivateIpv4(octets)

  return false
}

/**
 * Assert a tenant-supplied URL is a public HTTP(S) endpoint safe to request.
 *
 * @param {string} urlString
 * @param {{ protocols?: string[], label?: string }} [options]
 * @returns {URL} the parsed URL
 * @throws {ValidationError} when the URL is malformed, uses a disallowed
 *   protocol, embeds credentials, or targets a private/local address.
 */
export function assertPublicHttpUrl(urlString, options = {}) {
  const { protocols = ['http:', 'https:'], label = 'URL' } = options

  let parsed
  try {
    parsed = new URL(urlString)
  } catch {
    throw new ValidationError(`Invalid ${label}`)
  }

  if (!protocols.includes(parsed.protocol)) {
    const allowed = protocols.map((p) => p.replace(':', '').toUpperCase()).join(' and ')
    throw new ValidationError(`${label} must use ${allowed}`)
  }
  // Credentials in the URL leak to the target and confuse host parsing.
  if (parsed.username || parsed.password) {
    throw new ValidationError(`${label} must not contain credentials`)
  }
  if (isPrivateHostname(parsed.hostname)) {
    throw new ValidationError(`${label} must not point to a private or local address`)
  }

  return parsed
}
