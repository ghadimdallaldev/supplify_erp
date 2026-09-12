import { describe, it, expect } from 'vitest'
import { isPrivateHostname, assertPublicHttpUrl } from './ssrf-guard.js'

describe('isPrivateHostname', () => {
  it('flags loopback and local suffixes', () => {
    for (const host of ['localhost', 'app.localhost', 'db.local', 'svc.internal', 'x.home.arpa']) {
      expect(isPrivateHostname(host), host).toBe(true)
    }
  })

  it('flags RFC1918, loopback, and link-local IPv4', () => {
    for (const host of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.1',
      '172.16.0.1',
      '172.31.255.255',
      '169.254.169.254', // cloud metadata
      '0.0.0.0',
      '100.64.0.1', // CGNAT
      '255.255.255.255',
    ]) {
      expect(isPrivateHostname(host), host).toBe(true)
    }
  })

  it('flags alternate IPv4 encodings that reach loopback', () => {
    // These all resolve to 127.0.0.1 and bypass a naive dotted-quad regex.
    for (const host of ['2130706433', '0x7f000001', '127.1', '0177.0.0.1', '127.0.1']) {
      expect(isPrivateHostname(host), host).toBe(true)
    }
  })

  it('flags private IPv6, bracketed or bare', () => {
    for (const host of [
      '::1',
      '[::1]',
      '::',
      'fd00::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateHostname(host), host).toBe(true)
    }
  })

  it('allows public hostnames and addresses', () => {
    for (const host of ['example.com', 'hook.test', '8.8.8.8', '1.1.1.1', '2606:4700::1111']) {
      expect(isPrivateHostname(host), host).toBe(false)
    }
  })

  it('treats empty input as unsafe', () => {
    expect(isPrivateHostname('')).toBe(true)
    expect(isPrivateHostname(null)).toBe(true)
    expect(isPrivateHostname(undefined)).toBe(true)
  })
})

describe('assertPublicHttpUrl', () => {
  it('returns the parsed URL for a public https target', () => {
    const url = assertPublicHttpUrl('https://hook.test/path?a=1')
    expect(url.hostname).toBe('hook.test')
  })

  it('rejects malformed URLs', () => {
    expect(() => assertPublicHttpUrl('not a url')).toThrow(/Invalid/)
  })

  it('rejects non-http protocols', () => {
    for (const url of ['file:///etc/passwd', 'gopher://x/', 'ftp://x/']) {
      expect(() => assertPublicHttpUrl(url), url).toThrow()
    }
  })

  it('rejects private targets', () => {
    expect(() => assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).toThrow(
      /private or local/
    )
    expect(() => assertPublicHttpUrl('https://127.0.0.1:6379/')).toThrow(/private or local/)
  })

  it('rejects embedded credentials', () => {
    expect(() => assertPublicHttpUrl('https://user:pw@hook.test/')).toThrow(/credentials/)
  })

  it('honours a restricted protocol allowlist', () => {
    expect(() =>
      assertPublicHttpUrl('http://hook.test/', { protocols: ['https:'], label: 'Webhook URL' })
    ).toThrow(/Webhook URL must use HTTPS/)
  })
})
