import { Link } from 'react-router-dom'
import { FileText, Search, CreditCard, Receipt } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { StatusBadge } from '../ui/status-badge'
import { Select, SelectItem, SelectTrigger } from '../ui/select'
import { formatPrice } from '../../utils/format'
import { splitRowClass } from '../ui/card-layout'

type InvoiceListPanelProps = {
  search: string
  setSearch: (v: string) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
  supplierFilter: string
  setSupplierFilter: (v: string) => void
  suppliers: Array<{ id: string; name: string }>
  filteredInvoices: any[]
  canRecordPayments: boolean
  onSelectInvoice: (invoice: any) => void
  onPayInvoice: (invoice: any) => void
}

export function InvoiceListPanel({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  supplierFilter,
  setSupplierFilter,
  suppliers,
  filteredInvoices,
  canRecordPayments,
  onSelectInvoice,
  onPayInvoice,
}: InvoiceListPanelProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Invoice List</CardTitle>
          <div className="flex gap-2">
            <div className="flex items-center gap-2 border rounded-md px-3 py-1">
              <Search className="h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search invoices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-none outline-none"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" placeholder="Status">
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="ISSUED">Issued</SelectItem>
                <SelectItem value="PARTIALLY_PAID">Partially Paid</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="OVERDUE">Overdue</SelectItem>
                <SelectItem value="VOID">Void</SelectItem>
              </SelectTrigger>
            </Select>
            {suppliers.length > 0 && (
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-[200px]" placeholder="Supplier">
                  <SelectItem value="ALL">All Suppliers</SelectItem>
                  {suppliers.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectTrigger>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {filteredInvoices.map((invoice: any) => {
            const remaining =
              parseFloat(invoice.balance_due || invoice.total_amount || 0) -
              parseFloat(invoice.total_paid || 0)
            const isOverdue =
              invoice.days_overdue > 0 ||
              (invoice.due_date && new Date(invoice.due_date) < new Date() && remaining > 0)

            return (
              <div
                key={invoice.id}
                className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                  isOverdue ? 'border-[var(--red)]/30 bg-[var(--red-pale)]' : ''
                }`}
                onClick={() => onSelectInvoice(invoice)}
              >
                <div className={splitRowClass}>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                      <h3 className="font-semibold">{invoice.invoice_number}</h3>
                      <StatusBadge status={invoice.status} />
                      {isOverdue && (
                        <StatusBadge
                          status="OVERDUE"
                          label={`${invoice.days_overdue || 0} days overdue`}
                        />
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-muted)] font-medium">
                      {invoice.supplier_name}
                    </p>
                    <div className="flex gap-4 text-xs text-[var(--text-muted)] mt-2">
                      <span>
                        Invoice Date: {new Date(invoice.invoice_date).toLocaleDateString()}
                      </span>
                      <span>Due Date: {new Date(invoice.due_date).toLocaleDateString()}</span>
                      {invoice.order_id && (
                        <Link
                          to={`/app/orders/${invoice.order_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[var(--brand-mid)] hover:underline flex items-center gap-1"
                        >
                          <Receipt className="h-3 w-3" />
                          Order #{invoice.order_id.slice(0, 8)}
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0 min-w-[7rem]">
                    <p className="text-lg font-semibold tabular-nums">
                      {formatPrice(invoice.total_amount)}
                    </p>
                    <p
                      className={`text-sm ${remaining > 0 ? 'text-[var(--red)] font-semibold' : 'text-[var(--mint)]'}`}
                    >
                      Balance: {formatPrice(remaining)}
                    </p>
                    {parseFloat(invoice.total_paid || 0) > 0 && (
                      <p className="text-xs text-[var(--mint)]">
                        Paid: {formatPrice(invoice.total_paid)}
                      </p>
                    )}
                    {canRecordPayments && remaining > 0 && (
                      <Button
                        size="sm"
                        variant="default"
                        className="mt-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          onPayInvoice(invoice)
                        }}
                      >
                        <CreditCard className="h-3 w-3 mr-1" />
                        Pay
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {filteredInvoices.length === 0 && (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
              <p className="text-lg font-semibold text-[var(--text)] mb-2">No invoices found</p>
              <p className="text-[var(--text-muted)]">Try adjusting your filters</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
