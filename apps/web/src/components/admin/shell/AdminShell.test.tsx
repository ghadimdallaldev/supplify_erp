import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { TooltipProvider } from '../../ui/tooltip'
import { renderWithProviders } from '../../../test/utils'
import { store } from '../../../store'
import { setUser } from '../../../features/auth/authSlice'
import { AdminShell, useRegisterAdminShellNav } from './AdminShell'
import { ADMIN_SIDEBAR_COLLAPSED_KEY } from './adminShellPrefs'
import type { AdminCanTabMap } from '../dashboard/adminDashboardShared'

const updatePreferences = vi.fn(() => ({ unwrap: () => Promise.resolve({ preferences: {} }) }))
const logout = vi.fn(() => ({ unwrap: () => Promise.resolve({ keycloakLogoutUrl: '' }) }))

vi.mock('../../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/api')>()
  return {
    ...actual,
    useLogoutMutation: () => [logout],
    useUpdateAdminPreferencesMutation: () => [updatePreferences],
  }
})

vi.mock('../../search/CommandPalette', () => ({
  CommandPalette: () => null,
}))

const allTabs: AdminCanTabMap = {
  overview: true,
  activity: true,
  tenants: true,
  users: true,
  subscriptions: true,
  plans: true,
  finance: true,
  usage: true,
  features: true,
  deals: true,
  limits: true,
  health: true,
  operations: true,
  audit: true,
}

function Page() {
  useRegisterAdminShellNav({
    selectedTab: 'tenants',
    setSelectedTab: () => {},
    canAdminTab: allTabs,
  })
  return <p>page body</p>
}

function renderShell() {
  window.history.pushState({}, '', '/app/admin/tenants')
  return renderWithProviders(
    <TooltipProvider>
      <AdminShell>
        <Page />
      </AdminShell>
    </TooltipProvider>
  )
}

describe('AdminShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
    store.dispatch(
      setUser({
        id: 'u1',
        email: 'admin@supplify.com',
        displayName: 'Ada Admin',
        role: 'ADMIN',
        createdAt: '2026-01-01',
        adminRoles: ['SUPER_ADMIN'],
        adminPreferences: {
          defaultLandingTab: 'overview',
          compactMode: false,
          themePreference: 'light',
        },
      })
    )
  })

  it('renders sidebar groups, breadcrumb, and the active section', () => {
    renderShell()
    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('admin-nav-tenants')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('admin-breadcrumb')).toHaveTextContent('Platform')
    expect(screen.getByTestId('admin-breadcrumb')).toHaveTextContent('All tenants')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('All tenants')
  })

  it('collapses the sidebar and persists the choice', () => {
    renderShell()
    const sidebar = screen.getByTestId('admin-sidebar')
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')

    fireEvent.click(screen.getByTestId('admin-sidebar-collapse'))
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    expect(window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY)).toBe('1')
    // Labels are CSS-hidden in rail mode, so links carry an accessible name.
    expect(screen.getByTestId('admin-nav-tenants')).toHaveAttribute('aria-label', 'All tenants')

    fireEvent.click(screen.getByTestId('admin-sidebar-collapse'))
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')
    expect(window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY)).toBe('0')
  })

  it('restores a collapsed sidebar from localStorage', () => {
    window.localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, '1')
    renderShell()
    expect(screen.getByTestId('admin-sidebar')).toHaveAttribute('data-collapsed', 'true')
  })

  it('opens the mobile drawer, locks scroll, and closes on Escape', () => {
    renderShell()
    fireEvent.click(screen.getByLabelText('Open admin menu'))
    expect(screen.getByTestId('admin-sidebar')).toHaveClass('admin-sidebar-open')
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByTestId('admin-sidebar')).toHaveClass('admin-sidebar-closed')
    expect(document.body.style.overflow).toBe('')
  })

  it('shows the account menu with identity, settings link, and sign out', async () => {
    renderShell()
    fireEvent.click(screen.getByTestId('admin-user-menu-trigger'))
    expect(await screen.findByText('Ada Admin')).toBeInTheDocument()
    expect(screen.getByText('admin@supplify.com')).toBeInTheDocument()
    expect(screen.getByText('Super Admin')).toBeInTheDocument()
    expect(screen.getByText('Account settings').closest('a')).toHaveAttribute(
      'href',
      '/app/settings'
    )

    fireEvent.click(screen.getByTestId('logout-button'))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('toggles dark theme instantly and saves the preference', async () => {
    renderShell()
    const toggle = screen.getByTestId('admin-theme-toggle')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await act(async () => {
      fireEvent.click(toggle)
    })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(updatePreferences).toHaveBeenCalledWith({ themePreference: 'dark' })
    expect(screen.getByTestId('admin-theme-toggle')).toHaveAttribute('aria-pressed', 'true')

    await act(async () => {
      fireEvent.click(screen.getByTestId('admin-theme-toggle'))
    })
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(updatePreferences).toHaveBeenLastCalledWith({ themePreference: 'light' })
  })
})
