import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePermissions } from './usePermissions'

const mockUseImpersonation = vi.fn()

vi.mock('./useImpersonation', () => ({
  useImpersonation: () => mockUseImpersonation(),
}))

const mockUseAppSelector = vi.fn()

vi.mock('./redux', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => mockUseAppSelector(selector),
}))

describe('usePermissions impersonation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseImpersonation.mockReturnValue({ isImpersonating: true })
  })

  it('denies tenant nav permissions while tenant permissions are unavailable', () => {
    mockUseAppSelector.mockImplementation((selector) =>
      selector({
        auth: {
          user: {
            role: 'ADMIN',
            tenantPermissions: [],
            adminPermissions: ['ADMIN_ACCESS'],
          },
        },
      })
    )

    const { result } = renderHook(() => usePermissions())
    expect(result.current.can('ORDERS_VIEW')).toBe(false)
    expect(result.current.can('CATALOG_VIEW')).toBe(false)
  })

  it('respects tenantPermissions when impersonating with hydrated /me', () => {
    mockUseAppSelector.mockImplementation((selector) =>
      selector({
        auth: {
          user: {
            role: 'ADMIN',
            tenantPermissions: ['ORDERS_VIEW'],
            adminPermissions: ['ADMIN_ACCESS'],
          },
        },
      })
    )

    const { result } = renderHook(() => usePermissions())
    expect(result.current.can('ORDERS_VIEW')).toBe(true)
    expect(result.current.can('CATALOG_VIEW')).toBe(false)
  })
})
