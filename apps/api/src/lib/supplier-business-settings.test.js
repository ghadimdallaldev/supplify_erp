import { describe, expect, it } from 'vitest'
import {
  defaultOperatingHours,
  mapSupplierBusinessSettingsRow,
  normalizeOperatingHoursFromDb,
  serializeOperatingHoursForDb,
  supplierBusinessSettingsUpdateSchema,
} from './supplier-business-settings.js'

describe('supplier-business-settings', () => {
  it.each(['Mars/Olympus', 'garbage', '+05:00'])(
    'rejects unsupported timezone %s',
    (lastOrderTimezone) => {
      expect(supplierBusinessSettingsUpdateSchema.safeParse({ lastOrderTimezone }).success).toBe(
        false
      )
    }
  )

  it('normalizes a valid timezone and supports clearing the setting', () => {
    expect(
      supplierBusinessSettingsUpdateSchema.parse({ lastOrderTimezone: ' Asia/Beirut ' })
        .lastOrderTimezone
    ).toBe('Asia/Beirut')
    expect(supplierBusinessSettingsUpdateSchema.safeParse({ lastOrderTimezone: '' }).success).toBe(
      true
    )
  })
  it('normalizes stored hours and maps supplier row', () => {
    const row = {
      business_hours_json: {
        monday: { open: '08:00', close: '18:00' },
        sunday: { closed: true },
      },
      minimum_order_amount: '150.50',
      payment_terms: 'Net 30',
      return_policy: '7-day returns',
      terms_and_conditions: 'Standard terms',
    }

    const settings = mapSupplierBusinessSettingsRow(row)
    expect(settings.minimumOrderAmount).toBe(150.5)
    expect(settings.paymentTerms).toBe('Net 30')
    expect(settings.operatingHours.monday).toEqual({
      open: '08:00',
      close: '18:00',
      closed: false,
    })
    expect(settings.operatingHours.sunday.closed).toBe(true)
  })

  it('serializes closed days without open/close', () => {
    const hours = defaultOperatingHours()
    hours.saturday = { open: '', close: '', closed: true }
    const serialized = serializeOperatingHoursForDb(hours)
    expect(serialized.saturday).toEqual({ closed: true })
    expect(normalizeOperatingHoursFromDb(serialized).saturday.closed).toBe(true)
  })

  it('validates business settings patch body', () => {
    expect(() =>
      supplierBusinessSettingsUpdateSchema.parse({
        minimumOrderAmount: 100,
        operatingHours: {
          monday: { open: '09:00', close: '17:00' },
        },
      })
    ).not.toThrow()

    expect(() =>
      supplierBusinessSettingsUpdateSchema.parse({
        operatingHours: {
          monday: { open: '18:00', close: '09:00' },
        },
      })
    ).toThrow()
  })
})
