import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, Search, CreditCard, Receipt, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { StatusBadge } from '../ui/status-badge'
import { Select, SelectItem, SelectTrigger } from '../ui/select'
import { TableScroll } from '../ui/table-scroll'
import { formatPrice } from '../../utils/format'
import { invoiceRemainingBalance } from '../../lib/invoiceBalance'
import { CardActionGrid, cardActionBtnClass, splitRowClass } from '../ui/card-layout'

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
  const { t } = useTranslation('invoices')

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <CardTitle>{t('list.title')}</CardTitle>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-1.5">
              <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
              <input
                type="text"
                placeholder={t('list.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1 border-none bg-transparent outline-none text-sm"
                aria-label={t('list.searchPlaceholder')}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" placeholder={t('list.status')}>
                <SelectItem value="ALL">{t('list.allStatus')}</SelectItem>
                <SelectItem value="ISSUED">{t('list.statuses.ISSUED')}</SelectItem>
                <SelectItem value="PARTIALLY_PAID">{t('list.statuses.PARTIALLY_PAID')}</SelectItem>
                <SelectItem value="PAID">{t('list.statuses.PAID')}</SelectItem>
                <SelectItem value="OVERDUE">{t('list.statuses.OVERDUE')}</SelectItem>
                <SelectItem value="VOID">{t('list.statuses.VOID')}</SelectItem>
              </SelectTrigger>
            </Select>
            {suppliers.length > 0 && (
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-full sm:w-[200px]" placeholder={t('list.supplier')}>
                  <SelectItem value="ALL">{t('list.allSuppliers')}</SelectItem>
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
      <CardContent className="min-w-0">
        {filteredInvoices.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="mx-auto mb-4 h-16 w-16 text-[var(--text-muted)]" />
            <p className="mb-2 text-lg font-semibold text-[var(--text)]">{t('list.emptyTitle')}</p>
            <p className="text-[var(--text-muted)]">{t('list.emptyDescription')}</p>
          </div>
        ) : (
          <>
            {/* Cards below lg */}
            <div className="space-y-4 lg:hidden">
              {filteredInvoices.map((invoice: any) => {
                const remaining = invoiceRemainingBalance(invoice)
                const isOverdue =
                  invoice.days_overdue > 0 ||
                  (invoice.due_date && new Date(invoice.due_date) < new Date() && remaining > 0)

                return (
                  <div
                    key={invoice.id}
                    className={`cursor-pointer rounded-lg border p-4 transition-shadow hover:shadow-md ${
                      isOverdue ? 'border-[var(--red)]/30 bg-[var(--red-pale)]' : ''
                    }`}
                    onClick={() => onSelectInvoice(invoice)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectInvoice(invoice)
                      }
                    }}
                  >
                    <div className={splitRowClass}>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{invoice.invoice_number}</h3>
                          <StatusBadge
                            status={invoice.status}
                            label={t(`list.statuses.${invoice.status}`, {
                              defaultValue: invoice.status.replace(/_/g, ' '),
                            })}
                          />
                          {isOverdue && (
                            <StatusBadge
                              status="OVERDUE"
                              label={t('list.daysOverdue', { count: invoice.days_overdue || 0 })}
                            />
                          )}
                        </div>
                        <p className="text-sm font-medium text-[var(--text-muted)]">
                          {invoice.supplier_name}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                          <span>
                            {t('list.invoiceDate')}:{' '}
                            {new Date(invoice.invoice_date).toLocaleDateString()}
                          </span>
                          <span>
                            {t('list.dueDate')}: {new Date(invoice.due_date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-start sm:text-end">
                        <p className="text-lg font-semibold tabular-nums">
                          {formatPrice(invoice.total_amount)}
                        </p>
                        <p
                          className={`text-sm ${remaining > 0 ? 'font-semibold text-[var(--red)]' : 'text-[var(--mint)]'}`}
                        >
                          {t('list.balance')}: {formatPrice(remaining)}
                        </p>
                      </div>
                    </div>
                    <CardActionGrid className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className={cardActionBtnClass()}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectInvoice(invoice)
                        }}
                      >
                        <Eye className="mr-1 h-4 w-4 shrink-0" />
                        {t('list.view', { defaultValue: 'View' })}
                      </Button>
                      {canRecordPayments && remaining > 0 && (
                        <Button
                          size="sm"
                          className={cardActionBtnClass()}
                          onClick={(e) => {
                            e.stopPropagation()
                            onPayInvoice(invoice)
                          }}
                        >
                          <CreditCard className="mr-1 h-4 w-4 shrink-0" />
                          {t('list.pay')}
                        </Button>
                      )}
                      {invoice.order_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          className={cardActionBtnClass({ span: 'full' })}
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link to={`/app/orders/${invoice.order_id}`}>
                            <Receipt className="mr-1 h-4 w-4 shrink-0" />
                            {t('list.orderLink', { id: invoice.order_id.slice(0, 8) })}
                          </Link>
                        </Button>
                      )}
                    </CardActionGrid>
                  </div>
                )
              })}
            </div>

            {/* Table at lg+ */}
            <TableScroll aria-label={t('list.title')} className="hidden lg:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-[var(--brand-ultra)]/40 text-left text-[var(--text-muted)]">
                    <th className="px-4 py-3 pl-5 font-medium">
                      {t('list.invoiceNumber', { defaultValue: 'Invoice' })}
                    </th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">
                      {t('list.supplier')}
                    </th>
                    <th className="px-4 py-3 font-medium">{t('list.status')}</th>
                    <th className="hidden px-4 py-3 font-medium xl:table-cell">
                      {t('list.dueDate')}
                    </th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell text-end">
                      {t('list.balance')}
                    </th>
                    <th className="px-4 py-3 font-medium text-end">
                      {t('list.total', { defaultValue: 'Total' })}
                    </th>
                    <th className="px-4 py-3 pr-5 text-end font-medium">
                      {t('list.actions', { defaultValue: 'Actions' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice: any) => {
                    const remaining = invoiceRemainingBalance(invoice)
                    const isOverdue =
                      invoice.days_overdue > 0 ||
                      (invoice.due_date && new Date(invoice.due_date) < new Date() && remaining > 0)

                    return (
                      <tr
                        key={invoice.id}
                        className={`cursor-pointer border-b border-[var(--app-border)] transition-colors hover:bg-[var(--brand-ultra)] ${
                          isOverdue ? 'bg-[var(--red-pale)]/40' : ''
                        }`}
                        onClick={() => onSelectInvoice(invoice)}
                      >
                        <td className="px-4 py-3 pl-5 font-medium">{invoice.invoice_number}</td>
                        <td className="hidden max-w-[12rem] truncate px-4 py-3 lg:table-cell">
                          {invoice.supplier_name}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={invoice.status}
                            label={t(`list.statuses.${invoice.status}`, {
                              defaultValue: invoice.status.replace(/_/g, ' '),
                            })}
                          />
                        </td>
                        <td className="hidden px-4 py-3 xl:table-cell">
                          {new Date(invoice.due_date).toLocaleDateString()}
                        </td>
                        <td
                          className={`hidden px-4 py-3 text-end tabular-nums lg:table-cell ${
                            remaining > 0 ? 'font-semibold text-[var(--red)]' : 'text-[var(--mint)]'
                          }`}
                        >
                          {formatPrice(remaining)}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums font-semibold">
                          {formatPrice(invoice.total_amount)}
                        </td>
                        <td
                          className="px-4 py-3 pr-5 text-end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="px-2.5 xl:px-3"
                              onClick={() => onSelectInvoice(invoice)}
                              aria-label={t('list.view', { defaultValue: 'View invoice' })}
                              title={t('list.view', { defaultValue: 'View' })}
                            >
                              <Eye className="h-4 w-4 xl:mr-1" />
                              <span className="hidden xl:inline">
                                {t('list.view', { defaultValue: 'View' })}
                              </span>
                            </Button>
                            {canRecordPayments && remaining > 0 && (
                              <Button
                                size="sm"
                                className="px-2.5 xl:px-3"
                                onClick={() => onPayInvoice(invoice)}
                                aria-label={t('list.pay')}
                                title={t('list.pay')}
                              >
                                <CreditCard className="h-4 w-4 xl:mr-1" />
                                <span className="hidden xl:inline">{t('list.pay')}</span>
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableScroll>
          </>
        )}
      </CardContent>
    </Card>
  )
}
