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

  it('flags IPv4-mapped IPv6 in dotted and WHATWG-normalised hex forms', () => {
    for (const host of [
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '[::ffff:7f00:1]',
      '::ffff:169.254.169.254',
      '::ffff:a9fe:a9fe',
      '::ffff:10.0.0.1',
      '::ffff:c0a8:101',
      '0:0:0:0:0:ffff:7f00:1',
    ]) {
      expect(isPrivateHostname(host), host).toBe(true)
    }
    expect(isPrivateHostname('::ffff:8.8.8.8')).toBe(false)
    expect(isPrivateHostname('::ffff:808:808')).toBe(false)
  })

  it('flags IPv4-compatible, NAT64, 6to4, Teredo and other special IPv6 ranges', () => {
    for (const host of [
      '::127.0.0.1',
      '::7f00:1',
      '::a9fe:a9fe',
      '64:ff9b::a9fe:a9fe',
      '64:ff9b::127.0.0.1',
      '64:ff9b:1::1',
      '2002:7f00:1::1',
      '2002:a9fe:a9fe::1',
      '2001:0:4136:e378:8000:63bf:3fff:fdd2',
      'fc00::1',
      'fdff::1',
      'fe80::1%eth0',
      'febf::1',
      'ff02::1',
      '100::1',
    ]) {
      expect(isPrivateHostname(host), host).toBe(true)
    }
    // public targets reachable through the same prefixes stay allowed
    expect(isPrivateHostname('64:ff9b::808:808')).toBe(false)
    expect(isPrivateHostname('2002:808:808::1')).toBe(false)
  })

  it('fails closed on malformed IPv6 literals', () => {
    expect(isPrivateHostname('1:2:3')).toBe(true)
    expect(isPrivateHostname('::g')).toBe(true)
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

  it('rejects IPv6-mapped, compatible and NAT64 URL forms', () => {
    for (const url of [
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:169.254.169.254]/',
      'http://[64:ff9b::a9fe:a9fe]/',
      'http://[::127.0.0.1]/',
    ]) {
      expect(() => assertPublicHttpUrl(url), url).toThrow(/private or local/)
    }
    expect(() => assertPublicHttpUrl('https://[2606:4700::1111]/hook')).not.toThrow()
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
