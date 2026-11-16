import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { OrdersResponsiveList } from './OrdersResponsiveList'
import { testI18n, resetTestI18n } from '../../test/i18n'

beforeEach(async () => {
  cleanup()
  await resetTestI18n()
})

function renderList(isSupplier: boolean) {
  render(
    <MemoryRouter>
      <I18nextProvider i18n={testI18n}>
        <OrdersResponsiveList
          orders={[
            {
              id: 'order-test-123',
              restaurant_name: 'My own kitchen',
              customer_display_name: 'My own kitchen',
              supplier_name: 'The actual supplier',
              total_amount: 12.5,
              currency: 'EUR',
              status: 'PLACED',
              created_at: '2026-11-16T10:00:00Z',
            },
          ]}
          t={testI18n.getFixedT('en', 'orders')}
          ordersTitle="Orders"
          isSupplier={isSupplier}
          canEditOrders={false}
          canDeclineOrder={false}
          canCreateOrders={false}
          disputesEnabled={false}
          allDisputes={[]}
          updatingOrderId={null}
          hasActiveFilters={false}
          activeTab="all"
          onStatusUpdate={() => {}}
          onSendReminder={() => {}}
          onDecline={() => {}}
        />
      </I18nextProvider>
    </MemoryRouter>
  )
}

describe('order counterparty and currency', () => {
  it('shows the supplier to restaurant users in the table and phone card', () => {
    renderList(false)
    expect(screen.getByRole('columnheader', { name: 'Supplier' })).toBeInTheDocument()
    expect(screen.getByText('The actual supplier')).toBeInTheDocument()
    expect(screen.getByText('Supplier: The actual supplier')).toBeInTheDocument()
    expect(screen.queryByText('My own kitchen')).not.toBeInTheDocument()
  })
  it('keeps the restaurant counterparty for supplier users', () => {
    renderList(true)
    expect(screen.getByRole('columnheader', { name: 'Restaurant' })).toBeInTheDocument()
    expect(screen.getByText('My own kitchen')).toBeInTheDocument()
  })
  it('uses the stored order currency in both table and phone card', () => {
    renderList(false)
    expect(screen.getAllByText('€12.50')).toHaveLength(2)
    expect(screen.queryByText('$12.50')).not.toBeInTheDocument()
  })
})
