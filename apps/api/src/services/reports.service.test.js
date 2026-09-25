import { describe, expect, it } from 'vitest'
import { dateBucketExpression, generateDateBuckets, parseReportQuery } from './reports.service.js'

describe('reports.service', () => {
  describe('dateBucketExpression', () => {
    it('buckets by day by default', () => {
      expect(dateBucketExpression('co.placed_at', 'day')).toContain('::date')
    })

    it('buckets by week', () => {
      expect(dateBucketExpression('co.placed_at', 'week')).toContain("date_trunc('week'")
    })

    it('buckets by month', () => {
      expect(dateBucketExpression('co.placed_at', 'month')).toContain("date_trunc('month'")
    })
  })

  describe('generateDateBuckets', () => {
    it('returns daily buckets for a short range', () => {
      const from = new Date('2026-01-01')
      const to = new Date('2026-01-03')
      const buckets = generateDateBuckets(from, to, 'day')
      expect(buckets.length).toBeGreaterThanOrEqual(3)
      expect(buckets[0]).toBe('2026-01-01')
    })

    it('returns monthly bucket keys', () => {
      const from = new Date('2026-01-15')
      const to = new Date('2026-02-10')
      const buckets = generateDateBuckets(from, to, 'month')
      expect(buckets.some((b) => b.startsWith('2026-01'))).toBe(true)
      expect(buckets.some((b) => b.startsWith('2026-02'))).toBe(true)
    })
  })

  describe('parseReportQuery', () => {
    it('defaults to last 30 days and day granularity', () => {
      const params = parseReportQuery({})
      expect(params.granularity).toBe('day')
      expect(params.from).toBeInstanceOf(Date)
      expect(params.to).toBeInstanceOf(Date)
    })

    it('parses from, to, branch_id, granularity', () => {
      const params = parseReportQuery({
        from: '2026-01-01',
        to: '2026-01-31',
        branch_id: 'branch-uuid',
        granularity: 'week',
      })
      expect(params.granularity).toBe('week')
      expect(params.branchId).toBe('branch-uuid')
      expect(params.from.getFullYear()).toBe(2026)
      expect(params.from.getMonth()).toBe(0)
      expect(params.from.getDate()).toBe(1)
      expect(params.from.getHours()).toBe(0)
    })

    it('rejects date ranges longer than MAX_REPORT_RANGE_DAYS', () => {
      expect(() => parseReportQuery({ from: '2024-01-01', to: '2026-06-01' })).toThrow(
        /cannot exceed/
      )
    })

    it('includes the full end day for to', () => {
      const params = parseReportQuery({ from: '2026-01-01', to: '2026-01-31' })
      expect(params.to.getHours()).toBe(23)
      expect(params.to.getMinutes()).toBe(59)
      expect(params.to.getDate()).toBe(31)
    })

    it('rejects invalid granularity', () => {
      expect(() => parseReportQuery({ granularity: 'year' })).toThrow('granularity')
    })

    it('bounds a calendar day in the tenant timezone', () => {
      const params = parseReportQuery(
        { from: '2026-09-25', to: '2026-09-25' },
        { timeZone: 'Asia/Beirut' }
      )
      expect(params.fromDate).toBe('2026-09-25')
      expect(params.toDate).toBe('2026-09-25')
      expect(params.from.toISOString()).toBe('2026-09-24T21:00:00.000Z')
      expect(params.to.toISOString()).toBe('2026-09-25T20:59:59.999Z')
      expect(dateBucketExpression('co.placed_at', 'day', 'Asia/Beirut')).toContain(
        "AT TIME ZONE 'Asia/Beirut'"
      )
    })
  })
})
