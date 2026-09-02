import { describe, expect, it, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => queryMock(...args),
}))

import { assertUserCanJoinWorkspace, bindUserToWorkspace } from './workspace-membership.js'
import { WorkspaceMembershipError } from './workspace-membership.js'

describe('workspace-membership', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('allows join when user has no membership', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    await expect(
      assertUserCanJoinWorkspace({
        userId: 'u1',
        workspaceType: 'RESTAURANT',
        organizationId: 'org-a',
        homeTenantId: 'r1',
      })
    ).resolves.toBeUndefined()
  })

  it('allows join to same organization (branch invite)', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'u1',
          workspace_type: 'RESTAURANT',
          organization_id: 'org-a',
          home_tenant_id: 'r1',
          status: 'active',
        },
      ],
    })
    await expect(
      assertUserCanJoinWorkspace({
        userId: 'u1',
        workspaceType: 'RESTAURANT',
        organizationId: 'org-a',
        homeTenantId: 'r2',
      })
    ).resolves.toBeUndefined()
  })

  it('blocks join to a different organization', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'u1',
          workspace_type: 'RESTAURANT',
          organization_id: 'org-a',
          home_tenant_id: 'r1',
          status: 'active',
        },
      ],
    })
    await expect(
      assertUserCanJoinWorkspace({
        userId: 'u1',
        workspaceType: 'RESTAURANT',
        organizationId: 'org-b',
        homeTenantId: 'r9',
      })
    ).rejects.toBeInstanceOf(WorkspaceMembershipError)
  })
})

describe('sameWorkspace helper via bindUserToWorkspace', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('creates membership when none exists', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'u1',
            workspace_type: 'SUPPLIER',
            organization_id: 'org-1',
            home_tenant_id: 's1',
            is_main_admin: true,
          },
        ],
      })

    const row = await bindUserToWorkspace({
      userId: 'u1',
      workspaceType: 'SUPPLIER',
      organizationId: 'org-1',
      homeTenantId: 's1',
      isMainAdmin: true,
    })
    expect(row.is_main_admin).toBe(true)
  })
})
