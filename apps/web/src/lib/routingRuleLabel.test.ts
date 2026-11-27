import { describe, expect, it } from 'vitest'
import { routingRuleLabel } from './routingRuleLabel'

describe('routingRuleLabel', () => {
  it('names a shelf rule by its shelf and warehouse', () => {
    expect(
      routingRuleLabel(
        {
          id: 'r1',
          rule_type: 'shelf',
          priority: 1,
          warehouse_name: 'Cold store',
          shelf_name: 'Cheese counter',
          shelf_name_ar: 'ركن الأجبان',
        },
        'en'
      )
    ).toBe('Shelf: Cheese counter → Cold store (priority 1)')
  })

  it('uses the Arabic category name when the UI is Arabic', () => {
    expect(
      routingRuleLabel(
        {
          id: 'r2',
          rule_type: 'category',
          priority: 2,
          warehouse_name: 'Main',
          category_name: 'Cheese',
          category_name_ar: 'أجبان',
        },
        'ar'
      )
    ).toBe('Category: أجبان → Main (priority 2)')
  })

  it('flags a rule whose shelf was archived', () => {
    expect(
      routingRuleLabel(
        {
          id: 'r3',
          rule_type: 'shelf',
          priority: 1,
          warehouse_name: 'Main',
          shelf_name: 'Old',
          shelf_archived_at: '2026-11-01',
        },
        'en'
      )
    ).toBe('Shelf: Old (archived) → Main (priority 1)')
  })

  it('falls back to the id for unknown rules', () => {
    expect(routingRuleLabel({ id: 'abcdef123456', rule_type: 'zone' }, 'en')).toBe('Zone: abcdef12')
  })
})
