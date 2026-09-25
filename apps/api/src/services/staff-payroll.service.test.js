import { describe, expect, it } from 'vitest'
import { buildPayrollPreview, payrollQueryWindow } from './staff-payroll.service.js'

describe('buildPayrollPreview', () => {
  it('counts an open shift only up to now, not through the end of the pay period', () => {
    const now = new Date('2026-09-25T12:00:00.000Z')
    const preview = buildPayrollPreview(
      [
        {
          staff_id: 's1',
          display_name: 'Amina',
          role: 'Server',
          wage_type: 'HOURLY',
          wage_rate: 10,
          clock_in_at: '2026-09-25T10:00:00.000Z',
          clock_out_at: null,
          break_minutes: 0,
        },
      ],
      '2026-09-25',
      '2026-09-30',
      now
    )

    expect(preview.totalHours).toBe(2)
    expect(preview.estimatedLabourCost).toBe(20)
    expect(preview.hasOpenEntries).toBe(true)
  })

  it('keeps a zero hourly rate as zero labour cost', () => {
    const preview = buildPayrollPreview(
      [
        {
          staff_id: 's1',
          display_name: 'Amina',
          role: 'Server',
          wage_type: 'HOURLY',
          wage_rate: 0,
          clock_in_at: '2026-09-25T10:00:00.000Z',
          clock_out_at: '2026-09-25T12:00:00.000Z',
          break_minutes: 0,
        },
      ],
      '2026-09-25',
      '2026-09-30',
      new Date('2026-09-25T18:00:00.000Z')
    )

    expect(preview.estimatedLabourCost).toBe(0)
    expect(preview.staffMissingRate).toEqual([])
  })

  it('uses the restaurant day, not UTC midnight, for the pay period', () => {
    const window = payrollQueryWindow('2026-09-25', '2026-09-25', 'Asia/Beirut')
    expect(window.start.toISOString()).toBe('2026-09-24T21:00:00.000Z')
    expect(window.end.toISOString()).toBe('2026-09-25T20:59:59.999Z')

    const preview = buildPayrollPreview(
      [
        {
          staff_id: 's1',
          display_name: 'Amina',
          role: 'Server',
          wage_type: 'HOURLY',
          wage_rate: 10,
          clock_in_at: '2026-09-25T19:00:00.000Z',
          clock_out_at: null,
          break_minutes: 0,
        },
      ],
      '2026-09-25',
      '2026-09-25',
      new Date('2026-09-25T22:00:00.000Z'),
      'Asia/Beirut'
    )

    expect(preview.totalHours).toBe(2)
    expect(preview.estimatedLabourCost).toBe(20)
  })
})
