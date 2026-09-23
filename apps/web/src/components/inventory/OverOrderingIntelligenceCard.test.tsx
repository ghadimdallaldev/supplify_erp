import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'

import { OverOrderingIntelligenceCard } from './OverOrderingIntelligenceCard'
import { testI18n } from '../../test/i18n'

const mockQuery = vi.fn()

vi.mock('../../services/api/endpoints/priceIntelligence', () => ({
  useGetOverOrderingIntelligenceQuery: (...args: unknown[]) => mockQuery(...args),
}))

describe('OverOrderingIntelligenceCard', () => {
  it('renders only supported signals and makes unit mismatches explicit', () => {
    mockQuery.mockReturnValue({
      data: {
        summary: {
          productsObserved: 2,
          productsWithCompleteComparableData: 1,
          flaggedProducts: 1,
          productsWithReceiptUnitMismatch: 1,
        },
        products: [
          {
            productId: 'p1',
            productName: 'Tomatoes',
            productUnit: 'kg',
            supplierName: 'Fresh Co',
            orders: { count: 3, quantity: 120 },
            receiving: { quantity: 110, matchingLines: 3, mismatchedLines: 0 },
            usage: { quantity: 20 },
            waste: { quantity: 10, sharePct: 33.3 },
            stock: { currentQuantity: 90, coverageDays: 405 },
            comparisons: { receiptToDepletionRatio: 3.67, completeComparableData: true },
            signals: ['excess_stock_coverage', 'waste_with_excess_stock'],
          },
        ],
      },
      isLoading: false,
      isError: false,
    })

    render(
      <I18nextProvider i18n={testI18n}>
        <OverOrderingIntelligenceCard />
      </I18nextProvider>
    )

    expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    expect(screen.getByText('High stock cover after repeated receipts')).toBeInTheDocument()
    expect(screen.getByText('Waste is high while stock cover remains high')).toBeInTheDocument()
    expect(
      screen.getByText(/Some products have receiving lines in a different unit/)
    ).toBeInTheDocument()
  })
})
