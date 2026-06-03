import { describe, expect, it } from 'vitest'
import { normalizeReportResponse, reportErrorMessage } from './reportResponse'

describe('normalizeReportResponse', () => {
  it('wraps unwrapped array from baseQuery', () => {
    const rows = [{ period: '2026-01-01', order_count: 3 }]
    expect(normalizeReportResponse(rows)).toEqual({ data: rows })
  })

  it('passes through envelope shape', () => {
    const payload = { data: [{ x: 1 }], meta: { rowCount: 1 } }
    expect(normalizeReportResponse(payload)).toEqual(payload)
  })

  it('returns empty data for invalid payload', () => {
    expect(normalizeReportResponse(null)).toEqual({ data: [] })
    expect(normalizeReportResponse({ data: 'nope' })).toEqual({ data: [] })
  })
})

describe('reportErrorMessage', () => {
  it('uses API error message when present', () => {
    expect(reportErrorMessage({ data: { message: 'Restaurant not found' } })).toBe(
      'Restaurant not found'
    )
  })

  it('maps CUSTOM_ERROR to plan message', () => {
    expect(reportErrorMessage({ status: 'CUSTOM_ERROR' })).toContain('not available')
  })
})
