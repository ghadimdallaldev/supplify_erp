import { describe, expect, it } from 'vitest'
import {
  formatFulfillmentRouteStatus,
  formatFulfillmentStopStatus,
  getFulfillmentStopPrimaryAction,
  getStopEtaLabel,
} from './fulfillmentRouteLabels'

describe('fulfillmentRouteLabels', () => {
  it('maps route statuses to plain labels', () => {
    expect(formatFulfillmentRouteStatus('PLANNED')).toBe('Route planned')
    expect(formatFulfillmentRouteStatus('IN_PROGRESS')).toBe('On the way')
    expect(formatFulfillmentRouteStatus('COMPLETED')).toBe('Delivered')
  })

  it('maps stop statuses with route context', () => {
    expect(formatFulfillmentStopStatus({ status: 'PLANNED' }, 'PLANNED').label).toBe(
      'Waiting for preparation'
    )
    expect(formatFulfillmentStopStatus({ status: 'PLANNED' }, 'IN_PROGRESS').label).toBe(
      'Ready for dispatch'
    )
    expect(formatFulfillmentStopStatus({ status: 'OUT_FOR_DELIVERY' }, 'IN_PROGRESS').label).toBe(
      'On the way'
    )
    expect(formatFulfillmentStopStatus({ status: 'DELIVERED' }, 'IN_PROGRESS').label).toBe(
      'Delivered'
    )
    expect(formatFulfillmentStopStatus({ status: 'FAILED' }, 'IN_PROGRESS').label).toBe('Problem')
  })

  it('formats ETA when available on stop', () => {
    expect(getStopEtaLabel({ etaAvailable: true, etaMinutesMin: 12, etaMinutesMax: 18 })).toBe(
      'ETA 12–18 min'
    )
    expect(getStopEtaLabel({ etaAvailable: false })).toBeNull()
  })

  it('picks primary stop action by status', () => {
    expect(getFulfillmentStopPrimaryAction({ status: 'PLANNED' })).toEqual({
      label: 'On the way',
      status: 'OUT_FOR_DELIVERY',
    })
    expect(getFulfillmentStopPrimaryAction({ status: 'OUT_FOR_DELIVERY' })).toEqual({
      label: 'Delivered',
      status: 'DELIVERED',
    })
    expect(getFulfillmentStopPrimaryAction({ status: 'DELIVERED' })).toBeNull()
  })
})
