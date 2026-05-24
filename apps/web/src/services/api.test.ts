import { describe, it, expect } from 'vitest'
import { api } from './api'

describe('API Service', () => {
  it('should export api with reducerPath', () => {
    expect(api).toBeDefined()
    expect(api.reducerPath).toBe('api')
  })

  it('should have useGetMeQuery hook', () => {
    expect(typeof (api as any).useGetMeQuery).toBe('function')
  })

  it('should have useGetProductsQuery hook', () => {
    expect(typeof (api as any).useGetProductsQuery).toBe('function')
  })

  it('should export deal promotion hooks', () => {
    expect(typeof (api as any).useGetActivePromotionsQuery).toBe('function')
    expect(typeof (api as any).useGetAdminPendingDealsQuery).toBe('function')
    expect(typeof (api as any).useApproveAdminDealMutation).toBe('function')
    expect(typeof (api as any).useUpdateAdminPromotionPricingMutation).toBe('function')
  })
})
