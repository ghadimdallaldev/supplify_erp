import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { AdminPlatformSettingsPanel } from './AdminPlatformSettingsPanel'

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useGetAdminPlatformSettingsQuery: () => ({ data: { freeSandboxDays: 30 }, isLoading: false }),
    useUpdateAdminPlatformSettingsMutation: () => [vi.fn(), { isLoading: false }],
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

describe('AdminPlatformSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders trial length input with allowed range', () => {
    renderWithProviders(<AdminPlatformSettingsPanel variant="compact" />)
    expect(screen.getByTestId('admin-platform-settings-panel')).toBeInTheDocument()
    expect(screen.getByLabelText(/Trial length/i)).toHaveAttribute('min', '7')
    expect(screen.getByLabelText(/Trial length/i)).toHaveAttribute('max', '90')
    expect(screen.getByText(/Allowed range: 7–90 days/i)).toBeInTheDocument()
  })

  it('shows validation error for out-of-range value', async () => {
    const { toast } = await import('sonner')
    renderWithProviders(<AdminPlatformSettingsPanel />)
    const input = screen.getAllByLabelText(/Trial length/i)[0]
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Save/i })[0])
    expect(toast.error).toHaveBeenCalledWith('Enter a number between 7 and 90 days')
  })
})
