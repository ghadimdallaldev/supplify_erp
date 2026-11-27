import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('reorder-cadence config', () => {
  it('exports sensible defaults', async () => {
    const mod = await import('./reorder-cadence.service.js')
    expect(mod.MIN_ORDERS_FOR_CADENCE).toBeGreaterThanOrEqual(3)
    expect(mod.LOOKBACK_DAYS).toBe(180)
  })
})

describe('reorder-cadence missed detection', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('detects missed cadence when no order on expected day', async () => {
    const monday = new Date('2026-06-01T10:00:00Z')
    const queryMock = vi.fn(async (sql) => {
      const s = String(sql)
      if (s.includes('restaurant_order_cadence') && s.includes('day_of_week')) {
        return {
          rows: [
            {
              id: 'c1',
              restaurant_id: 'r1',
              supplier_id: 's1',
              product_id: 'p1',
              category_id: null,
              cadence_level: 'product',
              day_of_week: 1,
              label: 'Chicken from ABC',
              restaurant_name: 'Restaurant X',
              supplier_name: 'ABC',
              reminder_date: new Date('2026-06-01T00:00:00Z'),
            },
          ],
        }
      }
      if (s.includes('reorder_cadence_reminder_log')) return { rows: [] }
      if (s.includes('customer_order') && s.includes('NOT EXISTS')) return { rows: [] }
      if (s.includes('customer_order')) return { rows: [] }
      return { rows: [] }
    })

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    const { getMissedCadencesForToday } = await import('./reorder-cadence.service.js')
    const missed = await getMissedCadencesForToday({ now: monday })
    expect(missed.length).toBe(1)
    expect(missed[0].restaurant_name).toBe('Restaurant X')
    expect(missed[0].reminderDate).toBe('2026-06-01')
  })
})

describe('reorder-cadence labels', () => {
  it('names the platform category or product in the reader language', async () => {
    const { cadenceLabel } = await import('./reorder-cadence.service.js')
    const category = {
      cadence_level: 'category',
      label: 'stale',
      supplier_name: 'Fromagerie',
      label_category_name: 'Cheese',
      label_category_name_ar: 'أجبان',
    }
    expect(cadenceLabel(category, 'en')).toBe('Cheese from Fromagerie')
    expect(cadenceLabel(category, 'ar')).toBe('أجبان من Fromagerie')
    const product = {
      cadence_level: 'product',
      label: 'stale',
      supplier_name: 'ABC',
      label_product_name: 'Chicken',
      label_product_name_ar: null,
    }
    expect(cadenceLabel(product, 'ar')).toBe('Chicken من ABC')
    expect(cadenceLabel({ cadence_level: 'category', label: 'Stored' }, 'en')).toBe('Stored')
  })
})

describe('reorder-cadence reminder locks', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  function missedCadenceRow() {
    return {
      id: 'cad-1',
      restaurant_id: 'rest-1',
      supplier_id: 'sup-1',
      product_id: 'prod-1',
      category_id: null,
      cadence_level: 'product',
      day_of_week: 1,
      label: 'Chicken from ABC',
      restaurant_name: 'Restaurant X',
      supplier_name: 'ABC',
      reminder_date: '2026-06-01',
    }
  }

  it('notifies only unlocked cadence recipients', async () => {
    const queryMock = vi.fn(async (sql, params = []) => {
      const s = String(sql)
      if (s.includes('FROM restaurant_order_cadence c')) {
        return { rows: [missedCadenceRow()] }
      }
      if (s.includes('FROM subscription')) {
        return { rows: params[0] === 'rest-1' ? [{ ok: 1 }] : [] }
      }
      if (s.includes('INSERT INTO reorder_cadence_reminder_log')) {
        return { rows: [{ id: 'log-1' }] }
      }
      return { rows: [] }
    })

    const notifyTenantUsers = vi.fn().mockResolvedValue([{ id: 'n1' }])
    const isFeatureEnabled = vi.fn().mockResolvedValue(true)

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    vi.doMock('./notification.service.js', () => ({ notifyTenantUsers }))
    vi.doMock('../lib/subscription.js', () => ({ isFeatureEnabled }))

    const { runCadenceReminderCheck } = await import('./reorder-cadence.service.js')
    const result = await runCadenceReminderCheck()

    expect(result.notificationsSent).toBe(1)
    expect(notifyTenantUsers).toHaveBeenCalledTimes(1)
    expect(notifyTenantUsers).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'rest-1', tenantType: 'RESTAURANT' })
    )
    // Each recipient gets the text in their own language.
    const { contentForLocale } = notifyTenantUsers.mock.calls[0][0]
    expect(contentForLocale('en').message).toBe(
      'You usually order Chicken from ABC on Mondays. No order was placed today.'
    )
    expect(contentForLocale('ar').message).toContain('الاثنين')
    const updateCall = queryMock.mock.calls.find((call) =>
      String(call[0]).includes('UPDATE reorder_cadence_reminder_log')
    )
    expect(updateCall?.[1]).toEqual(['cad-1', '2026-06-01', true, false])
  })

  it('does not claim reminder logs when all cadence recipients are locked', async () => {
    const queryMock = vi.fn(async (sql) => {
      const s = String(sql)
      if (s.includes('FROM restaurant_order_cadence c')) {
        return { rows: [missedCadenceRow()] }
      }
      if (s.includes('FROM subscription')) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    const notifyTenantUsers = vi.fn()
    const isFeatureEnabled = vi.fn().mockResolvedValue(true)

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    vi.doMock('./notification.service.js', () => ({ notifyTenantUsers }))
    vi.doMock('../lib/subscription.js', () => ({ isFeatureEnabled }))

    const { runCadenceReminderCheck } = await import('./reorder-cadence.service.js')
    const result = await runCadenceReminderCheck()

    expect(result.notificationsSent).toBe(0)
    expect(notifyTenantUsers).not.toHaveBeenCalled()
    expect(
      queryMock.mock.calls.some((call) =>
        String(call[0]).includes('INSERT INTO reorder_cadence_reminder_log')
      )
    ).toBe(false)
  })
})
