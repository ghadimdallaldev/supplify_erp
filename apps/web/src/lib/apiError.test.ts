import { describe, expect, it } from 'vitest'
import { getApiErrorMessage, normalizeListResponse } from './apiError'

describe('getApiErrorMessage', () => {
  it('reads CUSTOM_ERROR payload message', () => {
    expect(
      getApiErrorMessage({ status: 'CUSTOM_ERROR', data: { message: 'Restaurant not found' } })
    ).toBe('Restaurant not found')
  })

  it('reads nested envelope error', () => {
    expect(
      getApiErrorMessage({
        data: { error: { message: 'Staff member does not belong to this restaurant' } },
      })
    ).toBe('Staff member does not belong to this restaurant')
  })
})

describe('normalizeListResponse', () => {
  it('returns unwrapped arrays', () => {
    expect(normalizeListResponse([{ id: '1' }])).toEqual([{ id: '1' }])
  })

  it('unwraps envelope objects', () => {
    expect(normalizeListResponse({ data: [{ id: '2' }] })).toEqual([{ id: '2' }])
  })
})
