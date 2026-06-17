import { useState, useMemo, useEffect } from 'react'
import { Upload, Users, Link2, Gift, AlertTriangle, Download } from 'lucide-react'
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
  useSponsorProspectMutation,
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
  const [sponsorProspect] = useSponsorProspectMutation()
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
        toast.error('No valid rows to import — fix errors below')
      } else {
        toast.success(
          `Preview: ${preview.validCount} valid, ${preview.errorCount} with issues (${preview.totalRows} rows)`
        )
      }
    } catch {
      toast.error('Could not preview CSV')
    }
  }

  const runImport = async () => {
    if (!csvText.trim()) {
      toast.error('Upload a CSV file first')
      return
    }
    if (importPreviewMeta && importPreviewMeta.validCount === 0) {
      toast.error('Fix validation errors before importing')
      return
    }
    try {
      const result = await executeImport({ csv: csvText }).unwrap()
      toast.success(`Imported ${result.created} customers`)
      setImportPreview([])
      setImportPreviewMeta(null)
      setCsvText('')
      refetchProspects()
      refetchMetrics()
    } catch {
      toast.error('Import failed')
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
        <PageHeader title="Customer Growth" />
        <FeatureLockedCard
          featureKey="supplier_growth"
          featureName="Customer growth & referrals"
          currentPlan={entitlementsData?.entitlements?.plan?.name ?? null}
        />
      </PageShell>
    )
  }

  return (
    <PageShell maxWidth="wide" data-testid="customer-growth-page">
      <PageHeader
        title="Customer Growth"
        description="Bring your existing restaurant customers onto Supplify. Upload a customer list, see who is already on the platform, then invite new restaurants or gift them a paid plan to get them started."
      />

      {metricsLoading ? (
        <MetricsSkeleton />
      ) : metricsError ? (
        <EmptyState
          title="Could not load growth metrics"
          description="Check your connection and try again."
          icon={<AlertTriangle className="h-10 w-10" aria-hidden />}
          action={
            <Button onClick={() => refetchMetrics()} data-testid="growth-metrics-retry">
              Retry
            </Button>
          }
        />
      ) : metrics ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="growth-metrics">
          <MetricTile label="Imported" value={metrics.importedCustomers} />
          <MetricTile label="On Supplify" value={metrics.existingSupplifyCustomers} />
          <MetricTile label="Invited" value={metrics.invitedCustomers} />
          <MetricTile label="Converted" value={metrics.convertedCustomers} />
          <MetricTile label="Sponsored" value={metrics.sponsoredCustomers} />
          <MetricTile label="Registered" value={metrics.registeredCustomers} />
          <MetricTile label="Revenue generated" value={`$${metrics.revenueGenerated}`} />
          <MetricTile label="Rewards earned" value={`${metrics.rewardsEarned.freeMonths} mo`} />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import customers
          </CardTitle>
          <CardDescription>
            Upload a spreadsheet of restaurants you already supply. We match each row to Supplify
            accounts automatically so you can connect, invite, or sponsor them from the list below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] p-3 text-xs text-[var(--text-mid)]">
            <p className="font-medium text-[var(--text)]">How it works</p>
            <ol className="mt-1.5 list-decimal list-inside space-y-1 text-[var(--text-muted)]">
              <li>Download the example CSV or use your own file with the columns below.</li>
              <li>Choose a file — we validate rows and show a preview before anything is saved.</li>
              <li>
                Run import — matched restaurants appear in Imported customers for your next step.
              </li>
            </ol>
            <p className="mt-3 font-medium text-[var(--text)]">CSV columns</p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed">
              Restaurant Name, Contact Person, Phone, Email, Address, Area/Region, Credit Limit,
              Payment Terms, Sales Representative, Notes
            </p>
            <p className="mt-2 text-[var(--text-muted)]">
              Restaurant Name is required. Email or phone helps us match existing Supplify accounts.
              All other columns are optional but useful for your records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Download example CSV
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
              {importing ? 'Importing…' : 'Run import'}
            </Button>
          </div>

          {importPreviewMeta && (
            <div
              data-testid="customer-import-preview-summary"
              className="rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
            >
              <strong>{importPreviewMeta.validCount}</strong> valid ·{' '}
              <strong className="text-[var(--red)]">{importPreviewMeta.errorCount}</strong> with
              issues · {importPreviewMeta.totalRows} total rows
            </div>
          )}

          {importPreview.length > 0 && (
            <div className="space-y-2">
              <Label>Import preview</Label>
              <div className="border rounded-md overflow-x-auto max-h-48">
                <table className="w-full text-sm" data-testid="customer-import-preview-table">
                  <thead>
                    <tr className="bg-[var(--brand-ultra)] border-b">
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Restaurant</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Issues</th>
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
                {importPreviewMeta.errorCount} row(s) need attention before import
              </p>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Imported customers
          </CardTitle>
          <CardDescription>
            Restaurants from your import, with their match status on Supplify. For restaurants
            already on the platform, send a connection request. For everyone else, share an invite
            link or sponsor them with a one-month gift subscription.
          </CardDescription>
          {eligibleSponsorPlans.length > 0 && (
            <div className="mt-3 space-y-2 rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--text)]">
                  Default gift plan for Sponsor
                </span>
                <Select
                  value={sponsorPlanCode}
                  onValueChange={(value) => setSponsorPlanCode(value as SponsorshipGiftPlanKey)}
                >
                  <SelectTrigger
                    className="h-8 w-[160px]"
                    data-testid="growth-sponsor-plan-picker"
                    aria-label="Sponsorship gift plan"
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
                    Up to {metrics.sponsorshipLimit} gift
                    {metrics.sponsorshipLimit === 1 ? '' : 's'} per year on your supplier plan
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Sponsoring gives a restaurant one free month of Supplify{' '}
                {SPONSORSHIP_PLAN_LABELS[sponsorPlanCode]} — they can order from you on the platform
                with full plan features. After the gift month they choose whether to subscribe; they
                may still qualify for your referral discount.
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
              title="Could not load imported customers"
              description="Check your connection and try again."
              icon={<AlertTriangle className="h-10 w-10" aria-hidden />}
              action={
                <Button onClick={() => refetchProspects()} data-testid="prospects-retry">
                  Retry
                </Button>
              }
            />
          ) : prospects.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No customers imported yet. Upload a CSV above — after import, each restaurant will
              show here with options to connect, invite, or sponsor.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                <strong className="font-medium text-[var(--text)]">Connect</strong> — already on
                Supplify; sends a follow request they must accept.{' '}
                <strong className="font-medium text-[var(--text)]">Invite</strong> — copies a signup
                link with your referral benefits.{' '}
                <strong className="font-medium text-[var(--text)]">Sponsor</strong> — starts their
                one-month {SPONSORSHIP_PLAN_LABELS[sponsorPlanCode]} gift immediately.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)] border-b">
                      <th className="py-2 pr-4">Restaurant</th>
                      <th className="py-2 pr-4">Match</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Actions</th>
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
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    await connectProspect({ prospectId: p.id }).unwrap()
                                    toast.success('Connection request sent')
                                    refetchProspects()
                                  } catch {
                                    toast.error('Could not send connection request')
                                  }
                                }}
                              >
                                Connect
                              </Button>
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
                                      toast.success('Invite link copied')
                                    } catch {
                                      toast.error('Invite failed')
                                    }
                                  }}
                                >
                                  <Link2 className="h-3 w-3 mr-1" />
                                  Invite
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      await sponsorProspect({
                                        prospectId: p.id,
                                        planCode: sponsorPlanCode,
                                      }).unwrap()
                                      toast.success('Sponsorship started')
                                      refetchProspects()
                                    } catch (e: unknown) {
                                      const msg =
                                        (e as { data?: { error?: { message?: string } } })?.data
                                          ?.error?.message || 'Sponsor failed'
                                      toast.error(msg)
                                    }
                                  }}
                                >
                                  <Gift className="h-3 w-3 mr-1" />
                                  Sponsor
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
    </PageShell>
  )
}
