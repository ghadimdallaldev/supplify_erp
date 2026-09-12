import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminExecutiveSummary } from './AdminExecutiveSummary'
import type { AdminOverview } from '../../lib/adminOverview'

const mockOverview: AdminOverview = {
  tenantCounts: { SUPPLIER: 12, RESTAURANT: 8 },
  subscriptionStats: { ACTIVE: 15, TRIALING: 3 },
  tenants: { totalSuppliers: 20, totalRestaurants: 15 },
  orders: { today: 42, week: 200, month: 800 },
}

describe('AdminExecutiveSummary', () => {
  it('renders KPI cards from overview data', () => {
    render(<AdminExecutiveSummary overview={mockOverview} recentErrorCount={0} />)
    expect(screen.getByTestId('admin-executive-summary')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-total-tenants')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-orders-today')).toHaveTextContent('42')
    expect(screen.getByTestId('kpi-system-health')).toHaveTextContent('Healthy')
  })
})
