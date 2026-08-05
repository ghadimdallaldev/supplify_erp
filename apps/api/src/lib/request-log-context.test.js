import { describe, it, expect } from 'vitest'
import {
  buildRequestIdentifiers,
  formatRequestLogTags,
  patchRequestLogTenant,
} from './request-log-context.js'
import { requestLogStore } from './request-log-store.js'

describe('request-log-context', () => {
  it('buildRequestIdentifiers includes app user id and keycloak sub', () => {
    const req = {
      requestId: 'abc12345',
      userData: { id: 'user-uuid', role: 'SUPPLIER' },
      userSub: 'kc-sub-1',
      tenantContext: { tenantId: 'tenant-uuid', tenantType: 'SUPPLIER' },
      headers: { 'x-branch-id': 'branch-1' },
    }
    const ids = buildRequestIdentifiers(req)
    expect(ids.userId).toBe('user-uuid')
    expect(ids.userSub).toBe('kc-sub-1')
    expect(ids.role).toBe('SUPPLIER')
    expect(ids.tenantId).toBe('tenant-uuid')
    expect(ids.branchId).toBe('branch-1')
  })

  it('formatRequestLogTags renders debuggable tags', () => {
    const tags = formatRequestLogTags({
      requestId: 'abc12345',
      userId: 'user-uuid',
      userSub: 'kc-sub-1',
      role: 'SUPPLIER',
      tenantId: 'tenant-uuid',
      tenantType: 'SUPPLIER',
      branchId: '-',
      impersonating: false,
    })
    expect(tags).toContain('[req:abc12345]')
    expect(tags).toContain('[user:user-uuid]')
    expect(tags).toContain('[sub:kc-sub-1]')
    expect(tags).toContain('[tenant:SUPPLIER:tenant-uuid]')
  })

  it('patchRequestLogTenant updates req and AsyncLocalStorage store', () => {
    const req = {
      requestId: 'abc12345',
      method: 'GET',
      path: '/api/suppliers',
      originalUrl: '/api/suppliers?limit=20',
      userData: { id: 'user-uuid', role: 'RESTAURANT' },
    }
    let storeSnapshot
    requestLogStore.run({ requestId: 'abc12345' }, () => {
      patchRequestLogTenant(req, 'rest-uuid', 'RESTAURANT')
      storeSnapshot = { ...requestLogStore.getStore() }
    })
    const ids = buildRequestIdentifiers(req)
    expect(ids.tenantId).toBe('rest-uuid')
    expect(ids.tenantType).toBe('RESTAURANT')
    expect(storeSnapshot.tenantId).toBe('rest-uuid')
    expect(ids.route).toBe('/api/suppliers')
  })
})
