import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InvoiceListPanel } from './InvoiceListPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      if (key === 'list.daysOverdue') return `${opts?.count ?? 0} days overdue`
      return key
    },
  }),
}))

describe('InvoiceListPanel', () => {
  it('shows remaining from balance_due without double subtracting paid', () => {
    render(
      <InvoiceListPanel
        search=""
        setSearch={() => {}}
        statusFilter="ALL"
        setStatusFilter={() => {}}
        supplierFilter="ALL"
        setSupplierFilter={() => {}}
        suppliers={[]}
        filteredInvoices={[
          {
            id: 'inv-1',
            invoice_number: 'INV-001',
            supplier_name: 'Farm',
            status: 'ISSUED',
            invoice_date: '2026-06-01',
            due_date: '2026-06-15',
            total_amount: 100,
            total_paid: 40,
            balance_due: 60,
          },
        ]}
        canRecordPayments={false}
        onSelectInvoice={() => {}}
        onPayInvoice={() => {}}
      />
    )
    expect(screen.getAllByText(/60/).length).toBeGreaterThan(0)
  })
})
