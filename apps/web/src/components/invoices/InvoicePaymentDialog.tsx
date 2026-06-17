import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { StatusBadge } from '../ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Select, SelectItem, SelectTrigger } from '../ui/select'
import { Loader2, Download, CreditCard, ArrowRightLeft, CheckCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { formatPrice } from '../../utils/format'
import { apiUrl } from '../../lib/apiBase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function InvoicePaymentDialog(props: any) {
  const {
    showPaymentDialog,
    setShowPaymentDialog,
    selectedInvoice,
    remainingBalance,
    isRestaurant,
    paymentMode,
    setPaymentMode,
    paymentAmount,
    setPaymentAmount,
    creditAmount,
    setCreditAmount,
    selectedCreditNoteId,
    setSelectedCreditNoteId,
    paymentMethod,
    setPaymentMethod,
    paymentReference,
    setPaymentReference,
    bankName,
    setBankName,
    paymentNotes,
    setPaymentNotes,
    paidByHQ,
    setPaidByHQ,
    hqNotes,
    setHqNotes,
    creditNotes,
    handleRecordPayment,
    isProcessingAnyPayment,
  } = props

  return (
    <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            {isRestaurant
              ? 'Record full payment, partial payment, or apply credit notes'
              : 'Record payment received from the restaurant against this invoice'}
          </DialogDescription>
        </DialogHeader>

        {selectedInvoice && (
          <div className="space-y-6">
            {/* Payment Summary */}
            <Card className="bg-[var(--brand-ultra)] border-[var(--app-border)]">
              <CardContent className="pt-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-[var(--text)]">
                      Invoice {selectedInvoice.invoice_number}
                    </p>
                    <p className="text-sm text-[var(--brand-mid)]">
                      Due {new Date(selectedInvoice.due_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[var(--brand-mid)]">Remaining Balance</p>
                    <p className="text-2xl font-bold text-[var(--text)]">
                      {formatPrice(remainingBalance)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Mode Selection */}
            <div>
              <Label className="mb-2 block">Payment Type</Label>
              <Tabs value={paymentMode} onValueChange={(v) => setPaymentMode(v as any)}>
                <TabsList className={`grid w-full ${isRestaurant ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <TabsTrigger value="full">Full Payment</TabsTrigger>
                  <TabsTrigger value="partial">Partial Payment</TabsTrigger>
                  {isRestaurant && <TabsTrigger value="credit">Apply Credit</TabsTrigger>}
                </TabsList>
              </Tabs>
            </div>

            {/* Full Payment Mode */}
            {paymentMode === 'full' && (
              <div className="space-y-4">
                <div className="bg-[var(--mint-pale)] border border-[var(--mint)]/35 rounded-lg p-4">
                  <p className="text-sm text-[var(--mint)]">
                    <CheckCircle className="h-4 w-4 inline mr-2" />
                    Paying full remaining balance: <strong>{formatPrice(remainingBalance)}</strong>
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Payment Method *</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                        <SelectItem value="CASH">Cash</SelectItem>
                        <SelectItem value="CHECK">Check</SelectItem>
                        <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                        <SelectItem value="ACH">ACH</SelectItem>
                        <SelectItem value="STRIPE">Stripe</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectTrigger>
                    </Select>
                  </div>

                  <div>
                    <Label>Payment Date *</Label>
                    <Input type="date" value={new Date().toISOString().split('T')[0]} required />
                  </div>
                </div>

                <div>
                  <Label>Payment Reference</Label>
                  <Input
                    placeholder="Transaction ID, check number, etc."
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </div>

                {(paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'ACH') && (
                  <div>
                    <Label>Bank Name</Label>
                    <Input
                      placeholder="Bank name"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                  </div>
                )}

                <div>
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Payment notes..."
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Partial Payment Mode */}
            {paymentMode === 'partial' && (
              <div className="space-y-4">
                <div>
                  <Label>Payment Amount *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={remainingBalance}
                    placeholder={`Max: ${formatPrice(remainingBalance)}`}
                    value={paymentAmount || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val) && val > 0) {
                        setPaymentAmount(Math.min(val, remainingBalance))
                      } else {
                        setPaymentAmount(0)
                      }
                    }}
                  />
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Remaining after payment: {formatPrice(remainingBalance - paymentAmount)}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Payment Method *</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                        <SelectItem value="CASH">Cash</SelectItem>
                        <SelectItem value="CHECK">Check</SelectItem>
                        <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                        <SelectItem value="ACH">ACH</SelectItem>
                        <SelectItem value="STRIPE">Stripe</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectTrigger>
                    </Select>
                  </div>

                  <div>
                    <Label>Payment Date *</Label>
                    <Input type="date" value={new Date().toISOString().split('T')[0]} required />
                  </div>
                </div>

                <div>
                  <Label>Payment Reference</Label>
                  <Input
                    placeholder="Transaction ID, check number, etc."
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </div>

                {(paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'ACH') && (
                  <div>
                    <Label>Bank Name</Label>
                    <Input
                      placeholder="Bank name"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                  </div>
                )}

                <div>
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Payment notes..."
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                  />
                </div>

                {/* Credit Option in Partial Payment */}
                {creditNotes.length > 0 && (
                  <div className="border rounded-lg p-4 bg-[var(--brand-ultra)]">
                    <Label className="mb-2 block">Apply Credit Note (Optional)</Label>
                    <Select value={selectedCreditNoteId} onValueChange={setSelectedCreditNoteId}>
                      <SelectTrigger placeholder="Select credit note...">
                        {creditNotes.map((cn: any) => (
                          <SelectItem key={cn.id} value={cn.id}>
                            {cn.credit_note_number} - {formatPrice(cn.remaining_amount)} available
                          </SelectItem>
                        ))}
                      </SelectTrigger>
                    </Select>
                    {selectedCreditNoteId && (
                      <div className="mt-3">
                        <Label>Credit Amount</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={
                            creditNotes.find((cn: any) => cn.id === selectedCreditNoteId)
                              ?.remaining_amount || 0
                          }
                          placeholder="Amount to apply"
                          value={creditAmount || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value)
                            const maxCredit =
                              creditNotes.find((cn: any) => cn.id === selectedCreditNoteId)
                                ?.remaining_amount || 0
                            if (!isNaN(val) && val > 0) {
                              setCreditAmount(
                                Math.min(val, maxCredit, remainingBalance - paymentAmount)
                              )
                            } else {
                              setCreditAmount(0)
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Credit Only Mode */}
            {paymentMode === 'credit' && (
              <div className="space-y-4">
                {creditNotes.length > 0 ? (
                  <>
                    <div>
                      <Label>Select Credit Note *</Label>
                      <Select
                        value={selectedCreditNoteId}
                        onValueChange={(value) => {
                          setSelectedCreditNoteId(value)
                          const creditNote = creditNotes.find((cn: any) => cn.id === value)
                          if (creditNote) {
                            setCreditAmount(
                              Math.min(
                                parseFloat(creditNote.remaining_amount || 0),
                                remainingBalance
                              )
                            )
                          }
                        }}
                      >
                        <SelectTrigger placeholder="Select credit note...">
                          {creditNotes.map((cn: any) => (
                            <SelectItem key={cn.id} value={cn.id}>
                              {cn.credit_note_number} - {formatPrice(cn.remaining_amount)} available
                              {cn.reason && ` (${cn.reason})`}
                            </SelectItem>
                          ))}
                        </SelectTrigger>
                      </Select>
                    </div>

                    {selectedCreditNoteId && (
                      <div>
                        <Label>Credit Amount to Apply *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={
                            creditNotes.find((cn: any) => cn.id === selectedCreditNoteId)
                              ?.remaining_amount || 0
                          }
                          placeholder="Amount to apply"
                          value={creditAmount || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value)
                            const maxCredit =
                              creditNotes.find((cn: any) => cn.id === selectedCreditNoteId)
                                ?.remaining_amount || 0
                            if (!isNaN(val) && val > 0) {
                              setCreditAmount(Math.min(val, maxCredit, remainingBalance))
                            } else {
                              setCreditAmount(0)
                            }
                          }}
                        />
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          Available:{' '}
                          {formatPrice(
                            creditNotes.find((cn: any) => cn.id === selectedCreditNoteId)
                              ?.remaining_amount
                          )}
                        </p>
                      </div>
                    )}

                    <div>
                      <Label>Payment Date</Label>
                      <Input type="date" value={new Date().toISOString().split('T')[0]} required />
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        placeholder="Credit application notes..."
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="border rounded-lg p-8 text-center bg-[var(--brand-ultra)]">
                    <CreditCard className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-[var(--text-muted)] mb-2">No available credit notes</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      You can switch to full or partial payment instead
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* HQ Payment Option (for all modes) */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="paidByHQ"
                  checked={paidByHQ}
                  onChange={(e) => setPaidByHQ(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="paidByHQ" className="cursor-pointer">
                  Paid by HQ / Corporate
                </Label>
              </div>
              {paidByHQ && (
                <div className="mt-2">
                  <Label>HQ Payment Notes</Label>
                  <Textarea
                    placeholder="HQ payment details, approval reference, etc."
                    value={hqNotes}
                    onChange={(e) => setHqNotes(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Payment Summary */}
            {(paymentAmount > 0 || creditAmount > 0) && (
              <Card className="bg-[var(--mint-pale)] border-[var(--mint)]/35">
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    {paymentAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Cash Payment</span>
                        <span className="font-medium">{formatPrice(paymentAmount)}</span>
                      </div>
                    )}
                    {creditAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Credit Applied</span>
                        <span className="font-medium text-[var(--mint)]">
                          {formatPrice(creditAmount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-lg border-t pt-2">
                      <span>Total Payment</span>
                      <span className="text-[var(--mint)]">
                        {formatPrice(paymentAmount + creditAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span>New Balance</span>
                      <span
                        className={
                          remainingBalance - paymentAmount - creditAmount > 0
                            ? 'text-[var(--amber)]'
                            : 'text-[var(--mint)]'
                        }
                      >
                        {formatPrice(remainingBalance - paymentAmount - creditAmount)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleRecordPayment}
            disabled={
              isProcessingAnyPayment ||
              (paymentMode === 'credit' && creditAmount <= 0) ||
              (paymentMode === 'partial' && paymentAmount <= 0)
            }
          >
            {isProcessingAnyPayment ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                Record Payment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
