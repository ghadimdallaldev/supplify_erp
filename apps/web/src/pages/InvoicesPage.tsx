import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { StatusBadge } from '../components/ui/status-badge'
import {
  FileText,
  Clock,
  CheckCircle,
  Search,
  Download,
  Loader2,
  TrendingUp,
  TrendingDown,
  Calendar,
  CreditCard,
  AlertTriangle,
  ArrowRightLeft,
  Receipt,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Select, SelectItem, SelectTrigger } from '../components/ui/select'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { useImpersonation } from '../hooks/useImpersonation'
import { usePermissions } from '../hooks/usePermissions'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { RequirePermission } from '../components/RequirePermission'
import { PageHeader } from '../components/ui/page-header'
import { formatPrice } from '../utils/format'
import { splitRowClass } from '../components/ui/card-layout'
import {
  useGetRestaurantInvoicesQuery,
  useGetRestaurantInvoiceQuery,
  useMarkInvoicePaidMutation,
  useRecordSupplierPaymentMutation,
  useGetInvoiceCreditsQuery,
  useGetInvoiceAnalyticsQuery,
  useGetOverdueInvoicesQuery,
  useGetSupplierInvoicesQuery,
  useGetCreditNotesQuery,
  useApplyCreditNoteMutation,
  useGetEntitlementsQuery,
} from '../services/api'
import { isEntitlementFeatureEnabled } from '../lib/planLimits'
import { canUseFinanceInvoices } from '../lib/planFeatureGates'
import { Link } from 'react-router-dom'
import { SupplierReceivablesPanel } from '../components/supplier/SupplierReceivablesPanel'
import { apiUrl } from '../lib/apiBase'

export function InvoicesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial' | 'credit'>('full')
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null)
  const [exportingCsv, setExportingCsv] = useState(false)

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [creditAmount, setCreditAmount] = useState<number>(0)
  const [selectedCreditNoteId, setSelectedCreditNoteId] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<string>('BANK_TRANSFER')
  const [paymentReference, setPaymentReference] = useState('')
  const [bankName, setBankName] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paidByHQ, setPaidByHQ] = useState(false)
  const [hqNotes, setHqNotes] = useState('')

  const { canAny } = usePermissions()
  const canRecordPayments = canAny('INVOICES_MANAGE', 'INVOICES_EDIT', 'PAYMENTS_MANAGE')
  const { isEffectiveRestaurant: isRestaurant } = useImpersonation()
  const { persona } = useWorkspaceRole()
  const invoicesTitle = isRestaurant
    ? (persona.pageCopy?.invoices?.title ?? 'Invoice Dashboard')
    : 'Invoice Dashboard'
  const invoicesDescription = isRestaurant
    ? (persona.pageCopy?.invoices?.description ??
      'Manage billing, payments, and financial analytics')
    : 'Manage billing, payments, and financial analytics'

  // Fetch invoices from database
  const {
    data: restaurantInvoicesData,
    isLoading: isLoadingRestaurant,
    refetch: refetchRestaurant,
  } = useGetRestaurantInvoicesQuery({}, { skip: !isRestaurant })
  const {
    data: supplierInvoicesData,
    isLoading: isLoadingSupplier,
    refetch: refetchSupplier,
  } = useGetSupplierInvoicesQuery({}, { skip: isRestaurant })
  const invoicesData = isRestaurant ? restaurantInvoicesData : supplierInvoicesData
  const isLoading = isRestaurant ? isLoadingRestaurant : isLoadingSupplier
  const refetch = isRestaurant ? refetchRestaurant : refetchSupplier
  const {
    data: invoiceDetail,
    isLoading: isLoadingDetail,
    refetch: refetchDetail,
  } = useGetRestaurantInvoiceQuery(selectedInvoice?.id || '', { skip: !selectedInvoice?.id })
  const { data: creditsData } = useGetInvoiceCreditsQuery(selectedInvoice?.id || '', {
    skip: !selectedInvoice?.id || paymentMode !== 'credit',
  })
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const financeInvoicesEnabled = canUseFinanceInvoices(entitlementsData?.entitlements)
  const { data: analyticsData } = useGetInvoiceAnalyticsQuery(
    { period: 30 },
    { skip: !isRestaurant || !financeInvoicesEnabled }
  )
  const { data: overdueData } = useGetOverdueInvoicesQuery(undefined, { skip: !isRestaurant })
  const [markPaid, { isLoading: isProcessingPayment }] = useMarkInvoicePaidMutation()
  const [recordSupplierPayment, { isLoading: isRecordingSupplierPayment }] =
    useRecordSupplierPaymentMutation()
  const isProcessingAnyPayment = isProcessingPayment || isRecordingSupplierPayment
  const disputesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'disputes_returns'
  )
  const { data: tenantCreditNotesData, refetch: refetchCreditNotes } = useGetCreditNotesQuery(
    undefined,
    {
      skip: !disputesEnabled,
    }
  )
  const [applyCreditNote] = useApplyCreditNoteMutation()
  const tenantCreditNotes = tenantCreditNotesData?.creditNotes || []

  const invoices = invoicesData?.invoices || []
  const analytics = analyticsData?.analytics || {}
  const creditNotes = creditsData?.creditNotes || []

  // Calculate remaining balance for selected invoice
  const remainingBalance = selectedInvoice
    ? parseFloat(selectedInvoice.total_amount || 0) - parseFloat(selectedInvoice.total_paid || 0)
    : 0

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      invoice.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      invoice.supplier_name?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || invoice.status === statusFilter
    const matchesSupplier = supplierFilter === 'ALL' || invoice.supplier_id === supplierFilter
    return matchesSearch && matchesStatus && matchesSupplier
  })

  // Get unique suppliers for filter
  const suppliers = Array.from(
    new Map(
      invoices.map((inv: any) => [
        inv.supplier_id,
        { id: inv.supplier_id, name: inv.supplier_name },
      ])
    ).values()
  ).filter((s: any) => s.id && s.name)

  const stats = {
    total: invoices.length,
    unpaid: invoices.filter((i: any) => i.status !== 'PAID' && i.status !== 'VOID').length,
    overdue: invoices.filter(
      (i: any) => i.status === 'OVERDUE' || (i.days_overdue && i.days_overdue > 0)
    ).length,
    totalAmount: invoices.reduce((sum: number, i: any) => sum + parseFloat(i.total_amount || 0), 0),
    totalOutstanding: invoices
      .filter((i: any) => i.status !== 'PAID' && i.status !== 'VOID')
      .reduce((sum: number, i: any) => sum + parseFloat(i.balance_due || i.total_amount || 0), 0),
    totalPaid: invoices
      .filter((i: any) => i.status === 'PAID')
      .reduce((sum: number, i: any) => sum + parseFloat(i.total_amount || 0), 0),
  }

  const handleOpenPaymentDialog = (invoice: any) => {
    setSelectedInvoice(invoice)
    setShowPaymentDialog(true)
    setPaymentMode('full')
    setPaymentAmount(remainingBalance)
    setCreditAmount(0)
    setSelectedCreditNoteId('')
    setPaymentMethod('BANK_TRANSFER')
    setPaymentReference('')
    setBankName('')
    setPaymentNotes('')
    setPaidByHQ(false)
    setHqNotes('')
  }

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return

    let finalPaymentAmount = paymentAmount
    if (paymentMode === 'full') {
      finalPaymentAmount = remainingBalance
    } else if (paymentMode === 'partial' && paymentAmount <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }

    if (paymentMode === 'credit' && creditAmount <= 0) {
      toast.error('Please select and apply a credit note')
      return
    }

    if (finalPaymentAmount + creditAmount > remainingBalance) {
      toast.error('Total payment amount exceeds remaining balance')
      return
    }

    try {
      if (!isRestaurant) {
        if (paymentMode === 'credit') {
          toast.error('Credit notes can only be applied by the restaurant')
          return
        }
        await recordSupplierPayment({
          invoice_id: selectedInvoice.id,
          payment_amount: finalPaymentAmount,
          payment_date: new Date().toISOString().split('T')[0],
          payment_method: paymentMethod,
          payment_reference: paymentReference || undefined,
          bank_name: bankName || undefined,
          notes: paymentNotes || undefined,
        }).unwrap()
      } else {
        await markPaid({
          invoiceId: selectedInvoice.id,
          data: {
            paymentAmount: finalPaymentAmount > 0 ? finalPaymentAmount : undefined,
            paymentDate: new Date().toISOString().split('T')[0],
            paymentMethod: paymentMethod as any,
            paymentReference: paymentReference || undefined,
            bankName: bankName || undefined,
            notes: paymentNotes || undefined,
            creditAmount: creditAmount > 0 ? creditAmount : undefined,
            creditNoteId: selectedCreditNoteId || undefined,
            paidByHQ: paidByHQ,
            hqNotes: hqNotes || undefined,
          },
        }).unwrap()
      }

      toast.success('Payment recorded successfully!')
      setShowPaymentDialog(false)
      setShowInvoiceDetail(false)
      setSelectedInvoice(null)
      refetch()
      refetchDetail()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to record payment')
    }
  }

  const handleExportCsv = async () => {
    setExportingCsv(true)
    try {
      if (isRestaurant) {
        const params = new URLSearchParams()
        if (statusFilter !== 'ALL') params.set('status', statusFilter)
        if (supplierFilter !== 'ALL') params.set('supplier', supplierFilter)
        const qs = params.toString()
        const res = await fetch(
          apiUrl(`/api/restaurant-finance/invoices/export.csv${qs ? `?${qs}` : ''}`),
          { credentials: 'include' }
        )
        if (!res.ok) throw new Error('Export failed')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Invoices exported')
      } else {
        const header = 'Invoice Number,Date,Due Date,Status,Total,Restaurant\n'
        const lines = (invoicesData?.invoices ?? []).map(
          (inv: any) =>
            `"${inv.invoice_number || inv.id}","${inv.invoice_date || ''}","${inv.due_date || ''}","${inv.status}",${inv.total_amount},"${String(inv.restaurant_name || '').replace(/"/g, '""')}"`
        )
        const blob = new Blob([header + lines.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Invoices exported')
      }
    } catch {
      toast.error('Could not export invoices')
    } finally {
      setExportingCsv(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-mid)]" />
      </div>
    )
  }

  return (
    <RequirePermission permission="INVOICES_VIEW" title="invoices">
      <div className="space-y-6">
        <PageHeader
          title={invoicesTitle}
          description={invoicesDescription}
          actions={
            <Button variant="outline" onClick={handleExportCsv} disabled={exportingCsv}>
              {exportingCsv ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export CSV
            </Button>
          }
        />

        {!isRestaurant && financeInvoicesEnabled && <SupplierReceivablesPanel />}

        {disputesEnabled && tenantCreditNotes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Credit notes
              </CardTitle>
              <CardDescription>
                Issued from resolved disputes — apply to open invoices
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[var(--text-muted)]">
                      <th className="py-2">Number</th>
                      <th className="py-2">Amount</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantCreditNotes.map((cn: Record<string, unknown>) => (
                      <tr key={String(cn.id)} className="border-b border-[var(--app-border)]">
                        <td className="py-2 font-mono text-xs">
                          {String(cn.credit_note_number || cn.id).slice(-12)}
                        </td>
                        <td className="py-2">${formatPrice(Number(cn.amount || 0))}</td>
                        <td className="py-2">
                          <StatusBadge status={String(cn.status || 'available')} />
                        </td>
                        <td className="py-2 text-right">
                          {cn.status !== 'applied' && cn.status !== 'APPLIED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await applyCreditNote({ id: String(cn.id) }).unwrap()
                                  toast.success('Credit note applied')
                                  refetchCreditNotes()
                                  refetch()
                                } catch (e: unknown) {
                                  const err = e as { data?: { error?: { message?: string } } }
                                  toast.error(err?.data?.error?.message || 'Failed to apply')
                                }
                              }}
                            >
                              Apply
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Comprehensive Analytics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">Total Invoices</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {analytics.issued_count || 0} issued • {analytics.partial_count || 0} partial
                  </p>
                </div>
                <FileText className="h-10 w-10 text-[var(--brand-mid)]" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">Outstanding</p>
                  <p className="text-2xl font-bold text-[var(--amber)]">
                    {formatPrice(stats.totalOutstanding)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {stats.unpaid} unpaid invoices
                  </p>
                </div>
                <Clock className="h-10 w-10 text-[var(--amber-mid)]" />
              </div>
            </CardContent>
          </Card>

          <Card className={stats.overdue > 0 ? 'border-[var(--red)]/40' : ''}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">Overdue</p>
                  <p className="text-2xl font-bold text-[var(--red)]">{stats.overdue}</p>
                  <p className="text-xs text-[var(--red)] mt-1">
                    {overdueData?.summary?.totalOverdue
                      ? formatPrice(overdueData.summary.totalOverdue)
                      : 'All current'}
                  </p>
                </div>
                <AlertTriangle className="h-10 w-10 text-[var(--red)]" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">Total Paid</p>
                  <p className="text-2xl font-bold text-[var(--mint)]">
                    {formatPrice(stats.totalPaid)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {analytics.paid_count || 0} paid invoices
                  </p>
                </div>
                <CheckCircle className="h-10 w-10 text-[var(--mint)]" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats Row */}
        {analyticsData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--text-muted)]">Avg Days to Pay</p>
                    <p className="text-xl font-semibold">
                      {analytics.avg_days_to_pay
                        ? `${parseInt(analytics.avg_days_to_pay)} days`
                        : 'N/A'}
                    </p>
                  </div>
                  <Calendar className="h-8 w-8 text-[var(--text-muted)]" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--text-muted)]">Total Paid (30d)</p>
                    <p className="text-xl font-semibold text-[var(--mint)]">
                      {formatPrice(analytics.total_paid_amount)}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-[var(--mint)]" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--text-muted)]">Outstanding (30d)</p>
                    <p className="text-xl font-semibold text-[var(--amber)]">
                      {formatPrice(analytics.total_outstanding)}
                    </p>
                  </div>
                  <TrendingDown className="h-8 w-8 text-[var(--amber-mid)]" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
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
                    onClick={() => {
                      setSelectedInvoice(invoice)
                      setShowInvoiceDetail(true)
                    }}
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
                              handleOpenPaymentDialog(invoice)
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

        {/* Invoice Detail Dialog */}
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
                                <th className="text-right py-3 px-4 text-sm font-medium">
                                  Quantity
                                </th>
                                <th className="text-right py-3 px-4 text-sm font-medium">
                                  Unit Price
                                </th>
                                <th className="text-right py-3 px-4 text-sm font-medium">Tax</th>
                                <th className="text-right py-3 px-4 text-sm font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {invoiceDetail.lineItems?.map((item: any) => (
                                <tr
                                  key={item.id}
                                  className="border-b hover:bg-[var(--brand-ultra)]"
                                >
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
                                  {new Date(
                                    invoiceDetail.invoice.order_placed_at
                                  ).toLocaleDateString()}
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

        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                    <TabsList
                      className={`grid w-full ${isRestaurant ? 'grid-cols-3' : 'grid-cols-2'}`}
                    >
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
                        Paying full remaining balance:{' '}
                        <strong>{formatPrice(remainingBalance)}</strong>
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
                        <Input
                          type="date"
                          value={new Date().toISOString().split('T')[0]}
                          required
                        />
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
                        <Input
                          type="date"
                          value={new Date().toISOString().split('T')[0]}
                          required
                        />
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
                    {creditsData && creditNotes.length > 0 && (
                      <div className="border rounded-lg p-4 bg-[var(--brand-ultra)]">
                        <Label className="mb-2 block">Apply Credit Note (Optional)</Label>
                        <Select
                          value={selectedCreditNoteId}
                          onValueChange={setSelectedCreditNoteId}
                        >
                          <SelectTrigger placeholder="Select credit note...">
                            {creditNotes.map((cn: any) => (
                              <SelectItem key={cn.id} value={cn.id}>
                                {cn.credit_note_number} - {formatPrice(cn.remaining_amount)}{' '}
                                available
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
                    {creditsData && creditNotes.length > 0 ? (
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
                                  {cn.credit_note_number} - {formatPrice(cn.remaining_amount)}{' '}
                                  available
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
                          <Input
                            type="date"
                            value={new Date().toISOString().split('T')[0]}
                            required
                          />
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
      </div>
    </RequirePermission>
  )
}
