import { formatRunSheetDateLabel, todayRunSheetDate } from './runSheetDate'

describe('runSheetDate', () => {
  it('formats ISO date for display', () => {
    expect(formatRunSheetDateLabel('2026-06-18')).toMatch(/Jun/)
  })

  it('todayRunSheetDate returns YYYY-MM-DD', () => {
    expect(todayRunSheetDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
