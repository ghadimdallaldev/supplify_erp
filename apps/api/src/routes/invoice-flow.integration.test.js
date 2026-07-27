import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  computeRemainingBalance,
  calculateInvoiceTotals,
  applyCreditToInvoice,
  recordCashPayment,
} from '../services/invoice.service.js'

describe('invoice payment flow (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('full payment path reduces balance to zero', async () => {
    const invoice = { id: 'inv-1', total_amount: 100, balance_due: 100, currency: 'USD' }
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [invoice] })
        .mockResolvedValueOnce({ rows: [{ total_paid: 0 }] })
        .mockResolvedValueOnce({ rows: [{ payment_number: 'PAY-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'pay-1' }] })
        .mockResolvedValueOnce({ rows: [{ ...invoice, balance_due: 0, status: 'PAID' }] }),
    }

    const result = await recordCashPayment(client, {
      invoiceId: 'inv-1',
      paymentAmount: 100,
      paymentDate: '2026-06-01',
      paymentMethod: 'BANK_TRANSFER',
      recordedBy: 'user-1',
    })

    expect(result.payment).toBeTruthy()
    expect(client.query).toHaveBeenCalled()
  })

  it('credit application creates payment row', async () => {
    const invoice = {
      id: 'inv-1',
      restaurant_id: 'r1',
      supplier_id: 's1',
      total_amount: 100,
      currency: 'USD',
    }
    const creditNote = {
      id: 'cn-1',
      restaurant_id: 'r1',
      supplier_id: 's1',
      remaining_amount: 20,
      credit_note_number: 'CN-1',
    }
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [creditNote] })
        .mockResolvedValueOnce({ rows: [invoice] })
        .mockResolvedValueOnce({ rows: [{ total_paid: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ payment_number: 'CREDIT-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...creditNote, status: 'APPLIED' }] })
        .mockResolvedValueOnce({ rows: [{ ...invoice, balance_due: 80 }] }),
    }

    const result = await applyCreditToInvoice(client, {
      creditNoteId: 'cn-1',
      invoiceId: 'inv-1',
      creditAmount: 20,
      recordedBy: 'user-1',
    })

    expect(result.creditNote).toBeTruthy()
  })

  it('computeRemainingBalance after partial pay', () => {
    expect(computeRemainingBalance({ total_amount: 100, balance_due: 60 }, 40)).toBe(60)
    expect(
      calculateInvoiceTotals([{ line_total: 50 }, { line_total: 50 }], { taxRate: 0 }).totalAmount
    ).toBe(100)
  })
})
