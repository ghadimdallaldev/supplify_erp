import { describe, expect, it, vi } from 'vitest'

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }))

vi.mock('node:dns/promises', () => ({
  default: { lookup: lookupMock },
}))

import { resolvePublicPinnedAddress } from './pinned-fetch.js'

describe('resolvePublicPinnedAddress', () => {
  it('rejects a DNS answer containing a private address', async () => {
    lookupMock.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ])

    await expect(
      resolvePublicPinnedAddress(new URL('https://example.test/'))
    ).rejects.toMatchObject({
      code: 'OUTBOUND_FETCH_BLOCKED',
    })
  })

  it('returns one public address for the pinned request', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])

    await expect(resolvePublicPinnedAddress(new URL('https://example.test/'))).resolves.toEqual({
      address: '93.184.216.34',
      family: 4,
    })
  })

  it('rejects DNS failures as blocked outbound targets', async () => {
    lookupMock.mockRejectedValueOnce(new Error('resolver unavailable'))

    await expect(
      resolvePublicPinnedAddress(new URL('https://example.test/'))
    ).rejects.toMatchObject({
      code: 'OUTBOUND_FETCH_BLOCKED',
    })
  })
})
