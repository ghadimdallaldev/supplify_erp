import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { AuthGuard } from './AuthGuard'
import { renderWithProviders } from '../test/utils'

const mockUseGetMeQuery = vi.fn()
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    useGetMeQuery: (...args: unknown[]) => mockUseGetMeQuery(...args),
  }
})

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render children when authenticated', async () => {
    mockUseGetMeQuery.mockReturnValueOnce({
      data: {
        id: 'user-1',
        email: 'test@example.com',
        role: 'RESTAURANT',
        displayName: 'Test',
        createdAt: new Date().toISOString(),
      },
      error: undefined,
      isLoading: false,
      isSuccess: true,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
      status: 'fulfilled',
      isUninitialized: false,
      currentData: undefined,
      dataUpdatedAt: 0,
      errorUpdatedAt: 0,
      isStale: false,
      isLoadingError: false,
      isRefetchError: false,
      failureCount: 0,
      failureReason: null,
    } as any)

    renderWithProviders(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    )

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('should not throw when loading', () => {
    mockUseGetMeQuery.mockReturnValueOnce({
      data: undefined,
      error: undefined,
      isLoading: true,
      isSuccess: false,
      isError: false,
      isFetching: true,
      refetch: vi.fn(),
      status: 'pending',
      isUninitialized: false,
      currentData: undefined,
      dataUpdatedAt: 0,
      errorUpdatedAt: 0,
      isStale: false,
      isLoadingError: false,
      isRefetchError: false,
      failureCount: 0,
      failureReason: null,
    } as any)

    expect(() =>
      renderWithProviders(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      )
    ).not.toThrow()
  })
})
