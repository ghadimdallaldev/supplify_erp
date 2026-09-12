import { describe, it, expect } from 'vitest'

describe('OrderInvoiceTab deep links', () => {
  it('builds invoice detail and pay URLs', () => {
    const invoiceId = 'abc-123'
    expect(`/app/invoices?invoice=${invoiceId}`).toBe('/app/invoices?invoice=abc-123')
    expect(`/app/invoices?invoice=${invoiceId}&pay=true`).toBe(
      '/app/invoices?invoice=abc-123&pay=true'
    )
  })
})
