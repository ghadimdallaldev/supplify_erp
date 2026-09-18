import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { assertPublicHttpUrl, isPrivateHostname } from './ssrf-guard.js'

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024

function outboundError(name, message, cause) {
  return Object.assign(new Error(message), { name, code: name, cause })
}

async function resolveWithTimeout(hostname, timeoutMs) {
  let timeout
  try {
    return await Promise.race([
      dns.lookup(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(outboundError('OUTBOUND_FETCH_TIMEOUT', 'Outbound DNS lookup timed out')),
          timeoutMs
        )
      }),
    ])
  } catch (error) {
    if (error?.code === 'OUTBOUND_FETCH_TIMEOUT') throw error
    throw outboundError('OUTBOUND_FETCH_BLOCKED', 'Outbound hostname could not be resolved', error)
  } finally {
    clearTimeout(timeout)
  }
}

/** Resolve once and reject the whole answer if any DNS result is private. */
export async function resolvePublicPinnedAddress(
  parsedUrl,
  { timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  if (isPrivateHostname(parsedUrl.hostname)) {
    throw outboundError('OUTBOUND_FETCH_BLOCKED', 'Outbound URL targets a private or local address')
  }
  const addresses = await resolveWithTimeout(parsedUrl.hostname, timeoutMs)
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw outboundError('OUTBOUND_FETCH_BLOCKED', 'Outbound hostname has no public address')
  }
  const unsafe = addresses.find((entry) => isPrivateHostname(entry.address))
  if (unsafe) {
    throw outboundError('OUTBOUND_FETCH_BLOCKED', 'Outbound hostname resolves to a private address')
  }
  return addresses[0]
}

function collectResponse(response, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    response.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBytes) {
        response.destroy()
        reject(
          outboundError('OUTBOUND_RESPONSE_TOO_LARGE', 'Outbound response exceeds the size limit')
        )
        return
      }
      chunks.push(chunk)
    })
    response.on('end', () => resolve(Buffer.concat(chunks, total)))
    response.on('error', reject)
  })
}

/**
 * Make a direct, no-proxy HTTP(S) request to a DNS-pinned public address.
 * The original hostname is retained for the Host header and TLS SNI/cert
 * validation while the TCP connection is made to the resolved address.
 */
export async function fetchPinnedPublic(
  urlString,
  {
    method = 'GET',
    headers = {},
    body = undefined,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    protocols = ['http:', 'https:'],
    label = 'URL',
  } = {}
) {
  const parsed = assertPublicHttpUrl(urlString, { protocols, label })
  const address = await resolvePublicPinnedAddress(parsed, { timeoutMs })
  const transport = parsed.protocol === 'https:' ? https : http
  const hostHeader = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve(value)
    }
    const request = transport.request(
      {
        protocol: parsed.protocol,
        hostname: address.address,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: { ...headers, Host: hostHeader },
        agent: false,
        // Keep TLS identity tied to the URL hostname, not the pinned IP.
        ...(parsed.protocol === 'https:' ? { servername: parsed.hostname } : {}),
        // Prevent a later resolver call from changing the destination.
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      },
      async (response) => {
        try {
          const responseBody = await collectResponse(response, maxResponseBytes)
          finish(null, {
            status: response.statusCode || 0,
            headers: response.headers,
            body: responseBody,
            url: parsed.toString(),
          })
        } catch (error) {
          finish(
            error?.name === 'OUTBOUND_RESPONSE_TOO_LARGE'
              ? error
              : outboundError('OUTBOUND_FETCH_FAILED', 'Could not read outbound response', error)
          )
        }
      }
    )
    request.setTimeout(timeoutMs, () => {
      request.destroy(outboundError('OUTBOUND_FETCH_TIMEOUT', 'Outbound request timed out'))
    })
    request.on('error', (error) => {
      finish(
        error?.code === 'OUTBOUND_FETCH_TIMEOUT'
          ? error
          : outboundError('OUTBOUND_FETCH_FAILED', 'Outbound request failed', error)
      )
    })
    if (body != null) request.write(body)
    request.end()
  })
}
