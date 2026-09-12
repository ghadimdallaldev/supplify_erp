import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/utils'
import { TeamRolesPanel } from './TeamRolesPanel'

const assignRoleMock = vi
  .fn()
  .mockReturnValue({ unwrap: () => Promise.resolve({ roleName: 'Viewer' }) })
const createRoleMock = vi
  .fn()
  .mockReturnValue({ unwrap: () => Promise.resolve({ role: { id: 'new' } }) })

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useGetEntitlementsQuery: () => ({
      data: { entitlements: { features: { advanced_roles: true } } },
    }),
    useGetTenantRolesQuery: () => ({
      data: {
        roles: [
          {
            id: 'role-owner',
            name: 'Owner',
            is_system: true,
            permissions: ['SETTINGS_MANAGE'],
          },
          {
            id: 'role-viewer',
            name: 'Viewer',
            is_system: true,
            permissions: ['ORDERS_VIEW'],
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    }),
    useGetTenantRoleUsersQuery: () => ({
      data: {
        users: [
          {
            id: 'u1',
            email: 'staff@example.com',
            display_name: 'Staff User',
            role_id: 'role-viewer',
            role_name: 'Viewer',
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    }),
    useGetUnlinkedDriversQuery: () => ({ data: { drivers: [] } }),
    useCreateTenantRoleMutation: () => [createRoleMock],
    useUpdateTenantRoleMutation: () => [vi.fn()],
    useDeleteTenantRoleMutation: () => [vi.fn()],
    useAssignTenantUserRoleMutation: () => [assignRoleMock],
  }
})

describe('TeamRolesPanel', () => {
  beforeEach(() => {
    assignRoleMock.mockClear()
    createRoleMock.mockClear()
  })

  it('lists team users with role assignment controls when advanced_roles is enabled', () => {
    renderWithProviders(<TeamRolesPanel tenantType="RESTAURANT" />)
    expect(screen.getAllByText('staff@example.com').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Staff User').length).toBeGreaterThan(0)
  })

  it('shows system roles available for assignment', () => {
    renderWithProviders(<TeamRolesPanel tenantType="RESTAURANT" />)
    expect(screen.getAllByText('Viewer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Owner').length).toBeGreaterThan(0)
  })
})
