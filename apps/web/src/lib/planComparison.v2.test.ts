import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../config/supplifyModel', () => ({
  isSupplifyV2: vi.fn(),
}))

import { isSupplifyV2 } from '../config/supplifyModel'
import {
  getV2RestaurantUpgradeSubtitle,
  getV2SupplierPlanPositioningHint,
  V2_SUPPLIER_PLAN_POSITIONING,
} from './planComparison'

describe('planComparison V2 helpers', () => {
  beforeEach(() => {
    vi.mocked(isSupplifyV2).mockReset()
  })

  it('returns empty hints on V1', () => {
    vi.mocked(isSupplifyV2).mockReturnValue(false)
    expect(getV2SupplierPlanPositioningHint()).toBe('')
    expect(getV2RestaurantUpgradeSubtitle()).toBe('')
  })

  it('returns supplier positioning on V2', () => {
    vi.mocked(isSupplifyV2).mockReturnValue(true)
    expect(getV2SupplierPlanPositioningHint()).toContain('private B2B store')
    expect(V2_SUPPLIER_PLAN_POSITIONING.length).toBeGreaterThan(5)
    expect(getV2RestaurantUpgradeSubtitle()).toContain('full restaurant workspace')
  })
})
