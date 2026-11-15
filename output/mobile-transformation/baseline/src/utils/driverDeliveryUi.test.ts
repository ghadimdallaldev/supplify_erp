import {
  formatDeliveryStatusLabel,
  getDriverGpsBannerLabel,
  getMobileDriverActions,
  isActiveDriverDeliveryStatus,
  isTerminalDriverDeliveryStatus,
  PROBLEM_REASONS,
} from '../utils/driverDeliveryUi'

describe('driverDeliveryUi', () => {
  it('shows picked up for assigned orders', () => {
    const actions = getMobileDriverActions('assigned')
    expect(actions[0].label).toBe("I'm on the way")
    expect(actions[0].status).toBe('out_for_delivery')
  })

  it('shows deliver and problem when on the way', () => {
    const actions = getMobileDriverActions('out_for_delivery')
    expect(actions.map((a) => a.label)).toEqual(['Delivered', 'Problem'])
  })

  // A dispatcher-set `picked_up` must not skip the departure step: offering
  // "Delivered" as the primary action there is what let one tap deliver an order
  // the driver had not started, and it also means tracking never starts.
  it('still offers the departure step when the load is only picked up', () => {
    const actions = getMobileDriverActions('picked_up')
    expect(actions[0].status).toBe('out_for_delivery')
    expect(actions[0].label).toBe("I'm on the way")
    expect(actions.map((a) => a.status)).toContain('failed')
  })

  it('offers a problem report alongside the departure step', () => {
    expect(getMobileDriverActions('assigned').map((a) => a.status)).toEqual([
      'out_for_delivery',
      'failed',
    ])
  })

  // No driver assignment exists yet, so every status call would be rejected.
  it('offers no actions for an unassigned delivery', () => {
    expect(getMobileDriverActions('pending')).toEqual([])
  })

  it('includes standard problem reasons', () => {
    expect(PROBLEM_REASONS).toContain('Restaurant closed')
    expect(PROBLEM_REASONS).toContain('Other')
  })

  it('formats delivery status labels', () => {
    expect(formatDeliveryStatusLabel('out_for_delivery')).toBe('On the way')
    expect(formatDeliveryStatusLabel('unknown')).toBe('unknown')
  })

  it('classifies terminal and active statuses', () => {
    expect(isTerminalDriverDeliveryStatus('delivered')).toBe(true)
    expect(isActiveDriverDeliveryStatus('assigned')).toBe(true)
    expect(isActiveDriverDeliveryStatus('delivered')).toBe(false)
  })

  it('GPS banner reflects permission and tracking state', () => {
    expect(getDriverGpsBannerLabel({ trackableCount: 0, trackingActive: false, permissionDenied: false, gpsError: false })).toBeNull()
    expect(getDriverGpsBannerLabel({ trackableCount: 2, trackingActive: true, permissionDenied: false, gpsError: false })).toBe('Location active')
    expect(getDriverGpsBannerLabel({ trackableCount: 2, trackingActive: false, permissionDenied: true, gpsError: false })).toBe('Location permission needed')
  })
})
