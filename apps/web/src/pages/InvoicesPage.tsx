import { Suspense, useState } from 'react'
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
import { InvoiceCreditNotesCard } from '../components/invoices/InvoiceCreditNotesCard'
import { InvoiceStatsCards } from '../components/invoices/InvoiceStatsCards'
import { InvoiceListPanel } from '../components/invoices/InvoiceListPanel'
import {
  LazyInvoiceDetailDialog,
  LazyInvoicePaymentDialog,
} from '../components/invoices/lazyInvoiceDialogs'
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
  ).filter((s: any) => s.id && s.name) as Array<{ id: string; name: string }>

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

  const handleSelectInvoice = (invoice: any) => {
    setSelectedInvoice(invoice)
    setShowInvoiceDetail(true)
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
          <InvoiceCreditNotesCard
            tenantCreditNotes={tenantCreditNotes}
            refetchCreditNotes={refetchCreditNotes}
            refetch={refetch}
          />
        )}

        <InvoiceStatsCards
          stats={stats}
          analytics={analytics}
          analyticsData={analyticsData}
          overdueData={overdueData}
        />

        <InvoiceListPanel
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          supplierFilter={supplierFilter}
          setSupplierFilter={setSupplierFilter}
          suppliers={suppliers}
          filteredInvoices={filteredInvoices}
          canRecordPayments={canRecordPayments}
          onSelectInvoice={handleSelectInvoice}
          onPayInvoice={handleOpenPaymentDialog}
        />

        <Suspense fallback={null}>
          {showInvoiceDetail && (
            <LazyInvoiceDetailDialog
              showInvoiceDetail={showInvoiceDetail}
              setShowInvoiceDetail={setShowInvoiceDetail}
              selectedInvoice={selectedInvoice}
              invoiceDetail={invoiceDetail}
              isLoadingDetail={isLoadingDetail}
              downloadingPdfId={downloadingPdfId}
              setDownloadingPdfId={setDownloadingPdfId}
              isRestaurant={isRestaurant}
              canRecordPayments={canRecordPayments}
              handleOpenPaymentDialog={handleOpenPaymentDialog}
              remainingBalance={remainingBalance}
            />
          )}
          {showPaymentDialog && (
            <LazyInvoicePaymentDialog
              showPaymentDialog={showPaymentDialog}
              setShowPaymentDialog={setShowPaymentDialog}
              selectedInvoice={selectedInvoice}
              remainingBalance={remainingBalance}
              isRestaurant={isRestaurant}
              paymentMode={paymentMode}
              setPaymentMode={setPaymentMode}
              paymentAmount={paymentAmount}
              setPaymentAmount={setPaymentAmount}
              creditAmount={creditAmount}
              setCreditAmount={setCreditAmount}
              selectedCreditNoteId={selectedCreditNoteId}
              setSelectedCreditNoteId={setSelectedCreditNoteId}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              paymentReference={paymentReference}
              setPaymentReference={setPaymentReference}
              bankName={bankName}
              setBankName={setBankName}
              paymentNotes={paymentNotes}
              setPaymentNotes={setPaymentNotes}
              paidByHQ={paidByHQ}
              setPaidByHQ={setPaidByHQ}
              hqNotes={hqNotes}
              setHqNotes={setHqNotes}
              creditNotes={creditNotes}
              handleRecordPayment={handleRecordPayment}
              isProcessingAnyPayment={isProcessingAnyPayment}
            />
          )}
        </Suspense>
      </div>
    </RequirePermission>
  )
}
