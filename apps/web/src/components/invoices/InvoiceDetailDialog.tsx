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
import { Loader2, Download, CreditCard, ArrowRightLeft, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { formatPrice } from '../../utils/format'
import { apiUrl } from '../../lib/apiBase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function InvoiceDetailDialog(props: any) {
  const {
    showInvoiceDetail,
    setShowInvoiceDetail,
    selectedInvoice,
    invoiceDetail,
    isLoadingDetail,
    downloadingPdfId,
    setDownloadingPdfId,
    isRestaurant,
    canRecordPayments,
    handleOpenPaymentDialog,
    remainingBalance,
  } = props

  return (
    <Dialog open={showInvoiceDetail} onOpenChange={setShowInvoiceDetail}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Invoice {selectedInvoice?.invoice_number}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedInvoice?.id || downloadingPdfId === selectedInvoice.id}
                onClick={async () => {
                  if (!selectedInvoice?.id) return
                  setDownloadingPdfId(selectedInvoice.id)
                  try {
                    const res = await fetch(apiUrl(`/api/invoices/${selectedInvoice.id}/pdf`), {
                      credentials: 'include',
                    })
                    if (!res.ok) throw new Error('Failed to download PDF')
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `invoice-${(selectedInvoice.invoice_number || selectedInvoice.id).replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf`
                    a.click()
                    URL.revokeObjectURL(url)
                    toast.success('PDF downloaded')
                  } catch (e) {
                    toast.error('Could not download PDF')
                  } finally {
                    setDownloadingPdfId(null)
                  }
                }}
              >
                {downloadingPdfId === selectedInvoice?.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                PDF
              </Button>
              {isRestaurant &&
                canRecordPayments &&
                selectedInvoice &&
                parseFloat(selectedInvoice.balance_due || selectedInvoice.total_amount || 0) -
                  parseFloat(selectedInvoice.total_paid || 0) >
                  0 && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setShowInvoiceDetail(false)
                      handleOpenPaymentDialog(selectedInvoice)
                    }}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Make Payment
                  </Button>
                )}
            </div>
          </DialogTitle>
          <DialogDescription>
            Comprehensive invoice details, payment history, and order information
          </DialogDescription>
        </DialogHeader>

        {selectedInvoice && (
          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="payments">Payment History</TabsTrigger>
              <TabsTrigger value="order">Related Order</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6">
              {isLoadingDetail ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-mid)]" />
                </div>
              ) : invoiceDetail?.invoice ? (
                <>
                  {/* Invoice Header */}
                  <div className="grid grid-cols-1 gap-6 border-b pb-6 sm:grid-cols-2">
                    <div>
                      <h3 className="font-semibold mb-2">Bill From:</h3>
                      <p className="font-medium">{invoiceDetail.invoice.supplier_name}</p>
                      {invoiceDetail.invoice.supplier_address && (
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                          {invoiceDetail.invoice.supplier_address}
                        </p>
                      )}
                      {invoiceDetail.invoice.supplier_phone && (
                        <p className="text-sm text-[var(--text-muted)]">
                          {invoiceDetail.invoice.supplier_phone}
                        </p>
                      )}
                      {invoiceDetail.invoice.supplier_email && (
                        <p className="text-sm text-[var(--text-muted)]">
                          {invoiceDetail.invoice.supplier_email}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Invoice Date</p>
                          <p className="font-semibold">
                            {new Date(invoiceDetail.invoice.invoice_date).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Due Date</p>
                          <p
                            className={`font-semibold ${
                              new Date(invoiceDetail.invoice.due_date) < new Date() &&
                              remainingBalance > 0
                                ? 'text-[var(--red)]'
                                : ''
                            }`}
                          >
                            {new Date(invoiceDetail.invoice.due_date).toLocaleDateString()}
                          </p>
                        </div>
                        {invoiceDetail.invoice.order_id && (
                          <div>
                            <p className="text-sm text-[var(--text-muted)]">Order</p>
                            <Link
                              to={`/app/orders/${invoiceDetail.invoice.order_id}`}
                              className="font-semibold text-[var(--brand-mid)] hover:underline"
                            >
                              #{invoiceDetail.invoice.order_id.slice(0, 8)}
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div>
                    <h3 className="font-semibold mb-4">Line Items</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-[var(--brand-ultra)]">
                          <tr>
                            <th className="text-left py-3 px-4 text-sm font-medium">Product</th>
                            <th className="text-left py-3 px-4 text-sm font-medium">SKU</th>
                            <th className="text-right py-3 px-4 text-sm font-medium">Quantity</th>
                            <th className="text-right py-3 px-4 text-sm font-medium">Unit Price</th>
                            <th className="text-right py-3 px-4 text-sm font-medium">Tax</th>
                            <th className="text-right py-3 px-4 text-sm font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceDetail.lineItems?.map((item: any) => (
                            <tr key={item.id} className="border-b hover:bg-[var(--brand-ultra)]">
                              <td className="py-3 px-4">{item.description}</td>
                              <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                                {item.sku || 'N/A'}
                              </td>
                              <td className="py-3 px-4 text-right">{item.quantity}</td>
                              <td className="py-3 px-4 text-right">
                                {formatPrice(item.unit_price)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {parseFloat(item.tax_amount || 0) > 0 && (
                                  <span className="text-xs text-[var(--text-muted)]">
                                    {formatPrice(item.tax_amount)}
                                    {item.tax_rate && ` (${item.tax_rate}%)`}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-medium">
                                {formatPrice(item.line_total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="ml-auto w-80">
                    <div className="space-y-2 border rounded-lg p-4 bg-[var(--brand-ultra)]">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Subtotal</span>
                        <span>{formatPrice(invoiceDetail.invoice.subtotal)}</span>
                      </div>
                      {parseFloat(invoiceDetail.invoice.tax_amount || 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">
                            Tax{' '}
                            {invoiceDetail.invoice.tax_rate
                              ? `(${invoiceDetail.invoice.tax_rate}%)`
                              : ''}
                          </span>
                          <span>{formatPrice(invoiceDetail.invoice.tax_amount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-lg border-t pt-2 mt-2">
                        <span>Total</span>
                        <span>{formatPrice(invoiceDetail.invoice.total_amount)}</span>
                      </div>
                      {parseFloat(invoiceDetail.invoice.total_paid || 0) > 0 && (
                        <div className="flex justify-between text-[var(--mint)] border-t pt-2 mt-2">
                          <span>Paid</span>
                          <span>-{formatPrice(invoiceDetail.invoice.total_paid)}</span>
                        </div>
                      )}
                      {remainingBalance > 0 && (
                        <div className="flex justify-between font-semibold text-lg text-[var(--red)] border-t pt-2 mt-2">
                          <span>Balance Due</span>
                          <span>{formatPrice(remainingBalance)}</span>
                        </div>
                      )}
                      {remainingBalance === 0 && (
                        <div className="flex justify-between font-semibold text-lg text-[var(--mint)] border-t pt-2 mt-2">
                          <span>Status</span>
                          <span>Fully Paid</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {invoiceDetail.invoice.notes && (
                    <div className="border rounded-lg p-4 bg-[var(--brand-ultra)]">
                      <p className="text-sm font-medium text-[var(--text-mid)] mb-1">Notes</p>
                      <p className="text-sm text-[var(--text-muted)]">
                        {invoiceDetail.invoice.notes}
                      </p>
                    </div>
                  )}
                </>
              ) : null}
            </TabsContent>

            <TabsContent value="payments" className="space-y-4">
              <h3 className="font-semibold">Payment History</h3>
              {invoiceDetail?.payments && invoiceDetail.payments.length > 0 ? (
                <div className="space-y-3">
                  {invoiceDetail.payments.map((payment: any) => (
                    <Card key={payment.id}>
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{payment.payment_method}</p>
                            <p className="text-sm text-[var(--text-muted)]">
                              {new Date(payment.payment_date).toLocaleDateString()} •
                              {payment.payment_number && ` ${payment.payment_number}`}
                            </p>
                            {payment.payment_reference && (
                              <p className="text-xs text-[var(--text-muted)] mt-1">
                                Reference: {payment.payment_reference}
                              </p>
                            )}
                            {payment.notes && (
                              <p className="text-xs text-[var(--text-muted)] mt-1">
                                {payment.notes}
                              </p>
                            )}
                            {payment.bank_name && (
                              <p className="text-xs text-[var(--text-muted)]">
                                Bank: {payment.bank_name}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-[var(--mint)]">
                              {formatPrice(payment.payment_amount)}
                            </p>
                            <StatusBadge status={String(payment.status)} className="mt-1" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {canRecordPayments && remainingBalance > 0 && (
                    <div className="border-2 border-[var(--amber-mid)]/40 rounded-lg p-4 bg-[var(--amber-pale)]">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-[var(--amber)]">Outstanding Balance</p>
                          <p className="text-sm text-[var(--amber)]">
                            Due {new Date(selectedInvoice.due_date).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-[var(--red)]">
                            {formatPrice(remainingBalance)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border rounded-lg p-8 text-center bg-[var(--brand-ultra)]">
                  <CreditCard className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3" />
                  <p className="text-[var(--text-muted)]">No payments recorded yet</p>
                  {canRecordPayments && remainingBalance > 0 && (
                    <Button
                      className="mt-4"
                      onClick={() => {
                        setShowInvoiceDetail(false)
                        handleOpenPaymentDialog(selectedInvoice)
                      }}
                    >
                      Record Payment
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="order" className="space-y-4">
              {invoiceDetail?.invoice?.order_id ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Related Order</h3>
                    <Link to={`/app/orders/${invoiceDetail.invoice.order_id}`}>
                      <Button variant="outline" size="sm">
                        View Order
                        <ArrowRightLeft className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Order ID</span>
                          <span className="font-medium">{invoiceDetail.invoice.order_id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Order Status</span>
                          <StatusBadge status={invoiceDetail.invoice.order_status || 'N/A'} />
                        </div>
                        {invoiceDetail.invoice.order_placed_at && (
                          <div className="flex justify-between">
                            <span className="text-[var(--text-muted)]">Placed</span>
                            <span>
                              {new Date(invoiceDetail.invoice.order_placed_at).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-8 text-[var(--text-muted)]">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No related order</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowInvoiceDetail(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
