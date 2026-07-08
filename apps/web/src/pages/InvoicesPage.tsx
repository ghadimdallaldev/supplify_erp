import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ensureNamespace } from '../i18n'
import { Button } from '../components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectTrigger } from '../components/ui/select'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useImpersonation } from '../hooks/useImpersonation'
import { usePermissions } from '../hooks/usePermissions'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { RequirePermission } from '../components/RequirePermission'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import {
  useGetRestaurantInvoicesQuery,
  useGetRestaurantInvoiceQuery,
  useMarkInvoicePaidMutation,
  useRecordSupplierPaymentMutation,
  useGetInvoiceCreditsQuery,
  useGetInvoiceAnalyticsQuery,
  useGetOverdueInvoicesQuery,
  useGetSupplierInvoicesQuery,
  useGetSupplierInvoiceQuery,
  useGetCreditNotesQuery,
  useGetEntitlementsQuery,
} from '../services/api'
import { isEntitlementFeatureEnabled } from '../lib/planLimits'
import { canUseFinanceInvoices } from '../lib/planFeatureGates'
import { SupplierReceivablesPanel } from '../components/supplier/SupplierReceivablesPanel'
import { RestaurantPayablesPanel } from '../components/restaurant/RestaurantPayablesPanel'
import { InvoiceCreditNotesCard } from '../components/invoices/InvoiceCreditNotesCard'
import { InvoiceStatsCards } from '../components/invoices/InvoiceStatsCards'
import { InvoiceListPanel } from '../components/invoices/InvoiceListPanel'
import { SupplierStatementPanel } from '../components/invoices/SupplierStatementPanel'
import {
  LazyInvoiceDetailDialog,
  LazyInvoicePaymentDialog,
} from '../components/invoices/lazyInvoiceDialogs'
import { apiUrl } from '../lib/apiBase'
import { applyReportDatePreset } from '../components/reports/ReportFiltersBar'
import { invoiceRemainingBalance } from '../lib/invoiceBalance'

type SupplierExportType = 'standard' | 'quickbooks' | 'payments'

function defaultExportRange() {
  return applyReportDatePreset(30)
}

export function InvoicesPage() {
  const { t } = useTranslation('invoices')

  useEffect(() => {
    void ensureNamespace('invoices')
  }, [])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial' | 'credit'>('full')
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [exportFrom, setExportFrom] = useState(() => defaultExportRange().from)
  const [exportTo, setExportTo] = useState(() => defaultExportRange().to)
  const [supplierExportType, setSupplierExportType] = useState<SupplierExportType>('standard')
  const [listLimit] = useState(100)
  const [searchParams, setSearchParams] = useSearchParams()

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
  const invoicesTitle = persona.pageCopy?.invoices?.title ?? t('page.title')
  const invoicesDescription = persona.pageCopy?.invoices?.description ?? t('page.description')

  // Fetch invoices from database
  const {
    data: restaurantInvoicesData,
    isLoading: isLoadingRestaurant,
    refetch: refetchRestaurant,
  } = useGetRestaurantInvoicesQuery(
    {
      limit: listLimit,
      offset: 0,
      ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
      ...(supplierFilter !== 'ALL' ? { supplier: supplierFilter } : {}),
    },
    { skip: !isRestaurant }
  )
  const {
    data: supplierInvoicesData,
    isLoading: isLoadingSupplier,
    refetch: refetchSupplier,
  } = useGetSupplierInvoicesQuery({ limit: listLimit, offset: 0 }, { skip: isRestaurant })
  const invoicesData = isRestaurant ? restaurantInvoicesData : supplierInvoicesData
  const isLoading = isRestaurant ? isLoadingRestaurant : isLoadingSupplier
  const refetch = isRestaurant ? refetchRestaurant : refetchSupplier
  const {
    data: restaurantInvoiceDetail,
    isLoading: isLoadingRestaurantDetail,
    refetch: refetchRestaurantDetail,
  } = useGetRestaurantInvoiceQuery(selectedInvoice?.id || '', {
    skip: !selectedInvoice?.id || !isRestaurant,
  })
  const {
    data: supplierInvoiceDetail,
    isLoading: isLoadingSupplierDetail,
    refetch: refetchSupplierDetail,
  } = useGetSupplierInvoiceQuery(selectedInvoice?.id || '', {
    skip: !selectedInvoice?.id || isRestaurant,
  })
  const invoiceDetail = isRestaurant ? restaurantInvoiceDetail : supplierInvoiceDetail
  const isLoadingDetail = isRestaurant ? isLoadingRestaurantDetail : isLoadingSupplierDetail
  const refetchDetail = isRestaurant ? refetchRestaurantDetail : refetchSupplierDetail
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
  const tenantCreditNotes = tenantCreditNotesData?.creditNotes || []

  const invoices = invoicesData?.invoices || []
  const analytics = analyticsData?.analytics || {}
  const creditNotes = creditsData?.creditNotes || []

  // Calculate remaining balance for selected invoice
  const remainingBalance = invoiceRemainingBalance(selectedInvoice)

  const openInvoiceById = useCallback((invoice: any, options?: { pay?: boolean }) => {
    setSelectedInvoice(invoice)
    setShowInvoiceDetail(true)
    if (options?.pay) {
      setPaymentMode('full')
      setPaymentAmount(invoiceRemainingBalance(invoice))
      setShowPaymentDialog(true)
    }
  }, [])

  useEffect(() => {
    const invoiceId = searchParams.get('invoice')
    if (!invoiceId || invoices.length === 0) return
    const match = invoices.find((inv: any) => inv.id === invoiceId)
    if (!match) return
    openInvoiceById(match, { pay: searchParams.get('pay') === 'true' })
    const next = new URLSearchParams(searchParams)
    next.delete('invoice')
    next.delete('pay')
    setSearchParams(next, { replace: true })
  }, [searchParams, invoices, openInvoiceById, setSearchParams])

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
    paidCount: invoices.filter((i: any) => i.status === 'PAID').length,
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
    const remaining = invoiceRemainingBalance(invoice)
    setSelectedInvoice(invoice)
    setShowPaymentDialog(true)
    setPaymentMode('full')
    setPaymentAmount(remaining)
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
      toast.error(t('toasts.invalidPaymentAmount'))
      return
    }

    if (paymentMode === 'credit' && creditAmount <= 0) {
      toast.error(t('toasts.selectCreditNote'))
      return
    }

    if (finalPaymentAmount + creditAmount > remainingBalance) {
      toast.error(t('toasts.exceedsBalance'))
      return
    }

    try {
      if (!isRestaurant) {
        if (paymentMode === 'credit') {
          toast.error(t('toasts.creditOnlyRestaurant'))
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

      toast.success(t('toasts.paymentRecorded'))
      setShowPaymentDialog(false)
      setShowInvoiceDetail(false)
      setSelectedInvoice(null)
      refetch()
      refetchDetail()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('toasts.paymentFailed'))
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
        toast.success(t('toasts.invoicesExported'))
      } else {
        const params = new URLSearchParams()
        params.set('from', exportFrom)
        params.set('to', exportTo)
        if (supplierExportType === 'standard' && statusFilter !== 'ALL') {
          params.set('status', statusFilter)
        }
        const qs = params.toString()
        const exportPath =
          supplierExportType === 'quickbooks'
            ? '/api/supplier/invoices/export/quickbooks.csv'
            : supplierExportType === 'payments'
              ? '/api/supplier/payments/export.csv'
              : '/api/supplier/invoices/export.csv'
        const res = await fetch(apiUrl(`${exportPath}?${qs}`), { credentials: 'include' })
        if (!res.ok) throw new Error('Export failed')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const prefix =
          supplierExportType === 'quickbooks'
            ? 'invoices-quickbooks'
            : supplierExportType === 'payments'
              ? 'payments'
              : 'invoices'
        a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success(t('toasts.exportDownloaded'))
      }
    } catch {
      toast.error(t('toasts.exportFailed'))
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
      <PageShell data-testid="invoices-page">
        <PageHeader
          title={invoicesTitle}
          description={invoicesDescription}
          actions={
            isRestaurant ? (
              <Button variant="outline" onClick={handleExportCsv} disabled={exportingCsv}>
                {exportingCsv ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {t('page.exportCsv')}
              </Button>
            ) : (
              <div className="flex min-w-0 flex-wrap items-end gap-2">
                <div>
                  <Label htmlFor="export-from" className="text-xs text-[var(--text-mid)]">
                    {t('page.from')}
                  </Label>
                  <Input
                    id="export-from"
                    type="date"
                    className="mt-1 w-[140px]"
                    value={exportFrom}
                    onChange={(e) => setExportFrom(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="export-to" className="text-xs text-[var(--text-mid)]">
                    {t('page.to')}
                  </Label>
                  <Input
                    id="export-to"
                    type="date"
                    className="mt-1 w-[140px]"
                    value={exportTo}
                    onChange={(e) => setExportTo(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="export-type" className="text-xs text-[var(--text-mid)]">
                    {t('page.export')}
                  </Label>
                  <Select
                    value={supplierExportType}
                    onValueChange={(v) => setSupplierExportType(v as SupplierExportType)}
                  >
                    <SelectTrigger id="export-type" className="mt-1 w-[160px]">
                      <option value="standard">{t('page.exportTypes.standard')}</option>
                      <option value="quickbooks">{t('page.exportTypes.quickbooks')}</option>
                      <option value="payments">{t('page.exportTypes.payments')}</option>
                    </SelectTrigger>
                  </Select>
                </div>
                <Button variant="outline" onClick={handleExportCsv} disabled={exportingCsv}>
                  {exportingCsv ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {t('page.export')}
                </Button>
              </div>
            )
          }
        />

        {!isRestaurant && financeInvoicesEnabled && <SupplierReceivablesPanel />}
        {isRestaurant && financeInvoicesEnabled && <RestaurantPayablesPanel />}
        {isRestaurant && financeInvoicesEnabled && <SupplierStatementPanel />}

        {disputesEnabled && tenantCreditNotes.length > 0 && (
          <InvoiceCreditNotesCard tenantCreditNotes={tenantCreditNotes} />
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
      </PageShell>
    </RequirePermission>
  )
}
