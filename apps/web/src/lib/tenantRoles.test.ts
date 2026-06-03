import { describe, expect, it } from 'vitest'
import { isTenantOwner, TENANT_OWNER_ROLE_NAMES } from './tenantRoles'
import type { User } from '../types'

describe('tenantRoles', () => {
  it('detects modern Owner role name from tenantRoles', () => {
    const user = {
      id: '1',
      email: 'o@example.com',
      displayName: 'Owner',
      role: 'RESTAURANT',
      tenantRoles: ['Owner'],
    } as User
    expect(isTenantOwner(user)).toBe(true)
  })

  it('detects legacy RESTAURANT_OWNER code', () => {
    const user = {
      id: '1',
      email: 'o@example.com',
      displayName: 'Owner',
      role: 'RESTAURANT',
      tenantRoles: ['RESTAURANT_OWNER'],
    } as User
    expect(isTenantOwner(user)).toBe(true)
  })

  it('detects Owner from workspace.roleName', () => {
    const user = {
      id: '1',
      email: 'o@example.com',
      displayName: 'Owner',
      role: 'SUPPLIER',
      workspace: { tenantId: 's1', tenantType: 'SUPPLIER', tenantName: 'Main', roleName: 'Owner' },
    } as User
    expect(isTenantOwner(user)).toBe(true)
  })

  it('returns false for non-owner roles', () => {
    const user = {
      id: '1',
      email: 'v@example.com',
      displayName: 'Viewer',
      role: 'RESTAURANT',
      tenantRoles: ['Viewer'],
    } as User
    expect(isTenantOwner(user)).toBe(false)
  })

  it('exports all known owner role identifiers', () => {
    expect(TENANT_OWNER_ROLE_NAMES).toContain('Owner')
    expect(TENANT_OWNER_ROLE_NAMES).toContain('RESTAURANT_OWNER')
  })
})
