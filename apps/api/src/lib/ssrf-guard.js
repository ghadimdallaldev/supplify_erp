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

/**
 * Expand an IPv6 literal (any spelling: compressed, mixed dotted-quad tail, bracketed)
 * into eight 16-bit groups. WHATWG URL normalises `[::ffff:127.0.0.1]` to
 * `[::ffff:7f00:1]`, so both forms must parse. Returns null when not valid IPv6.
 *
 * @returns {number[]|null}
 */
function parseIpv6(host) {
  let addr = host.toLowerCase()
  const zone = addr.indexOf('%')
  if (zone !== -1) addr = addr.slice(0, zone) // zone ids never change the destination class
  if (!addr.includes(':')) return null

  // Dotted-quad tail (::ffff:127.0.0.1, ::127.0.0.1, 64:ff9b::1.2.3.4)
  const lastColon = addr.lastIndexOf(':')
  const tail = addr.slice(lastColon + 1)
  if (tail.includes('.')) {
    const octets = parseIpv4(tail)
    if (!octets || tail.split('.').length !== 4) return null
    const hi = ((octets[0] << 8) | octets[1]).toString(16)
    const lo = ((octets[2] << 8) | octets[3]).toString(16)
    addr = `${addr.slice(0, lastColon + 1)}${hi}:${lo}`
  }

  const halves = addr.split('::')
  if (halves.length > 2) return null
  const toGroups = (part) => (part === '' ? [] : part.split(':'))
  const head = toGroups(halves[0])
  const rest = halves.length === 2 ? toGroups(halves[1]) : []
  let groups
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length
    if (missing < 1) return null
    groups = [...head, ...Array(missing).fill('0'), ...rest]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null

  const values = []
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    values.push(Number.parseInt(group, 16))
  }
  return values
}

function embeddedIpv4(hi, lo) {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]
}

function isPrivateIpv6(host) {
  const g = parseIpv6(host)
  if (!g) return true // unparseable IPv6 literal: fail closed

  const allZero = (from, to) => g.slice(from, to).every((v) => v === 0)

  // ::/96 — unspecified (::), loopback (::1) and deprecated IPv4-compatible (::a.b.c.d)
  if (allZero(0, 6)) return true
  // ::ffff:0:0/96 — IPv4-mapped; judge by the embedded IPv4 address
  if (allZero(0, 5) && g[5] === 0xffff) return isPrivateIpv4(embeddedIpv4(g[6], g[7]))
  // ::ffff:0:0:0/96 — SIIT IPv4-translated
  if (allZero(0, 4) && g[4] === 0xffff && g[5] === 0) return true
  // 64:ff9b::/96 — NAT64 well-known prefix; judge by the embedded IPv4 address
  if (g[0] === 0x64 && g[1] === 0xff9b && allZero(2, 6)) {
    return isPrivateIpv4(embeddedIpv4(g[6], g[7]))
  }
  // 64:ff9b:1::/48 — NAT64 local-use prefix (embedding position varies): block
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true
  // 2002::/16 — 6to4; judge by the embedded IPv4 address in groups 1-2
  if (g[0] === 0x2002) return isPrivateIpv4(embeddedIpv4(g[1], g[2]))
  // 2001::/32 — Teredo: tunnels to an arbitrary IPv4, block outright
  if (g[0] === 0x2001 && g[1] === 0) return true
  // 100::/64 — discard-only
  if (g[0] === 0x100 && allZero(1, 4)) return true
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true // fec0::/10 deprecated site-local
  if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
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
