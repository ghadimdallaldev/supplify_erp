import { Link } from 'react-router-dom'
import { useGetOrderQuery, useGetOrderInvoicesQuery } from '../../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { ArrowLeft, DollarSign, FileText } from 'lucide-react'
import { formatPrice } from '../../../utils/format'
import { getOrderStatusColor, OrderDetailTabLoading } from './orderDetailShared'

export interface OrderInvoiceTabProps {
  orderId: string
}

export function OrderInvoiceTab({ orderId }: OrderInvoiceTabProps) {
  const { data, isLoading } = useGetOrderQuery(orderId)
  const { data: invoicesData, isLoading: isLoadingInvoices } = useGetOrderInvoicesQuery(orderId)

  if (isLoading || !data?.order) {
    return <OrderDetailTabLoading />
  }

  const order = data.order
  const getStatusColor = getOrderStatusColor

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice
              {invoicesData?.invoices && invoicesData.invoices.length > 1 ? 's' : ''}{' '}
              {invoicesData?.invoices?.length > 0 && `(${invoicesData.invoices.length})`}
            </CardTitle>
            <CardDescription>
              {order.status === 'COMPLETED' ||
              order.status === 'DELIVERED' ||
              order.status === 'RECEIVED_FULL'
                ? 'Invoice details and payment information'
                : 'Invoice will be generated after delivery and receiving'}
            </CardDescription>
          </div>
          {invoicesData?.invoices?.length > 0 && (
            <Button variant="outline" asChild>
              <Link to="/app/invoices">
                View All Invoices
                <ArrowLeft className="h-4 w-4 ml-2 rotate-180" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingInvoices ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand)]"></div>
          </div>
        ) : invoicesData?.invoices && invoicesData.invoices.length > 0 ? (
          <div className="space-y-4">
            {invoicesData.invoices.map((invoice: any) => {
              const remaining =
                parseFloat(invoice.total_amount || 0) - parseFloat(invoice.total_paid || 0)
              const isOverdue =
                invoice.due_date && new Date(invoice.due_date) < new Date() && remaining > 0

              return (
                <div
                  key={invoice.id}
                  className={`border rounded-lg p-6 hover:shadow-md transition-shadow ${
                    isOverdue ? 'border-red-300 bg-[var(--red-pale)]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold">{invoice.invoice_number}</h3>
                        <Badge variant={getStatusColor(invoice.status)}>{invoice.status}</Badge>
                        {isOverdue && <Badge variant="destructive">Overdue</Badge>}
                      </div>
                      <p className="text-sm text-[var(--text-muted)] font-medium">
                        {invoice.supplier_name}
                      </p>
                      <div className="flex gap-4 text-xs text-[var(--text-muted)] mt-2">
                        <span>
                          Invoice Date: {new Date(invoice.invoice_date).toLocaleDateString()}
                        </span>
                        <span>Due Date: {new Date(invoice.due_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">${formatPrice(invoice.total_amount)}</p>
                      <p
                        className={`text-sm font-semibold ${remaining > 0 ? 'text-[var(--red)]' : 'text-[var(--mint)]'}`}
                      >
                        Balance: ${formatPrice(remaining)}
                      </p>
                      {parseFloat(String(invoice.total_paid || 0)) > 0 && (
                        <p className="text-xs text-[var(--mint)]">
                          Paid: ${formatPrice(invoice.total_paid)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/app/invoices?invoice=${invoice.id}`}>
                        <FileText className="h-4 w-4 mr-2" />
                        View Details
                      </Link>
                    </Button>
                    {remaining > 0 && (
                      <Button size="sm" asChild>
                        <Link to={`/app/invoices?invoice=${invoice.id}&pay=true`}>
                          <DollarSign className="h-4 w-4 mr-2" />
                          Pay Invoice
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : order.status === 'COMPLETED' || order.status === 'DELIVERED' ? (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
            <p className="text-lg font-semibold text-[var(--text)] mb-2">
              Invoice Not Yet Generated
            </p>
            <p className="text-[var(--text-muted)]">
              Invoice is created when the restaurant confirms receiving. Check back after receipt is
              recorded.
            </p>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
            <p className="text-lg font-semibold text-[var(--text)] mb-2">Invoice Not Available</p>
            <p className="text-[var(--text-muted)]">
              Invoice will be generated when the order is completed.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
