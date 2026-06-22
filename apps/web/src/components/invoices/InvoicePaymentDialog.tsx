import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Select, SelectItem, SelectTrigger } from '../ui/select'
import { useTranslation } from 'react-i18next'
import { Loader2, CreditCard, CheckCircle } from 'lucide-react'
import { formatPrice } from '../../utils/format'

const PAYMENT_METHODS = [
  'BANK_TRANSFER',
  'CASH',
  'CHECK',
  'CREDIT_CARD',
  'ACH',
  'STRIPE',
  'OTHER',
] as const

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

  const { t } = useTranslation('invoices')

  const paymentMethodOptions = PAYMENT_METHODS.map((method) => (
    <SelectItem key={method} value={method}>
      {t(`payment.methods.${method}`)}
    </SelectItem>
  ))

  return (
    <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('payment.title')}</DialogTitle>
          <DialogDescription>
            {isRestaurant ? t('payment.descriptionRestaurant') : t('payment.descriptionSupplier')}
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
                      {t('payment.invoiceLabel', { number: selectedInvoice.invoice_number })}
                    </p>
                    <p className="text-sm text-[var(--brand-mid)]">
                      {t('payment.due', {
                        date: new Date(selectedInvoice.due_date).toLocaleDateString(),
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[var(--brand-mid)]">
                      {t('payment.remainingBalance')}
                    </p>
                    <p className="text-2xl font-bold text-[var(--text)]">
                      {formatPrice(remainingBalance)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Mode Selection */}
            <div>
              <Label className="mb-2 block">{t('payment.paymentType')}</Label>
              <Tabs value={paymentMode} onValueChange={(v) => setPaymentMode(v as any)}>
                <TabsList className={`grid w-full ${isRestaurant ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <TabsTrigger value="full">{t('payment.modes.full')}</TabsTrigger>
                  <TabsTrigger value="partial">{t('payment.modes.partial')}</TabsTrigger>
                  {isRestaurant && (
                    <TabsTrigger value="credit">{t('payment.modes.credit')}</TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            </div>

            {/* Full Payment Mode */}
            {paymentMode === 'full' && (
              <div className="space-y-4">
                <div className="bg-[var(--mint-pale)] border border-[var(--mint)]/35 rounded-lg p-4">
                  <p className="text-sm text-[var(--mint)]">
                    <CheckCircle className="h-4 w-4 inline mr-2" />
                    {t('payment.fullBalanceNote')} <strong>{formatPrice(remainingBalance)}</strong>
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{t('payment.paymentMethod')}</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>{paymentMethodOptions}</SelectTrigger>
                    </Select>
                  </div>

                  <div>
                    <Label>{t('payment.paymentDate')}</Label>
                    <Input type="date" value={new Date().toISOString().split('T')[0]} required />
                  </div>
                </div>

                <div>
                  <Label>{t('payment.paymentReference')}</Label>
                  <Input
                    placeholder={t('payment.referencePlaceholder')}
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </div>

                {(paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'ACH') && (
                  <div>
                    <Label>{t('payment.bankName')}</Label>
                    <Input
                      placeholder={t('payment.bankNamePlaceholder')}
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                  </div>
                )}

                <div>
                  <Label>{t('payment.notes')}</Label>
                  <Textarea
                    placeholder={t('payment.notesPlaceholder')}
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
                  <Label>{t('payment.paymentAmount')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={remainingBalance}
                    placeholder={t('payment.maxAmount', { amount: formatPrice(remainingBalance) })}
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
                    {t('payment.remainingAfter', {
                      amount: formatPrice(remainingBalance - paymentAmount),
                    })}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{t('payment.paymentMethod')}</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>{paymentMethodOptions}</SelectTrigger>
                    </Select>
                  </div>

                  <div>
                    <Label>{t('payment.paymentDate')}</Label>
                    <Input type="date" value={new Date().toISOString().split('T')[0]} required />
                  </div>
                </div>

                <div>
                  <Label>{t('payment.paymentReference')}</Label>
                  <Input
                    placeholder={t('payment.referencePlaceholder')}
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </div>

                {(paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'ACH') && (
                  <div>
                    <Label>{t('payment.bankName')}</Label>
                    <Input
                      placeholder={t('payment.bankNamePlaceholder')}
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                  </div>
                )}

                <div>
                  <Label>{t('payment.notes')}</Label>
                  <Textarea
                    placeholder={t('payment.notesPlaceholder')}
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                  />
                </div>

                {/* Credit Option in Partial Payment */}
                {creditNotes.length > 0 && (
                  <div className="border rounded-lg p-4 bg-[var(--brand-ultra)]">
                    <Label className="mb-2 block">{t('payment.applyCreditOptional')}</Label>
                    <Select value={selectedCreditNoteId} onValueChange={setSelectedCreditNoteId}>
                      <SelectTrigger placeholder={t('payment.selectCreditNote')}>
                        {creditNotes.map((cn: any) => (
                          <SelectItem key={cn.id} value={cn.id}>
                            {t('payment.creditAvailable', {
                              number: cn.credit_note_number,
                              amount: formatPrice(cn.remaining_amount),
                            })}
                          </SelectItem>
                        ))}
                      </SelectTrigger>
                    </Select>
                    {selectedCreditNoteId && (
                      <div className="mt-3">
                        <Label>{t('payment.creditAmount')}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={
                            creditNotes.find((cn: any) => cn.id === selectedCreditNoteId)
                              ?.remaining_amount || 0
                          }
                          placeholder={t('payment.amountToApply')}
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
                      <Label>{t('payment.selectCreditNoteRequired')}</Label>
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
                        <SelectTrigger placeholder={t('payment.selectCreditNote')}>
                          {creditNotes.map((cn: any) => (
                            <SelectItem key={cn.id} value={cn.id}>
                              {t('payment.creditAvailable', {
                                number: cn.credit_note_number,
                                amount: formatPrice(cn.remaining_amount),
                              })}
                              {cn.reason && ` (${cn.reason})`}
                            </SelectItem>
                          ))}
                        </SelectTrigger>
                      </Select>
                    </div>

                    {selectedCreditNoteId && (
                      <div>
                        <Label>{t('payment.creditAmountRequired')}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={
                            creditNotes.find((cn: any) => cn.id === selectedCreditNoteId)
                              ?.remaining_amount || 0
                          }
                          placeholder={t('payment.amountToApply')}
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
                          {t('payment.available', {
                            amount: formatPrice(
                              creditNotes.find((cn: any) => cn.id === selectedCreditNoteId)
                                ?.remaining_amount
                            ),
                          })}
                        </p>
                      </div>
                    )}

                    <div>
                      <Label>{t('payment.paymentDate')}</Label>
                      <Input type="date" value={new Date().toISOString().split('T')[0]} required />
                    </div>

                    <div>
                      <Label>{t('payment.notes')}</Label>
                      <Textarea
                        placeholder={t('payment.creditNotesPlaceholder')}
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="border rounded-lg p-8 text-center bg-[var(--brand-ultra)]">
                    <CreditCard className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-[var(--text-muted)] mb-2">{t('payment.noCreditNotes')}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {t('payment.switchToPayment')}
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
                  {t('payment.paidByHq')}
                </Label>
              </div>
              {paidByHQ && (
                <div className="mt-2">
                  <Label>{t('payment.hqNotes')}</Label>
                  <Textarea
                    placeholder={t('payment.hqNotesPlaceholder')}
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
                        <span className="text-[var(--text-muted)]">{t('payment.cashPayment')}</span>
                        <span className="font-medium">{formatPrice(paymentAmount)}</span>
                      </div>
                    )}
                    {creditAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">
                          {t('payment.creditApplied')}
                        </span>
                        <span className="font-medium text-[var(--mint)]">
                          {formatPrice(creditAmount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-lg border-t pt-2">
                      <span>{t('payment.totalPayment')}</span>
                      <span className="text-[var(--mint)]">
                        {formatPrice(paymentAmount + creditAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span>{t('payment.newBalance')}</span>
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
            {t('payment.cancel')}
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
                {t('payment.processing')}
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                {t('payment.recordPayment')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
