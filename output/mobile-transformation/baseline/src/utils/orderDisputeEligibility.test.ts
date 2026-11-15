import {
  DISPUTE_ELIGIBLE_ORDER_STATUSES,
  disputeEligibilityMessage,
  isOrderEligibleForDispute,
} from './orderDisputeEligibility'

describe('orderDisputeEligibility', () => {
  it('lists eligible terminal statuses', () => {
    expect(DISPUTE_ELIGIBLE_ORDER_STATUSES).toEqual(
      expect.arrayContaining(['DELIVERED', 'RECEIVED', 'COMPLETED'])
    )
  })

  it('allows disputes for delivered orders', () => {
    expect(isOrderEligibleForDispute('delivered')).toBe(true)
    expect(disputeEligibilityMessage('DELIVERED')).toBe('')
  })

  it('blocks disputes for in-flight orders', () => {
    expect(isOrderEligibleForDispute('SHIPPED')).toBe(false)
    expect(disputeEligibilityMessage('PROCESSING')).toContain('delivered')
  })

  it('handles missing status', () => {
    expect(isOrderEligibleForDispute(null)).toBe(false)
    expect(disputeEligibilityMessage(undefined)).toContain('delivered')
  })
})
