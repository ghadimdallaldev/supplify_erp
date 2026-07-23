import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Users, Link2, Gift, AlertTriangle, Download } from 'lucide-react'
import { ensureNamespace } from '../i18n'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Label } from '../components/ui/label'
import { Skeleton } from '../components/ui/skeleton'
import { Select, SelectTrigger } from '../components/ui/select'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { EmptyState } from '../components/ui/empty-state'
import { FeatureLockedCard } from '../components/FeatureLockedCard'
import {
  useGetSupplierGrowthMetricsQuery,
  useGetSupplierProspectsQuery,
  usePreviewCustomerImportMutation,
  useExecuteCustomerImportMutation,
  useInviteProspectMutation,
  useConnectProspectMutation,
  useCreateSponsorshipOfferMutation,
  useGetSupplierSponsorshipsQuery,
  usePaySponsorshipMutation,
  useRetrySponsorshipPaymentMutation,
  useCancelSponsorshipMutation,
  CUSTOMER_IMPORT_CSV_TEMPLATE,
} from '../services/api/endpoints/growth'
import { useGetEntitlementsQuery } from '../services/api'
import { canUseSupplierGrowth } from '../lib/planFeatureGates'
import { usePermissions } from '../hooks/usePermissions'
import { canViewSupplierGrowth } from '../lib/tenantRoles'
import { useAppSelector } from '../hooks/redux'
import {
  lowestEligibleSponsorPlan,
  normalizeEligibleSponsorPlans,
  SPONSORSHIP_PLAN_LABELS,
  type SponsorshipGiftPlanKey,
} from '../lib/growthSponsorshipPlans'
import { toast } from 'sonner'

type ImportPreviewRow = {
  rowNumber: number
  status: string
  mapped?: Record<string, string>
  errors?: Array<{ field: string; message: string }>
}

function MetricTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[var(--app-border)] p-3">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  )
}

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="growth-metrics-skeleton">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-[72px] rounded-lg" />
      ))}
    </div>
  )
}

export function SupplierCustomerGrowthPage() {
  const { t } = useTranslation('supplierOps')

  useEffect(() => {
    void ensureNamespace('supplierOps')
  }, [])

  const { user } = useAppSelector((state) => state.auth)
  const { can } = usePermissions()
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const supplierGrowthEnabled = canUseSupplierGrowth(entitlementsData?.entitlements)
  const canViewGrowth = canViewSupplierGrowth(user, can)
  const skipGrowthApi = !supplierGrowthEnabled || !canViewGrowth

  const {
    data: metrics,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch: refetchMetrics,
  } = useGetSupplierGrowthMetricsQuery(undefined, { skip: skipGrowthApi })
  const {
    data: prospectsData,
    isLoading: prospectsLoading,
    isError: prospectsError,
    refetch: refetchProspects,
  } = useGetSupplierProspectsQuery({ limit: 50 }, { skip: skipGrowthApi })
  const [previewImport] = usePreviewCustomerImportMutation()
  const [executeImport, { isLoading: importing }] = useExecuteCustomerImportMutation()
  const [inviteProspect] = useInviteProspectMutation()
  const [connectProspect] = useConnectProspectMutation()
  const [createSponsorshipOffer] = useCreateSponsorshipOfferMutation()
  const [paySponsorship] = usePaySponsorshipMutation()
  const [retrySponsorshipPayment] = useRetrySponsorshipPaymentMutation()
  const [cancelSponsorship] = useCancelSponsorshipMutation()
  const { data: sponsorshipsData, refetch: refetchSponsorships } = useGetSupplierSponsorshipsQuery(
    undefined,
    { skip: skipGrowthApi }
  )
  const canManageCustomers = can('CUSTOMERS_MANAGE')
  const [csvText, setCsvText] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([])
  const [importPreviewMeta, setImportPreviewMeta] = useState<{
    totalRows: number
    validCount: number
    errorCount: number
  } | null>(null)

  const eligibleSponsorPlans = useMemo(
    () => normalizeEligibleSponsorPlans(metrics?.eligibleSponsorPlans),
    [metrics?.eligibleSponsorPlans]
  )
  const defaultSponsorPlan = useMemo(
    () => lowestEligibleSponsorPlan(eligibleSponsorPlans),
    [eligibleSponsorPlans]
  )
  const [sponsorPlanCode, setSponsorPlanCode] = useState<SponsorshipGiftPlanKey>(defaultSponsorPlan)

  useEffect(() => {
    setSponsorPlanCode((current) =>
      eligibleSponsorPlans.includes(current) ? current : defaultSponsorPlan
    )
  }, [defaultSponsorPlan, eligibleSponsorPlans])

  const handleFile = async (file: File) => {
    const text = await file.text()
    setCsvText(text)
    setImportPreview([])
    setImportPreviewMeta(null)
    try {
      const preview = await previewImport({ csv: text }).unwrap()
      setImportPreview((preview.preview as ImportPreviewRow[]) || [])
      setImportPreviewMeta({
        totalRows: preview.totalRows ?? 0,
        validCount: preview.validCount ?? 0,
        errorCount: preview.errorCount ?? 0,
      })
      if ((preview.validCount ?? 0) === 0) {
        toast.error(t('customerGrowth.toasts.noValidRows'))
      } else {
        toast.success(
          t('customerGrowth.toasts.previewSuccess', {
            valid: preview.validCount,
            errors: preview.errorCount,
            total: preview.totalRows,
          })
        )
      }
    } catch {
      toast.error(t('customerGrowth.toasts.previewFailed'))
    }
  }

  const runImport = async () => {
    if (!csvText.trim()) {
      toast.error(t('customerGrowth.toasts.uploadFirst'))
      return
    }
    if (importPreviewMeta && importPreviewMeta.validCount === 0) {
      toast.error(t('customerGrowth.toasts.fixErrors'))
      return
    }
    try {
      const result = await executeImport({ csv: csvText }).unwrap()
      toast.success(t('customerGrowth.toasts.importSuccess', { count: result.created }))
      setImportPreview([])
      setImportPreviewMeta(null)
      setCsvText('')
      refetchProspects()
      refetchMetrics()
    } catch {
      toast.error(t('customerGrowth.toasts.importFailed'))
    }
  }

  const prospects = prospectsData?.prospects ?? []
  const previewRowsWithIssues = importPreview.filter(
    (row) => row.status !== 'valid' || (row.errors?.length ?? 0) > 0
  )

  const handleDownloadTemplate = () => {
    const blob = new Blob([CUSTOMER_IMPORT_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'customer-import-template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (!supplierGrowthEnabled) {
    return (
      <PageShell maxWidth="wide" data-testid="customer-growth-page">
        <PageHeader title={t('customerGrowth.title')} />
        <FeatureLockedCard
          featureKey="supplier_growth"
          featureName={t('customerGrowth.lockedFeature')}
          currentPlan={entitlementsData?.entitlements?.plan?.name ?? null}
        />
      </PageShell>
    )
  }

  return (
    <PageShell maxWidth="wide" data-testid="customer-growth-page">
      <PageHeader title={t('customerGrowth.title')} description={t('customerGrowth.description')} />

      {metricsLoading ? (
        <MetricsSkeleton />
      ) : metricsError ? (
        <EmptyState
          title={t('customerGrowth.metricsError.title')}
          description={t('customerGrowth.metricsError.description')}
          icon={<AlertTriangle className="h-10 w-10" aria-hidden />}
          action={
            <Button onClick={() => refetchMetrics()} data-testid="growth-metrics-retry">
              {t('customerGrowth.metricsError.retry')}
            </Button>
          }
        />
      ) : metrics ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="growth-metrics">
          <MetricTile
            label={t('customerGrowth.metrics.imported')}
            value={metrics.importedCustomers}
          />
          <MetricTile
            label={t('customerGrowth.metrics.onSupplify')}
            value={metrics.existingSupplifyCustomers}
          />
          <MetricTile
            label={t('customerGrowth.metrics.invited')}
            value={metrics.invitedCustomers}
          />
          <MetricTile
            label={t('customerGrowth.metrics.converted')}
            value={metrics.convertedCustomers}
          />
          <MetricTile
            label={t('customerGrowth.metrics.sponsored')}
            value={metrics.sponsoredCustomers}
          />
          <MetricTile
            label={t('customerGrowth.metrics.registered')}
            value={metrics.registeredCustomers}
          />
          <MetricTile
            label={t('customerGrowth.metrics.revenueGenerated')}
            value={`$${metrics.revenueGenerated}`}
          />
          <MetricTile
            label={t('customerGrowth.metrics.rewardsEarned')}
            value={t('customerGrowth.metrics.rewardsMonths', {
              months: metrics.rewardsEarned.freeMonths,
            })}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t('customerGrowth.import.title')}
          </CardTitle>
          <CardDescription>{t('customerGrowth.import.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] p-3 text-xs text-[var(--text-mid)]">
            <p className="font-medium text-[var(--text)]">
              {t('customerGrowth.import.howItWorks')}
            </p>
            <ol className="mt-1.5 list-decimal list-inside space-y-1 text-[var(--text-muted)]">
              <li>{t('customerGrowth.import.step1')}</li>
              <li>{t('customerGrowth.import.step2')}</li>
              <li>{t('customerGrowth.import.step3')}</li>
            </ol>
            <p className="mt-3 font-medium text-[var(--text)]">
              {t('customerGrowth.import.csvColumns')}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed">
              {t('customerGrowth.import.csvColumnList')}
            </p>
            <p className="mt-2 text-[var(--text-muted)]">{t('customerGrowth.import.csvHelp')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              {t('customerGrowth.import.downloadTemplate')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
              className="max-w-xs"
            />
            <Button onClick={runImport} disabled={importing || !csvText.trim()}>
              {importing
                ? t('customerGrowth.import.importing')
                : t('customerGrowth.import.runImport')}
            </Button>
          </div>

          {importPreviewMeta && (
            <div
              data-testid="customer-import-preview-summary"
              className="rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
            >
              {t('customerGrowth.import.previewSummary', {
                valid: importPreviewMeta.validCount,
                errors: importPreviewMeta.errorCount,
                total: importPreviewMeta.totalRows,
              })}
            </div>
          )}

          {importPreview.length > 0 && (
            <div className="space-y-2">
              <Label>{t('customerGrowth.import.previewLabel')}</Label>
              <div className="border rounded-md overflow-x-auto max-h-48">
                <table className="w-full text-sm" data-testid="customer-import-preview-table">
                  <thead>
                    <tr className="bg-[var(--brand-ultra)] border-b">
                      <th className="px-3 py-2 text-left">{t('customerGrowth.import.row')}</th>
                      <th className="px-3 py-2 text-left">{t('customerGrowth.import.status')}</th>
                      <th className="px-3 py-2 text-left">
                        {t('customerGrowth.import.restaurant')}
                      </th>
                      <th className="px-3 py-2 text-left">{t('customerGrowth.import.email')}</th>
                      <th className="px-3 py-2 text-left">{t('customerGrowth.import.issues')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={
                          row.status === 'valid'
                            ? 'border-b'
                            : 'border-b bg-red-50/50 dark:bg-red-950/20'
                        }
                      >
                        <td className="px-3 py-2">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-medium">{row.status}</td>
                        <td className="px-3 py-2">{row.mapped?.restaurant_name ?? '—'}</td>
                        <td className="px-3 py-2">{row.mapped?.email ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-[var(--red)]">
                          {(row.errors || []).map((e) => e.message).join('; ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {previewRowsWithIssues.length > 0 &&
            importPreviewMeta &&
            importPreviewMeta.errorCount > 0 && (
              <p className="text-sm text-[var(--red)]">
                {t('customerGrowth.import.rowsNeedAttention', {
                  count: importPreviewMeta.errorCount,
                })}
              </p>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('customerGrowth.prospects.title')}
          </CardTitle>
          <CardDescription>{t('customerGrowth.prospects.description')}</CardDescription>
          {eligibleSponsorPlans.length > 0 && (
            <div className="mt-3 space-y-2 rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--text)]">
                  {t('customerGrowth.prospects.defaultGiftPlan')}
                </span>
                <Select
                  value={sponsorPlanCode}
                  onValueChange={(value) => setSponsorPlanCode(value as SponsorshipGiftPlanKey)}
                >
                  <SelectTrigger
                    className="h-8 w-[160px]"
                    data-testid="growth-sponsor-plan-picker"
                    aria-label={t('customerGrowth.prospects.sponsorPlanAria')}
                  >
                    {eligibleSponsorPlans.map((planKey) => (
                      <option key={planKey} value={planKey}>
                        {SPONSORSHIP_PLAN_LABELS[planKey]}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
                {metrics?.sponsorshipLimit != null && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {t('customerGrowth.prospects.sponsorLimit', {
                      count: metrics.sponsorshipLimit,
                    })}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                You are offering to sponsor one billing month only. Future subscription charges are
                the restaurant&apos;s responsibility. The restaurant must accept and select a plan;
                you are charged only after acceptance.
                {metrics?.sponsorshipUsage
                  ? ` Usage: ${metrics.sponsorshipUsage.used}${
                      metrics.sponsorshipUsage.unlimited
                        ? ' (unlimited)'
                        : ` / ${metrics.sponsorshipUsage.limit} this year`
                    }.`
                  : metrics?.sponsorshipLimit != null
                    ? ` Limit: ${metrics.sponsorshipLimit}/year.`
                    : ''}
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {prospectsLoading ? (
            <div className="space-y-3" data-testid="prospects-skeleton">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : prospectsError ? (
            <EmptyState
              title={t('customerGrowth.prospects.errorTitle')}
              description={t('customerGrowth.prospects.errorDescription')}
              icon={<AlertTriangle className="h-10 w-10" aria-hidden />}
              action={
                <Button onClick={() => refetchProspects()} data-testid="prospects-retry">
                  {t('customerGrowth.prospects.retry')}
                </Button>
              }
            />
          ) : prospects.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              {t('customerGrowth.prospects.empty')}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                {t('customerGrowth.prospects.actionsHelp', {
                  plan: SPONSORSHIP_PLAN_LABELS[sponsorPlanCode],
                })}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)] border-b">
                      <th className="py-2 pr-4">{t('customerGrowth.import.restaurant')}</th>
                      <th className="py-2 pr-4">{t('customerGrowth.prospects.match')}</th>
                      <th className="py-2 pr-4">{t('customerGrowth.prospects.status')}</th>
                      <th className="py-2">{t('customerGrowth.prospects.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prospects.map((p) => (
                      <tr key={p.id} className="border-b border-[var(--app-border)]">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{p.restaurant_name}</div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {p.email || p.phone}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant="outline">{p.match_status}</Badge>
                          {p.matched_restaurant_name && (
                            <span className="text-xs block mt-1">{p.matched_restaurant_name}</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge>{p.lifecycle_status}</Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            {p.match_status === 'existing_supplify' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!canManageCustomers}
                                  onClick={async () => {
                                    try {
                                      await connectProspect({ prospectId: p.id }).unwrap()
                                      toast.success(t('customerGrowth.toasts.connectionSent'))
                                      refetchProspects()
                                    } catch {
                                      toast.error(t('customerGrowth.toasts.connectionFailed'))
                                    }
                                  }}
                                >
                                  {t('customerGrowth.prospects.connect')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!canManageCustomers}
                                  onClick={async () => {
                                    try {
                                      await createSponsorshipOffer({
                                        prospectId: p.id,
                                        idempotencyKey: `offer_${p.id}_${Date.now()}`,
                                      }).unwrap()
                                      toast.success(
                                        'Sponsorship offer sent. Restaurant must accept and select a plan before you are charged.'
                                      )
                                      refetchProspects()
                                      refetchSponsorships()
                                    } catch (e: unknown) {
                                      const msg =
                                        (e as { data?: { error?: { message?: string } } })?.data
                                          ?.error?.message ||
                                        t('customerGrowth.toasts.sponsorFailed')
                                      toast.error(msg)
                                    }
                                  }}
                                >
                                  <Gift className="h-3 w-3 mr-1" />
                                  Sponsor first month
                                </Button>
                              </>
                            )}
                            {p.match_status === 'import_only' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      const res = await inviteProspect({
                                        prospectId: p.id,
                                        channel: 'link',
                                      }).unwrap()
                                      await navigator.clipboard.writeText(res.inviteUrl)
                                      toast.success(t('customerGrowth.toasts.inviteCopied'))
                                    } catch {
                                      toast.error(t('customerGrowth.toasts.inviteFailed'))
                                    }
                                  }}
                                >
                                  <Link2 className="h-3 w-3 mr-1" />
                                  {t('customerGrowth.prospects.invite')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!canManageCustomers}
                                  onClick={async () => {
                                    try {
                                      await createSponsorshipOffer({
                                        prospectId: p.id,
                                        idempotencyKey: `offer_${p.id}_${Date.now()}`,
                                      }).unwrap()
                                      toast.success(
                                        'Sponsorship offer sent. Restaurant must accept and select a plan before you are charged.'
                                      )
                                      refetchProspects()
                                      refetchSponsorships()
                                    } catch (e: unknown) {
                                      const msg =
                                        (e as { data?: { error?: { message?: string } } })?.data
                                          ?.error?.message ||
                                        t('customerGrowth.toasts.sponsorFailed')
                                      toast.error(msg)
                                    }
                                  }}
                                >
                                  <Gift className="h-3 w-3 mr-1" />
                                  Sponsor first month
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="supplier-sponsorships-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Sponsorship offers &amp; payments
          </CardTitle>
          <CardDescription>
            Track offer status, pay one-time invoices after restaurant acceptance, and retry failed
            charges. You are paying for one billing month only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(sponsorshipsData?.sponsorships || []).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No sponsorships yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] border-b">
                    <th className="py-2 pr-4">Prospect / restaurant</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(sponsorshipsData?.sponsorships || []).map((s) => (
                    <tr key={s.id} className="border-b border-[var(--app-border)]">
                      <td className="py-3 pr-4">
                        {s.prospect_name || s.restaurant_id || s.prospect_id}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge>{s.status}</Badge>
                        {s.failure_reason && (
                          <span className="block text-xs text-[var(--red)] mt-1">
                            {s.failure_reason}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {s.sponsored_amount != null
                          ? `$${Number(s.sponsored_amount).toFixed(2)} ${s.currency || 'USD'}`
                          : '—'}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          {['payment_pending', 'payment_failed'].includes(s.status) &&
                            canManageCustomers && (
                              <Button
                                size="sm"
                                onClick={async () => {
                                  try {
                                    const key = `pay_${s.id}_${Date.now()}`
                                    if (s.status === 'payment_failed') {
                                      await retrySponsorshipPayment({
                                        id: s.id,
                                        idempotencyKey: key,
                                      }).unwrap()
                                    } else {
                                      await paySponsorship({
                                        id: s.id,
                                        idempotencyKey: key,
                                      }).unwrap()
                                    }
                                    toast.success('Sponsorship payment submitted')
                                    refetchSponsorships()
                                  } catch (e: unknown) {
                                    toast.error(
                                      (e as { data?: { error?: { message?: string } } })?.data
                                        ?.error?.message || 'Payment failed'
                                    )
                                  }
                                }}
                              >
                                {s.status === 'payment_failed' ? 'Retry payment' : 'Pay invoice'}
                              </Button>
                            )}
                          {['offered', 'accepted', 'payment_pending', 'payment_failed'].includes(
                            s.status
                          ) &&
                            canManageCustomers && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    await cancelSponsorship({ id: s.id }).unwrap()
                                    toast.success('Sponsorship cancelled')
                                    refetchSponsorships()
                                  } catch (e: unknown) {
                                    toast.error(
                                      (e as { data?: { error?: { message?: string } } })?.data
                                        ?.error?.message || 'Cancel failed'
                                    )
                                  }
                                }}
                              >
                                Cancel
                              </Button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
