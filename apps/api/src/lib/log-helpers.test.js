import { describe, it, expect } from 'vitest'
import { summarizeQuery } from './log-helpers.js'

describe('log-helpers', () => {
  describe('summarizeQuery', () => {
    it('extracts op, primary table, and join count', () => {
      const sql = `
        SELECT s.*, COALESCE((SELECT COUNT(*) FROM product p WHERE p.supplier_id = s.id), 0)
        FROM supplier s
        LEFT JOIN supplier_follow sf ON sf.supplier_id = s.id
        WHERE s.id = $1
      `
      const summary = summarizeQuery(sql)
      expect(summary.op).toBe('SELECT')
      expect(summary.table).toBe('supplier')
      expect(summary.joins).toBe(1)
      expect(summary.length).toBeGreaterThan(0)
    })

    it('handles INSERT', () => {
      const summary = summarizeQuery('INSERT INTO restaurant (name) VALUES ($1)')
      expect(summary.op).toBe('INSERT')
      expect(summary.table).toBe('restaurant')
    })
  })
})
