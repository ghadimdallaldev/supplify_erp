import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { FileText, DollarSign, Clock, CheckCircle, XCircle, Search, Filter, Download, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { useAppSelector } from '../hooks/redux'
import { useGetRestaurantInvoicesQuery, useGetRestaurantInvoiceQuery, useMarkInvoicePaidMutation } from '../services/api'

export function InvoicesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false)
  
  const { user } = useAppSelector((state) => state.auth)
  const isRestaurant = user?.role === 'RESTAURANT'
  
  // Fetch invoices from database
  const { data: invoicesData, isLoading, refetch } = useGetRestaurantInvoicesQuery({})
  const { data: invoiceDetail, isLoading: isLoadingDetail } = useGetRestaurantInvoiceQuery(
    selectedInvoice?.id || '',
    { skip: !selectedInvoice?.id }
  )
  const [markPaid] = useMarkInvoicePaidMutation()

  const invoices = invoicesData?.invoices || []

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ISSUED': return 'default'
      case 'PARTIALLY_PAID': return 'secondary'
      case 'PAID': return 'success'
      case 'OVERDUE': return 'destructive'
      case 'VOID': return 'outline'
      default: return 'secondary'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ISSUED': return <FileText className="h-4 w-4" />
      case 'PARTIALLY_PAID': return <Clock className="h-4 w-4" />
      case 'PAID': return <CheckCircle className="h-4 w-4" />
      case 'OVERDUE': return <XCircle className="h-4 w-4" />
      case 'VOID': return <XCircle className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
                         invoice.supplier_name?.toLowerCase().includes(search.toLowerCase()) ||
                         invoice.restaurant_name?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || invoice.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: invoices.length,
    unpaid: invoices.filter(i => i.status !== 'PAID' && i.status !== 'VOID').length,
    overdue: invoices.filter(i => i.status === 'OVERDUE' || (i.days_overdue && i.days_overdue > 0)).length,
    totalAmount: invoices.reduce((sum, i) => sum + parseFloat(i.total_amount || 0), 0),
  }

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return
    
    try {
      await markPaid({
        invoiceId: selectedInvoice.id,
        data: {
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethod: 'BANK_TRANSFER',
          notes: 'Payment recorded',
        }
      }).unwrap()
      
      toast.success('Payment recorded successfully!')
      setShowInvoiceDetail(false)
      setSelectedInvoice(null)
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to record payment')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600 mt-2">Manage billing and payments</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Invoices</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Unpaid</p>
                <p className="text-2xl font-bold">{stats.unpaid}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Overdue</p>
                <p className="text-2xl font-bold">{stats.overdue}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="text-2xl font-bold">${stats.totalAmount.toFixed(2)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Invoice List</CardTitle>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 border rounded-md px-3 py-1">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-none outline-none"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1 border rounded-md"
              >
                <option value="ALL">All Status</option>
                <option value="ISSUED">Issued</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="PAID">Paid</option>
                <option value="OVERDUE">Overdue</option>
                <option value="VOID">Void</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  setSelectedInvoice(invoice)
                  setShowInvoiceDetail(true)
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{invoice.invoice_number}</h3>
                      <Badge variant={getStatusColor(invoice.status)}>
                        {getStatusIcon(invoice.status)}
                        <span className="ml-1">{invoice.status}</span>
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">{isRestaurant ? invoice.supplier_name : invoice.restaurant_name}</p>
                    <div className="flex gap-4 text-xs text-gray-500 mt-2">
                      <span>Invoice Date: {new Date(invoice.invoice_date).toLocaleDateString()}</span>
                      <span>Due Date: {new Date(invoice.due_date).toLocaleDateString()}</span>
                      {invoice.order_id && (
                        <>
                          <span className="border-l pl-3">Order ID: {invoice.order_id.slice(0, 8)}...</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            invoice.order_status === 'DELIVERED' ? 'bg-green-100 text-green-800' :
                            invoice.order_status === 'SHIPPED' ? 'bg-blue-100 text-blue-800' :
                            invoice.order_status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {invoice.order_status}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">${parseFloat(invoice.total_amount || 0).toFixed(2)}</p>
                    <p className="text-sm text-gray-600">
                      Balance: ${parseFloat(invoice.balance_due || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-green-600">
                      Paid: ${parseFloat(invoice.total_paid || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {filteredInvoices.length === 0 && (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-900 mb-2">No invoices found</p>
                <p className="text-gray-600">Try adjusting your filters</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoice Detail Dialog */}
      <Dialog open={showInvoiceDetail} onOpenChange={setShowInvoiceDetail}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Invoice {selectedInvoice?.invoice_number}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </div>
            </DialogTitle>
            <DialogDescription>
              Invoice details and payment information
            </DialogDescription>
          </DialogHeader>
          
            {selectedInvoice && (
            <div className="space-y-6">
              {isLoadingDetail ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : invoiceDetail?.invoice ? (
                <>
                  {/* Invoice Header */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-semibold mb-2">{isRestaurant ? 'Bill From:' : 'Bill To:'}</h3>
                      <p>{isRestaurant ? invoiceDetail.invoice.supplier_name : invoiceDetail.invoice.restaurant_name}</p>
                      {invoiceDetail.invoice.supplier_address && (
                        <p className="text-sm text-gray-600">{invoiceDetail.invoice.supplier_address}</p>
                      )}
                      {invoiceDetail.invoice.supplier_phone && (
                        <p className="text-sm text-gray-600">{invoiceDetail.invoice.supplier_phone}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="mb-4">
                        <p className="text-sm text-gray-600">Invoice Date</p>
                        <p className="font-semibold">{new Date(invoiceDetail.invoice.invoice_date).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Due Date</p>
                        <p className="font-semibold">{new Date(invoiceDetail.invoice.due_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <h3 className="font-semibold mb-4">Items</h3>
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-2 px-3 text-sm font-medium">Description</th>
                          <th className="text-right py-2 px-3 text-sm font-medium">Qty</th>
                          <th className="text-right py-2 px-3 text-sm font-medium">Price</th>
                          <th className="text-right py-2 px-3 text-sm font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceDetail.lineItems?.map((item: any) => (
                          <tr key={item.id} className="border-b">
                            <td className="py-3 px-3">{item.description}</td>
                            <td className="py-3 px-3 text-right">{item.quantity}</td>
                            <td className="py-3 px-3 text-right">${parseFloat(item.unit_price || 0).toFixed(2)}</td>
                            <td className="py-3 px-3 text-right">${parseFloat(item.line_total || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="ml-auto w-64">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Subtotal</span>
                        <span>${parseFloat(invoiceDetail.invoice.subtotal || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tax</span>
                        <span>${parseFloat(invoiceDetail.invoice.tax_amount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-lg border-t pt-2 mt-2">
                        <span>Total</span>
                        <span>${parseFloat(invoiceDetail.invoice.total_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment History */}
                  <div>
                    <h3 className="font-semibold mb-4">Payment History</h3>
                    <div className="space-y-2">
                      {invoiceDetail.payments && invoiceDetail.payments.length > 0 ? (
                        <>
                          {invoiceDetail.payments.map((payment: any) => (
                            <div key={payment.id} className="border rounded p-3">
                              <div className="flex justify-between">
                                <div>
                                  <p className="font-medium">{payment.payment_method}</p>
                                  <p className="text-sm text-gray-600">{new Date(payment.payment_date).toLocaleDateString()}</p>
                                </div>
                                <span className="text-green-600">${parseFloat(payment.payment_amount || 0).toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                          {parseFloat(invoiceDetail.invoice.balance_due || 0) > 0 && (
                            <div className="border rounded p-3 bg-orange-50">
                              <div className="flex justify-between">
                                <div>
                                  <p className="font-medium">Outstanding Balance</p>
                                  <p className="text-sm text-gray-600">Due {new Date(invoiceDetail.invoice.due_date).toLocaleDateString()}</p>
                                </div>
                                <span className="text-red-600">${parseFloat(invoiceDetail.invoice.balance_due || 0).toFixed(2)}</span>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="border rounded p-3 bg-yellow-50">
                          <p className="text-gray-600">No payments recorded</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceDetail(false)}>
              Close
            </Button>
            {selectedInvoice?.balance_due > 0 && (
              <Button onClick={handleRecordPayment}>Record Payment</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
