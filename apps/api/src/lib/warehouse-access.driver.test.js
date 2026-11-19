import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('./db.js', () => ({ query: (...a) => queryMock(...a) }))
vi.mock('./audit.js', () => ({ writeAuditLog: vi.fn() }))
vi.mock('./billing/billing-recovery-paths.js', () => ({ isBillingRecoveryPath: () => false }))

const { enforceWarehouseRequestAccess } = await import('./warehouse-access.js')

const orderId = '0b6f9f0e-1a2b-4c3d-8e4f-5a6b7c8d9e0f'
const driverTenant = () => ({
  tenantType: 'SUPPLIER',
  tenantId: 'sup-1',
  roles: [{ name: 'Custom Driver', is_system: false }],
  permissions: ['DRIVER_DELIVERIES_VIEW', 'DRIVER_DELIVERIES_MANAGE'],
})
const req = (method, url) => ({ method, originalUrl: url, userData: { id: 'u1', role: 'USER' } })

describe('enforceWarehouseRequestAccess for restricted-warehouse drivers', () => {
  beforeEach(() => {
    queryMock.mockReset()
    // mode 'assigned', not owner, no warehouses
    queryMock.mockResolvedValue({ rows: [{ mode: 'assigned', owner: false, warehouse_ids: [] }] })
  })

  it.each([
    'driver-detail',
    'delivery-status',
    'location',
    'proof-of-delivery',
    'complete-delivery',
  ])('allows %s (driver-assignment checks stay authoritative)', async (action) => {
    await expect(
      enforceWarehouseRequestAccess(req('POST', `/api/orders/${orderId}/${action}`), driverTenant())
    ).resolves.toBeUndefined()
  })

  it('still blocks tenant-wide surfaces for the same driver', async () => {
    await expect(
      enforceWarehouseRequestAccess(req('GET', '/api/inventory/summary'), driverTenant())
    ).rejects.toThrow('broader warehouse access')
  })
})
