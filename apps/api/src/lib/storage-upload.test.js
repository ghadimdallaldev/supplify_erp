import { describe, expect, it } from 'vitest'
import { resolveStorageReservationBytes } from './storage-upload.js'

describe('resolveStorageReservationBytes', () => {
  const maximum = 10 * 1024 * 1024

  it('keeps a positive declared size within the server maximum', () => {
    expect(resolveStorageReservationBytes(1234, maximum)).toBe(1234)
  })

  it.each([undefined, null, 0, -1, Number.NaN])(
    'reserves the server maximum for an unknown or invalid size: %s',
    (size) => {
      expect(resolveStorageReservationBytes(size, maximum)).toBe(maximum)
    }
  )

  it('caps a declared size at the server maximum', () => {
    expect(resolveStorageReservationBytes(maximum + 1, maximum)).toBe(maximum)
  })
})
