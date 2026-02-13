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
})
