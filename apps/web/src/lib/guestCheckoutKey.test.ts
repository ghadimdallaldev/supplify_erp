import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { guestCheckoutKey, clearGuestCheckoutKey } from './guestCheckoutKey'
afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})
describe('guest checkout key lifecycle', () => {
  it('reuses the key for a retry, stores no guest details, and creates a new key after success', async () => {
    vi.stubGlobal('crypto', webcrypto)
    const body = {
      guestName: 'QA Guest',
      guestPhone: '+96170000000',
      lines: [{ menuItemId: 'p1', quantity: 1 }],
    }
    const key = await guestCheckoutKey('bistro:guest', body)
    expect(await guestCheckoutKey('bistro:guest', body)).toBe(key)
    expect(localStorage.getItem('guest-checkout-key:bistro:guest')).not.toContain('QA Guest')
    expect(await guestCheckoutKey('other:guest', body)).not.toBe(key)
    clearGuestCheckoutKey('bistro:guest')
    expect(await guestCheckoutKey('bistro:guest', body)).not.toBe(key)
  })
})
