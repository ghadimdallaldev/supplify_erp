import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

describe('restaurant-payables.service', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const db = await import('../lib/db.js')
    vi.mocked(db.query).mockReset()
  })

  it('getRestaurantPayables returns summary, aging, and top creditors', async () => {
    const db = await import('../lib/db.js')
    vi.mocked(db.query)
      .mockResolvedValueOnce({
        rows: [
          {
            unpaid_count: 2,
            unpaid_total: '500.00',
            overdue_total: '100.00',
            partial_count: 1,
            due_this_week_total: '200.00',
            aging_current: '400.00',
            aging_0_7: '100.00',
            aging_8_30: '0',
            aging_31_60: '0',
            aging_60_plus: '0',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'inv-1',
            invoice_number: 'INV-001',
            supplier_id: 'sup-1',
            supplier_name: 'Fresh Farms',
            status: 'ISSUED',
            invoice_date: '2026-06-01',
            due_date: '2026-06-15',
            total_amount: '300',
            paid_amount: '0',
            balance_due: '300',
            is_overdue: false,
            days_overdue: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            supplier_id: 'sup-1',
            supplier_name: 'Fresh Farms',
            balance_due: '300',
            invoice_count: 1,
            oldest_due_date: '2026-06-15',
          },
        ],
      })

    const { getRestaurantPayables } = await import('./restaurant-payables.service.js')
    const result = await getRestaurantPayables('rest-1')

    expect(result.summary.unpaidCount).toBe(2)
    expect(result.summary.unpaidTotal).toBe(500)
    expect(result.summary.dueThisWeekTotal).toBe(200)
    expect(result.topCreditors[0].supplierName).toBe('Fresh Farms')
    expect(result.invoices[0].invoiceNumber).toBe('INV-001')
  })

  it('getRestaurantStatementOpeningBalance sums prior balance', async () => {
    const db = await import('../lib/db.js')
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [{ opening_balance: '1250.50' }],
    })

    const { getRestaurantStatementOpeningBalance } = await import(
      './restaurant-payables.service.js'
    )
    const balance = await getRestaurantStatementOpeningBalance('rest-1', 'sup-1', '2026-06-01')

    expect(balance).toBe(1250.5)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('invoice_date <'), [
      'rest-1',
      'sup-1',
      '2026-06-01',
    ])
  })

  it('getRestaurantStatementOpeningBalance returns 0 without startDate', async () => {
    const { getRestaurantStatementOpeningBalance } = await import(
      './restaurant-payables.service.js'
    )
    const balance = await getRestaurantStatementOpeningBalance('rest-1', 'sup-1', null)
    expect(balance).toBe(0)
  })

  it('getRestaurantStatementAdjustments sums credit notes in date range', async () => {
    const db = await import('../lib/db.js')
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [{ total_adjustments: '175.25' }],
    })

    const { getRestaurantStatementAdjustments } = await import('./restaurant-payables.service.js')
    const adjustments = await getRestaurantStatementAdjustments(
      'rest-1',
      'sup-1',
      '2026-06-01',
      '2026-06-30'
    )

    expect(adjustments).toBe(175.25)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM credit_note cn'), [
      'rest-1',
      'sup-1',
      '2026-06-01',
      '2026-06-30',
    ])
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("cn.status != 'VOID'"),
      expect.any(Array)
    )
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('issue_date >='),
      expect.any(Array)
    )
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('issue_date <='),
      expect.any(Array)
    )
  })

  it('getRestaurantStatementAdjustments returns all non-void credits without date filters', async () => {
    const db = await import('../lib/db.js')
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [{ total_adjustments: '50' }],
    })

    const { getRestaurantStatementAdjustments } = await import('./restaurant-payables.service.js')
    const adjustments = await getRestaurantStatementAdjustments('rest-1', 'sup-1', null, null)

    expect(adjustments).toBe(50)
    expect(db.query).toHaveBeenCalledWith(expect.not.stringContaining('issue_date >='), [
      'rest-1',
      'sup-1',
    ])
  })

  it('computeRestaurantStatementClosingBalance subtracts adjustments from balance owed', async () => {
    const { computeRestaurantStatementClosingBalance } = await import(
      './restaurant-payables.service.js'
    )

    expect(
      computeRestaurantStatementClosingBalance({
        openingBalance: 1000,
        totalCharges: 500,
        totalPayments: 300,
        totalAdjustments: 75,
      })
    ).toBe(1125)
  })
})
