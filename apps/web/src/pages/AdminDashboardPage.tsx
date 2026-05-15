import { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  api,
  useGetAdminOverviewQuery,
  useGetAdminConversionStatsQuery,
  useGetAdminPlansQuery,
  useGetAdminSubscriptionsQuery,
  useGetAdminAuditLogsQuery,
  useUpdateAdminPlanMutation,
  useUpdateAdminSubscriptionMutation,
  useCreateAdminPlanMutation,
  usePreviewSubscriptionPlanChangeMutation,
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
  useStartImpersonationMutation,
} from '@/services/api'
import {
  Loader2,
  Plus,
  Edit,
  Trash2,
  Users,
  Building2,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Package,
  UserCog,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { SubscriptionPlan } from '@/types'
import { getPlanSubtitle } from '../lib/planComparison'
import { formatCurrency } from '@/utils/format'
import { AdminFeatureFlagsPanel } from '@/components/admin/AdminFeatureFlagsPanel'

interface AdminDashboardPageProps {
  initialTab?: string
}

export function AdminDashboardPage({ initialTab = 'overview' }: AdminDashboardPageProps) {
  // Default to 'tenants' tab for supplier/restaurant admin views, otherwise use initialTab
  const defaultTab =
    initialTab === 'suppliers' || initialTab === 'restaurants' ? 'tenants' : (initialTab || 'overview')
  const [selectedTab, setSelectedTab] = useState(defaultTab)

  // Sync selected tab when route changes (e.g. sidebar: Admin Dashboard → Supplier Admin)
  useEffect(() => {
    setSelectedTab(defaultTab)
  }, [defaultTab])
  const [plansTenantFilter, setPlansTenantFilter] = useState<'RESTAURANT' | 'SUPPLIER' | undefined>(
    undefined
  )
  const { data: overview, isLoading: overviewLoading } = useGetAdminOverviewQuery()
  const { data: conversionStats } = useGetAdminConversionStatsQuery({ days: 30 })
  const { data: plansData, isLoading: plansLoading } = useGetAdminPlansQuery(
    plansTenantFilter ? { tenant_type: plansTenantFilter } : {}
  )
  const { data: subscriptionsData, isLoading: subscriptionsLoading } =
    useGetAdminSubscriptionsQuery({})

  // Deduplicate plans by (code, tenant_type) and subscriptions by (tenant_id, tenant_type) for display
  const plans =
    plansData?.plans?.filter(
      (p, i, arr) =>
        arr.findIndex(
          (x) => x.code === p.code && (x.tenant_type || 'RESTAURANT') === (p.tenant_type || 'RESTAURANT')
        ) === i
    ) ?? []
  const subscriptions =
    subscriptionsData?.subscriptions?.filter(
      (s, i, arr) =>
        arr.findIndex((x) => x.tenant_id === s.tenant_id && x.tenant_type === s.tenant_type) === i
    ) ?? []
  const { data: auditLogsData, isLoading: auditLoading } = useGetAdminAuditLogsQuery({})
  const { data: healthData, isLoading: healthLoading } = (api as any).useGetAdminHealthQuery()
  const { data: financeData, isLoading: financeLoading } = (
    api as any
  ).useGetAdminFinancialOverviewQuery()

  // Load tenant data
  const {
    data: suppliersData,
    isLoading: suppliersLoading,
    error: suppliersError,
  } = useGetAdminSuppliersQuery()
  const {
    data: restaurantsData,
    isLoading: restaurantsLoading,
    error: restaurantsError,
  } = useGetAdminRestaurantsQuery()

  const [createPlan] = useCreateAdminPlanMutation()
  const [updatePlan] = useUpdateAdminPlanMutation()
  const [updateSubscription] = useUpdateAdminSubscriptionMutation()
  const [previewPlanChange] = usePreviewSubscriptionPlanChangeMutation()
  const [startImpersonation] = useStartImpersonationMutation()

  const [changePlanModal, setChangePlanModal] = useState<{
    open: boolean
    subId: string
    tenantType: 'RESTAURANT' | 'SUPPLIER'
    tenantName: string
    targetPlanId: string
  } | null>(null)
  const [changePlanPreview, setChangePlanPreview] = useState<{
    willExceed: Array<{ limitKey: string; usage: number; limit: number }>
    featureDiff: { enabled: string[]; disabled: string[] }
    recommendedActions: string[]
  } | null>(null)
  const [changePlanForce, setChangePlanForce] = useState(false)

  const [editPlanModal, setEditPlanModal] = useState<{
    open: boolean
    plan: SubscriptionPlan
  } | null>(null)
  const [editPlanForm, setEditPlanForm] = useState({
    name: '',
    description: '',
    pricePerMonth: 0,
    pricePerYear: 0,
    trialDays: 0,
    displayOrder: 0,
    isActive: true,
  })
  const [createPlanOpen, setCreatePlanOpen] = useState(false)
  const [createPlanForm, setCreatePlanForm] = useState({
    code: '',
    name: '',
    tenantType: 'RESTAURANT' as 'RESTAURANT' | 'SUPPLIER',
    description: '',
    pricePerMonth: 0,
    pricePerYear: 0,
    trialDays: 0,
    displayOrder: 0,
    isActive: true,
  })

  const handleCreatePlan = async () => {
    try {
      await createPlan({
        ...createPlanForm,
        limits: {},
        features: {},
      }).unwrap()
      toast.success('Plan created')
      setCreatePlanOpen(false)
      setCreatePlanForm({
        code: '',
        name: '',
        tenantType: 'RESTAURANT',
        description: '',
        pricePerMonth: 0,
        pricePerYear: 0,
        trialDays: 0,
        displayOrder: 0,
        isActive: true,
      })
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Failed to create plan')
    }
  }

  const openEditPlanModal = (plan: SubscriptionPlan) => {
    setEditPlanModal({ open: true, plan })
    setEditPlanForm({
      name: plan.name,
      description: plan.description ?? '',
      pricePerMonth: plan.price_per_month ?? 0,
      pricePerYear: plan.price_per_year ?? 0,
      trialDays: plan.trial_days ?? 0,
      displayOrder: plan.display_order ?? 0,
      isActive: plan.is_active ?? true,
    })
  }

  const handleSaveEditPlan = async () => {
    if (!editPlanModal?.plan) return
    try {
      await updatePlan({
        id: editPlanModal.plan.id,
        data: editPlanForm,
      }).unwrap()
      toast.success('Plan updated')
      setEditPlanModal(null)
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Failed to update plan')
    }
  }

  const handleUpdatePlan = async (id: string, data: any) => {
    try {
      await updatePlan({ id, data }).unwrap()
    } catch (error) {
      console.error('Failed to update plan:', error)
    }
  }

  const openChangePlanModal = (sub: {
    id: string
    tenant_type: 'RESTAURANT' | 'SUPPLIER'
    tenant_name?: string
  }) => {
    setChangePlanModal({
      open: true,
      subId: sub.id,
      tenantType: sub.tenant_type,
      tenantName: sub.tenant_name || 'Tenant',
      targetPlanId: '',
    })
    setChangePlanPreview(null)
    setChangePlanForce(false)
  }

  const hasPreviewContent = (preview: typeof changePlanPreview) =>
    preview &&
    (preview.willExceed?.length > 0 ||
      preview.featureDiff?.enabled?.length > 0 ||
      preview.featureDiff?.disabled?.length > 0 ||
      (preview.recommendedActions?.length ?? 0) > 0)

  const runPreviewPlanChange = async () => {
    if (!changePlanModal?.targetPlanId) return
    try {
      const result = await previewPlanChange({
        subscriptionId: changePlanModal.subId,
        targetPlanId: changePlanModal.targetPlanId,
      }).unwrap()
      setChangePlanPreview(result)
    } catch {
      toast.error('Failed to load preview')
    }
  }

  const applyPlanChange = async () => {
    if (!changePlanModal?.targetPlanId) return
    try {
      await updateSubscription({
        id: changePlanModal.subId,
        data: { planId: changePlanModal.targetPlanId, allowExceedance: changePlanForce },
      }).unwrap()
      toast.success('Plan updated')
      setChangePlanModal(null)
      setChangePlanPreview(null)
    } catch (err: unknown) {
      const e = err as {
        data?: { error?: { name?: string; message?: string; details?: { willExceed?: unknown[] } } }
      }
      const details = e?.data?.error?.details
      if (e?.data?.error?.name === 'LIMIT_EXCEEDED' && details?.willExceed) {
        toast.error('Usage exceeds target plan. Check preview or force change.')
        setChangePlanPreview({
          willExceed: details.willExceed as Array<{
            limitKey: string
            usage: number
            limit: number
          }>,
          featureDiff: { enabled: [], disabled: [] },
          recommendedActions: ['Pass allowExceedance: true to force change.'],
        })
      } else {
        toast.error(e?.data?.error?.message || 'Failed to update plan')
      }
    }
  }

  const handleUpdateSubscription = async (id: string, data: any) => {
    try {
      await updateSubscription({ id, data }).unwrap()
    } catch (error) {
      console.error('Failed to update subscription:', error)
    }
  }

  return (
    <div className="p-6" data-testid="admin-dashboard-page">
      <div className="mb-6">
        <h1 className="text-[21px] font-black text-[var(--text)]">Admin Dashboard</h1>
        <p className="text-[var(--text-muted)] mt-2">Manage subscriptions, plans, and tenant quotas</p>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList
          className={
            initialTab === 'suppliers' || initialTab === 'restaurants'
              ? 'grid w-full grid-cols-3'
              : 'grid w-full grid-cols-9'
          }
        >
          {initialTab !== 'suppliers' && initialTab !== 'restaurants' && (
            <>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="plans">Plans</TabsTrigger>
              <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
              <TabsTrigger value="tenants">Tenants</TabsTrigger>
              <TabsTrigger value="health">Health</TabsTrigger>
              <TabsTrigger value="finance">Finance</TabsTrigger>
              <TabsTrigger value="usage">Usage</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </>
          )}

          {(initialTab === 'suppliers' || initialTab === 'restaurants') && (
            <>
              <TabsTrigger value={initialTab === 'suppliers' ? 'tenants' : 'tenants'}>
                Directory
              </TabsTrigger>
              <TabsTrigger value="usage">Usage & Quotas</TabsTrigger>
              <TabsTrigger value="audit">Audit Logs</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {overviewLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-[var(--text)]">Tenants</h3>
                    <Users className="h-5 w-5 text-[var(--brand-mid)]" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Suppliers:</span>
                      <span className="font-semibold">{overview?.tenantCounts?.SUPPLIER || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Restaurants:</span>
                      <span className="font-semibold">
                        {overview?.tenantCounts?.RESTAURANT || 0}
                      </span>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-[var(--text)]">Revenue</h3>
                    <DollarSign className="h-5 w-5 text-[var(--mint)]" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">MRR:</span>
                      <span className="font-semibold">
                        {formatCurrency(overview?.revenue?.mrr)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">ARR:</span>
                      <span className="font-semibold">
                        {formatCurrency(overview?.revenue?.arr)}
                      </span>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-[var(--text)]">Activity (24h)</h3>
                    <TrendingUp className="h-5 w-5 text-[var(--brand-mid)]" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Orders:</span>
                      <span className="font-semibold">
                        {overview?.activity?.ordersLast24h || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Chats:</span>
                      <span className="font-semibold">{overview?.activity?.chatsLast24h || 0}</span>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-[var(--text)] mb-4">Subscription Status</h3>
                  <div className="space-y-3">
                    {Object.entries(overview?.subscriptionStats || {}).map(([status, count]) => (
                      <div key={status} className="flex justify-between items-center">
                        <Badge variant={status === 'ACTIVE' ? 'default' : 'secondary'}>
                          {status}
                        </Badge>
                        <span className="font-semibold">{String(count)}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-[var(--text)] mb-4">Alerts</h3>
                  <div className="space-y-2">
                    {overview?.alerts?.pastDueInvoices ? (
                      <Badge variant="destructive" className="w-full justify-center py-2">
                        {overview.alerts.pastDueInvoices} Past Due Invoices
                      </Badge>
                    ) : (
                      <p className="text-[var(--text-muted)] text-sm">No alerts</p>
                    )}
                  </div>
                </Card>

                {conversionStats && (
                  <>
                    <Card className="p-6">
                      <h3 className="text-lg font-semibold text-[var(--text)] mb-4">
                        Conversion funnel (last {conversionStats.days}d)
                      </h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Blocks (feature/limit)</span>
                          <span className="font-semibold">{conversionStats.totalBlocks}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Upgrades</span>
                          <span className="font-semibold">{conversionStats.totalUpgrades}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2">
                          <span className="text-[var(--text-muted)]">Blocks → upgrades %</span>
                          <span className="font-semibold">
                            {conversionStats.blocksToUpgradesConversionPercent}%
                          </span>
                        </div>
                        {conversionStats.mostBlockedFeature && (
                          <p className="text-[var(--text-muted)] pt-1">
                            Most blocked feature:{' '}
                            <span className="font-medium">
                              {conversionStats.mostBlockedFeature}
                            </span>
                          </p>
                        )}
                        {conversionStats.mostBlockedLimit && (
                          <p className="text-[var(--text-muted)]">
                            Most blocked limit:{' '}
                            <span className="font-medium">{conversionStats.mostBlockedLimit}</span>
                          </p>
                        )}
                      </div>
                    </Card>
                    {conversionStats.funnelDropOff && (
                      <Card className="p-6">
                        <h3 className="text-lg font-semibold text-[var(--text)] mb-4">
                          Conversion drop-off
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-[var(--text-muted)]">
                                <th className="py-2 pr-4">Step</th>
                                <th className="py-2 pr-4">7d</th>
                                <th className="py-2">30d</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b">
                                <td className="py-2 pr-4">Blocked (feature/limit)</td>
                                <td className="py-2 pr-4">
                                  {conversionStats.funnelDropOff['7d'].blocked}
                                </td>
                                <td className="py-2">
                                  {conversionStats.funnelDropOff['30d'].blocked}
                                </td>
                              </tr>
                              <tr className="border-b">
                                <td className="py-2 pr-4">Open upgrade</td>
                                <td className="py-2 pr-4">
                                  {conversionStats.funnelDropOff['7d'].openUpgrade}
                                </td>
                                <td className="py-2">
                                  {conversionStats.funnelDropOff['30d'].openUpgrade}
                                </td>
                              </tr>
                              <tr className="border-b">
                                <td className="py-2 pr-4">Click upgrade</td>
                                <td className="py-2 pr-4">
                                  {conversionStats.funnelDropOff['7d'].clickUpgrade}
                                </td>
                                <td className="py-2">
                                  {conversionStats.funnelDropOff['30d'].clickUpgrade}
                                </td>
                              </tr>
                              <tr>
                                <td className="py-2 pr-4">Upgrade success</td>
                                <td className="py-2 pr-4">
                                  {conversionStats.funnelDropOff['7d'].upgradeSuccess}
                                </td>
                                <td className="py-2">
                                  {conversionStats.funnelDropOff['30d'].upgradeSuccess}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        {conversionStats.recommendationFunnel && (
                          <div className="mt-4 pt-4 border-t">
                            <h4 className="font-medium text-[var(--text)] mb-2">
                              Recommendation funnel
                            </h4>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left text-[var(--text-muted)]">
                                  <th className="py-1 pr-4">Step</th>
                                  <th className="py-1 pr-4">7d</th>
                                  <th className="py-1">30d</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b">
                                  <td className="py-1 pr-4">Recommendation shown</td>
                                  <td className="py-1 pr-4">
                                    {conversionStats.recommendationFunnel['7d'].shown}
                                  </td>
                                  <td className="py-1">
                                    {conversionStats.recommendationFunnel['30d'].shown}
                                  </td>
                                </tr>
                                <tr className="border-b">
                                  <td className="py-1 pr-4">Recommendation clicked</td>
                                  <td className="py-1 pr-4">
                                    {conversionStats.recommendationFunnel['7d'].clicked}
                                  </td>
                                  <td className="py-1">
                                    {conversionStats.recommendationFunnel['30d'].clicked}
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-1 pr-4">Upgrade success</td>
                                  <td className="py-1 pr-4">
                                    {conversionStats.recommendationFunnel['7d'].upgradeSuccess}
                                  </td>
                                  <td className="py-1">
                                    {conversionStats.recommendationFunnel['30d'].upgradeSuccess}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </Card>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="plans" className="space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <h2 className="text-2xl font-bold text-[var(--text)]">Subscription Plans</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">Filter:</span>
              <select
                className="rounded-md border border-[var(--app-border-mid)] px-3 py-1.5 text-sm"
                value={plansTenantFilter ?? ''}
                onChange={(e) =>
                  setPlansTenantFilter(
                    e.target.value === ''
                      ? undefined
                      : (e.target.value as 'RESTAURANT' | 'SUPPLIER')
                  )
                }
              >
                <option value="">All</option>
                <option value="RESTAURANT">Restaurant</option>
                <option value="SUPPLIER">Supplier</option>
              </select>
              <Dialog open={createPlanOpen} onOpenChange={setCreatePlanOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Plan
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create Plan</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Code (e.g. free, bronze)</Label>
                      <Input
                        value={createPlanForm.code}
                        onChange={(e) => setCreatePlanForm((s) => ({ ...s, code: e.target.value }))}
                        placeholder="free"
                      />
                    </div>
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={createPlanForm.name}
                        onChange={(e) => setCreatePlanForm((s) => ({ ...s, name: e.target.value }))}
                        placeholder="Free"
                      />
                    </div>
                    <div>
                      <Label>Tenant type</Label>
                      <select
                        className="w-full rounded-md border border-[var(--app-border-mid)] px-3 py-2"
                        value={createPlanForm.tenantType}
                        onChange={(e) =>
                          setCreatePlanForm((s) => ({
                            ...s,
                            tenantType: e.target.value as 'RESTAURANT' | 'SUPPLIER',
                          }))
                        }
                      >
                        <option value="RESTAURANT">Restaurant</option>
                        <option value="SUPPLIER">Supplier</option>
                      </select>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Input
                        value={createPlanForm.description}
                        onChange={(e) =>
                          setCreatePlanForm((s) => ({ ...s, description: e.target.value }))
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Price / month ($)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={createPlanForm.pricePerMonth}
                          onChange={(e) =>
                            setCreatePlanForm((s) => ({
                              ...s,
                              pricePerMonth: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Price / year ($)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={createPlanForm.pricePerYear}
                          onChange={(e) =>
                            setCreatePlanForm((s) => ({
                              ...s,
                              pricePerYear: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setCreatePlanOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreatePlan}
                        disabled={!createPlanForm.code.trim() || !createPlanForm.name.trim()}
                      >
                        Create
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {plansLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans.map((plan) => (
                <Card key={plan.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-bold text-[var(--text)]">{plan.name}</h3>
                      <Badge variant="outline">
                        {plan.tenant_type === 'RESTAURANT' ? 'Restaurant' : 'Supplier'}
                      </Badge>
                      {plan.code && <span className="text-xs text-[var(--text-muted)]">{plan.code}</span>}
                      {plan.code && getPlanSubtitle(plan.code) ? (
                        <span className="text-xs text-[var(--text-muted)]">
                          · {getPlanSubtitle(plan.code)}
                        </span>
                      ) : null}
                    </div>
                    <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="mb-4">
                    <p className="text-[21px] font-black text-[var(--text)]">
                      ${plan.price_per_month}
                      <span className="text-sm text-[var(--text-muted)] font-normal">/mo</span>
                    </p>
                    {plan.price_per_year && (
                      <p className="text-sm text-[var(--text-muted)]">${plan.price_per_year}/yr</p>
                    )}
                  </div>
                  {plan.description && (
                    <p className="text-sm text-[var(--text-muted)] mb-4">{plan.description}</p>
                  )}
                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-semibold text-[var(--text-mid)]">Limits (top 6):</p>
                    {plan.limits &&
                      (() => {
                        const limitKeys =
                          plan.tenant_type === 'RESTAURANT'
                            ? [
                                'branches',
                                'users',
                                'orders_per_day',
                                'suppliers_per_restaurant',
                                'restaurant_inventory_skus',
                                'chats_per_day',
                              ]
                            : [
                                'warehouses',
                                'users',
                                'supplier_products_skus',
                                'chats_per_day',
                                'storage_mb',
                              ]
                        const entries = limitKeys
                          .filter((k) => plan.limits[k] !== undefined)
                          .slice(0, 6)
                          .map((k) => [k, plan.limits[k]] as const)
                        return entries.map(([key, value]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-[var(--text-muted)]">{key.replace(/_/g, ' ')}:</span>
                            <span className="font-semibold">
                              {value === -1 ? 'Unlimited' : value}
                            </span>
                          </div>
                        ))
                      })()}
                  </div>
                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-semibold text-[var(--text-mid)]">Features:</p>
                    <div className="flex flex-wrap gap-1">
                      {plan.features && typeof plan.features === 'object' ? (
                        Object.entries(plan.features)
                          .map(([key, value]) => {
                            // Skip if value is false or empty
                            if (!value || value === false) return null
                            return (
                              <Badge key={key} variant={value ? 'default' : 'secondary'}>
                                {key.replace(/_/g, ' ')}
                              </Badge>
                            )
                          })
                          .filter(Boolean)
                      ) : (
                        <span className="text-sm text-[var(--text-muted)]">No features defined</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => openEditPlanModal(plan)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Dialog
            open={!!editPlanModal?.open}
            onOpenChange={(open) => !open && setEditPlanModal(null)}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Plan</DialogTitle>
              </DialogHeader>
              {editPlanModal?.plan && (
                <div className="space-y-4 py-4">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={editPlanForm.name}
                      onChange={(e) => setEditPlanForm((s) => ({ ...s, name: e.target.value }))}
                      placeholder="Plan name"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input
                      value={editPlanForm.description}
                      onChange={(e) =>
                        setEditPlanForm((s) => ({ ...s, description: e.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Price / month ($)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editPlanForm.pricePerMonth}
                        onChange={(e) =>
                          setEditPlanForm((s) => ({
                            ...s,
                            pricePerMonth: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Price / year ($)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editPlanForm.pricePerYear}
                        onChange={(e) =>
                          setEditPlanForm((s) => ({
                            ...s,
                            pricePerYear: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Trial days</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editPlanForm.trialDays}
                        onChange={(e) =>
                          setEditPlanForm((s) => ({
                            ...s,
                            trialDays: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Display order</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editPlanForm.displayOrder}
                        onChange={(e) =>
                          setEditPlanForm((s) => ({
                            ...s,
                            displayOrder: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="edit-plan-active"
                      checked={editPlanForm.isActive}
                      onChange={(e) =>
                        setEditPlanForm((s) => ({ ...s, isActive: e.target.checked }))
                      }
                      className="rounded border-[var(--app-border-mid)]"
                    />
                    <Label htmlFor="edit-plan-active">Active</Label>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setEditPlanModal(null)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveEditPlan} disabled={!editPlanForm.name.trim()}>
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-[var(--text)]">Subscriptions</h2>
          </div>

          {subscriptionsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--app-border)]">
                    <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Tenant</th>
                    <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Plan</th>
                    <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Created</th>
                    <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-[var(--text)]">
                            {sub.tenant_name || 'Unknown'}
                          </p>
                          <p className="text-sm text-[var(--text-muted)]">{sub.tenant_email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{sub.plan_name}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            sub.status === 'ACTIVE'
                              ? 'default'
                              : sub.status === 'TRIALING'
                                ? 'secondary'
                                : sub.status === 'CANCELLED'
                                  ? 'destructive'
                                  : 'secondary'
                          }
                        >
                          {sub.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{sub.tenant_type}</Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openChangePlanModal({
                              id: sub.id,
                              tenant_type: sub.tenant_type,
                              tenant_name: sub.tenant_name,
                            })
                          }
                        >
                          Change plan
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="health" className="space-y-6">
          <h2 className="text-2xl font-bold text-[var(--text)]">System Health</h2>
          {healthLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <div className="grid gap-4">
              {healthData?.dbPool && (
                <Card>
                  <CardHeader>
                    <CardTitle>DB Pool</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      Total: {healthData.dbPool.total} · Idle: {healthData.dbPool.idle} · Waiting:{' '}
                      {healthData.dbPool.waiting}
                    </p>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>Recent API Errors</CardTitle>
                </CardHeader>
                <CardContent>
                  {!healthData?.recentApiErrors?.length ? (
                    <p className="text-sm text-[var(--text-muted)]">No recent errors</p>
                  ) : (
                    <ul className="text-sm space-y-1 max-h-64 overflow-auto">
                      {healthData.recentApiErrors.map((e: any, i: number) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-[var(--red)]">{e.type}</span>
                          <span>{e.source}</span>
                          <span className="text-[var(--text-muted)] truncate">{e.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="finance" className="space-y-6">
          <h2 className="text-2xl font-bold text-[var(--text)]">Financial Overview</h2>
          {financeLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>GMV & Revenue</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="flex justify-between">
                    <span>GMV</span>
                    <span className="font-semibold">{formatCurrency(financeData?.gmv)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Outstanding</span>
                    <span className="font-semibold">{formatCurrency(financeData?.outstanding)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Overdue</span>
                    <span className="font-semibold text-[var(--red)]">{formatCurrency(financeData?.overdue)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>MRR</span>
                    <span className="font-semibold">{formatCurrency(financeData?.mrr)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>ARR</span>
                    <span className="font-semibold">{formatCurrency(financeData?.arr)}</span>
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Revenue by Plan</CardTitle>
                </CardHeader>
                <CardContent>
                  {!financeData?.revenueByPlan?.length ? (
                    <p className="text-sm text-[var(--text-muted)]">No data</p>
                  ) : (
                    <ul className="text-sm space-y-1">
                      {financeData.revenueByPlan.map((r: any, i: number) => (
                        <li key={i} className="flex justify-between">
                          <span>
                            {r.planName} ({r.tenantType})
                          </span>
                          <span>
                            {formatCurrency(r.mrr)} · {r.subscriptionCount} subs
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tenants" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-[var(--text)]">
              {initialTab === 'suppliers'
                ? 'Supplier Management'
                : initialTab === 'restaurants'
                  ? 'Restaurant Management'
                  : 'Tenant Management'}
            </h2>
          </div>

          {(() => {
            // Show only suppliers or restaurants based on initialTab
            const showSuppliersOnly = initialTab === 'suppliers'
            const showRestaurantsOnly = initialTab === 'restaurants'

            return (
              <div className="space-y-6">
                {/* Suppliers Section - Show if not restaurant-only view */}
                {!showRestaurantsOnly && (
                  <Card>
                    <CardHeader>
                      <h3 className="text-xl font-bold text-[var(--text)]">Suppliers</h3>
                      <p className="text-sm text-[var(--text-muted)]">
                        Manage supplier tenants and subscriptions
                      </p>
                    </CardHeader>
                    <CardContent>
                      {suppliersError ? (
                        <div className="p-4 bg-[var(--red-pale)] border border-[var(--red)]/30 rounded">
                          <p className="text-[var(--red)]">
                            Error loading suppliers. Check console for details.
                          </p>
                        </div>
                      ) : suppliersLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : !suppliersData?.suppliers || suppliersData.suppliers.length === 0 ? (
                        <p className="text-center py-8 text-[var(--text-muted)]">No suppliers found</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-[var(--app-border)]">
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Supplier
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Plan
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Status
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Products
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Warehouses
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Revenue
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {suppliersData.suppliers.map((supplier: any) => (
                                <tr
                                  key={supplier.id}
                                  className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
                                >
                                  <td className="py-3 px-4">
                                    <div>
                                      <p className="font-medium text-[var(--text)]">{supplier.name}</p>
                                      <p className="text-sm text-[var(--text-muted)]">
                                        {supplier.contact_email}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge variant="outline">{supplier.plan_name || 'Free'}</Badge>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge
                                      variant={
                                        supplier.subscription_status === 'ACTIVE'
                                          ? 'default'
                                          : 'secondary'
                                      }
                                    >
                                      {supplier.subscription_status || 'NONE'}
                                    </Badge>
                                  </td>
                                  <td className="py-3 px-4 text-[var(--text-muted)]">
                                    {supplier.product_count || 0}
                                  </td>
                                  <td className="py-3 px-4 text-[var(--text-muted)]">
                                    {supplier.warehouse_count || 0}
                                  </td>
                                  <td className="py-3 px-4 text-[var(--text-muted)]">
                                    {formatCurrency(supplier.total_revenue)}
                                  </td>
                                  <td className="py-3 px-4 flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      title="View as this supplier"
                                      onClick={async () => {
                                        try {
                                          await startImpersonation({
                                            tenantId: supplier.id,
                                            tenantType: 'SUPPLIER',
                                          }).unwrap()
                                          toast.success(`Impersonating ${supplier.name}`)
                                          window.location.reload()
                                        } catch (e: any) {
                                          toast.error(
                                            e?.data?.error?.message ||
                                              'Failed to start impersonation'
                                          )
                                        }
                                      }}
                                    >
                                      <UserCog className="h-4 w-4 mr-1" />
                                      Impersonate
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      title="Change plan"
                                      onClick={() => {
                                        const subId = (supplier as { subscription_id?: string })
                                          .subscription_id
                                        if (!subId) {
                                          toast.error(
                                            'No active subscription for this supplier. Assign a plan from the Subscriptions tab.'
                                          )
                                          return
                                        }
                                        openChangePlanModal({
                                          id: subId,
                                          tenant_type: 'SUPPLIER',
                                          tenant_name: supplier.name,
                                        })
                                      }}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const subId = (supplier as { subscription_id?: string })
                                          .subscription_id
                                        if (!subId) {
                                          toast.error(
                                            'No active subscription for this supplier. Assign a plan from the Subscriptions tab.'
                                          )
                                          return
                                        }
                                        openChangePlanModal({
                                          id: subId,
                                          tenant_type: 'SUPPLIER',
                                          tenant_name: supplier.name,
                                        })
                                      }}
                                    >
                                      Change plan
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Restaurants Section - Show if not supplier-only view */}
                {!showSuppliersOnly && (
                  <Card>
                    <CardHeader>
                      <h3 className="text-xl font-bold text-[var(--text)]">Restaurants</h3>
                      <p className="text-sm text-[var(--text-muted)]">
                        Manage restaurant tenants and subscriptions
                      </p>
                    </CardHeader>
                    <CardContent>
                      {restaurantsError ? (
                        <div className="p-4 bg-[var(--red-pale)] border border-[var(--red)]/30 rounded">
                          <p className="text-[var(--red)]">
                            Error loading restaurants. Check console for details.
                          </p>
                        </div>
                      ) : restaurantsLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : !restaurantsData?.restaurants ||
                        restaurantsData.restaurants.length === 0 ? (
                        <p className="text-center py-8 text-[var(--text-muted)]">No restaurants found</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-[var(--app-border)]">
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Restaurant
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Plan
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Status
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Orders (30d)
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Total Spent
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {restaurantsData.restaurants.map((restaurant: any) => (
                                <tr
                                  key={restaurant.id}
                                  className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
                                >
                                  <td className="py-3 px-4">
                                    <div>
                                      <p className="font-medium text-[var(--text)]">{restaurant.name}</p>
                                      <p className="text-sm text-[var(--text-muted)]">
                                        {restaurant.contact_email}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge variant="outline">
                                      {restaurant.plan_name || 'Free'}
                                    </Badge>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge
                                      variant={
                                        restaurant.subscription_status === 'ACTIVE'
                                          ? 'default'
                                          : 'secondary'
                                      }
                                    >
                                      {restaurant.subscription_status || 'NONE'}
                                    </Badge>
                                  </td>
                                  <td className="py-3 px-4 text-[var(--text-muted)]">
                                    {restaurant.orders_last_30d || 0}
                                  </td>
                                  <td className="py-3 px-4 text-[var(--text-muted)]">
                                    {formatCurrency(restaurant.total_spent)}
                                  </td>
                                  <td className="py-3 px-4 flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      title="View as this restaurant"
                                      onClick={async () => {
                                        try {
                                          await startImpersonation({
                                            tenantId: restaurant.id,
                                            tenantType: 'RESTAURANT',
                                          }).unwrap()
                                          toast.success(`Impersonating ${restaurant.name}`)
                                          window.location.reload()
                                        } catch (e: any) {
                                          toast.error(
                                            e?.data?.error?.message ||
                                              'Failed to start impersonation'
                                          )
                                        }
                                      }}
                                    >
                                      <UserCog className="h-4 w-4 mr-1" />
                                      Impersonate
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      title="Change plan"
                                      onClick={() => {
                                        const subId = (restaurant as { subscription_id?: string })
                                          .subscription_id
                                        if (!subId) {
                                          toast.error(
                                            'No active subscription for this restaurant. Assign a plan from the Subscriptions tab.'
                                          )
                                          return
                                        }
                                        openChangePlanModal({
                                          id: subId,
                                          tenant_type: 'RESTAURANT',
                                          tenant_name: restaurant.name,
                                        })
                                      }}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const subId = (restaurant as { subscription_id?: string })
                                          .subscription_id
                                        if (!subId) {
                                          toast.error(
                                            'No active subscription for this restaurant. Assign a plan from the Subscriptions tab.'
                                          )
                                          return
                                        }
                                        openChangePlanModal({
                                          id: subId,
                                          tenant_type: 'RESTAURANT',
                                          tenant_name: restaurant.name,
                                        })
                                      }}
                                    >
                                      Change plan
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )
          })()}
        </TabsContent>

        <TabsContent value="usage" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-[var(--text)]">
              {initialTab === 'suppliers'
                ? 'Supplier Usage & Quotas'
                : initialTab === 'restaurants'
                  ? 'Restaurant Usage & Quotas'
                  : 'Usage & Quotas'}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              Monitor tenant resource usage against plan limits
            </p>
          </div>

          {/* Supplier-specific Usage View */}
          {initialTab === 'suppliers' && (
            <>
              <Card>
                <CardHeader>
                  <h3 className="text-xl font-bold text-[var(--text)]">Supplier Usage Overview</h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Product and warehouse usage across all suppliers
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Total Products</span>
                        <Package className="h-4 w-4 text-[var(--brand-mid)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {suppliersData?.suppliers?.reduce(
                          (sum, s) => sum + parseInt(s.product_count || 0),
                          0
                        ) || 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">Across all suppliers</p>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Active Suppliers</span>
                        <Building2 className="h-4 w-4 text-[var(--mint)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {suppliersData?.suppliers?.length || 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">With active subscriptions</p>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Over Limit</span>
                        <AlertCircle className="h-4 w-4 text-[var(--red)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {suppliersData?.suppliers?.filter((s) => {
                          const limit =
                            s.plan_name === 'Free' ? 50 : s.plan_name === 'Bronze' ? 1000 : 10000
                          return parseInt(s.product_count || 0) > limit
                        }).length || 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">Suppliers over product limit</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h3 className="text-xl font-bold text-[var(--text)]">Products by Supplier</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {suppliersData?.suppliers?.slice(0, 10).map((supplier: any) => {
                      const limit =
                        supplier.plan_name === 'Free'
                          ? 50
                          : supplier.plan_name === 'Bronze'
                            ? 1000
                            : 10000
                      const productCount = parseInt(supplier.product_count || 0)
                      const usage = (productCount / limit) * 100
                      return (
                        <div key={supplier.id} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{supplier.name}</span>
                            <span className={productCount > limit ? 'text-[var(--red)]' : ''}>
                              {productCount} / {limit}
                            </span>
                          </div>
                          <div className="h-2 bg-[var(--app-border-mid)] rounded-full overflow-hidden">
                            <div
                              className={`h-full ${productCount > limit ? 'bg-[var(--red)]' : 'bg-[var(--brand-mid)]'}`}
                              style={{ width: `${Math.min(usage, 100)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Restaurant-specific Usage View */}
          {initialTab === 'restaurants' && (
            <>
              <Card>
                <CardHeader>
                  <h3 className="text-xl font-bold text-[var(--text)]">Restaurant Usage Overview</h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Orders and spending across all restaurants
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">30-Day Orders</span>
                        <TrendingUp className="h-4 w-4 text-[var(--brand-mid)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {restaurantsData?.restaurants?.reduce(
                          (sum, r) => sum + parseInt(r.orders_last_30d || 0),
                          0
                        ) || 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">Total orders last 30 days</p>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Active Restaurants</span>
                        <Users className="h-4 w-4 text-[var(--mint)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {restaurantsData?.restaurants?.length || 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">With active subscriptions</p>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Total Spent (30d)</span>
                        <DollarSign className="h-4 w-4 text-[var(--mint)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {formatCurrency(
                          restaurantsData?.restaurants?.reduce(
                            (sum, r) => sum + parseFloat(r.total_spent || 0),
                            0
                          )
                        )}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">Across all restaurants</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h3 className="text-xl font-bold text-[var(--text)]">Orders by Restaurant</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {restaurantsData?.restaurants?.slice(0, 10).map((restaurant: any) => {
                      const dailyLimit =
                        restaurant.plan_name === 'Free'
                          ? 10
                          : restaurant.plan_name === 'Bronze'
                            ? 100
                            : restaurant.plan_name === 'Gold'
                              ? 500
                              : -1
                      return (
                        <div key={restaurant.id} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{restaurant.name}</span>
                            <span>{restaurant.orders_last_30d || 0} orders</span>
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            Daily limit: {dailyLimit === -1 ? 'Unlimited' : `${dailyLimit}/day`}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Default Usage view when on main Admin Dashboard (not Supplier/Restaurant Admin) */}
          {initialTab !== 'suppliers' && initialTab !== 'restaurants' && (
            <>
              <Card>
                <CardHeader>
                  <h3 className="text-xl font-bold text-[var(--text)]">Platform usage overview</h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Aggregated usage across all suppliers and restaurants. Use Supplier Admin or
                    Restaurant Admin for per-tenant detail.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Suppliers</span>
                        <Building2 className="h-4 w-4 text-[var(--brand-mid)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {suppliersData?.suppliers?.length ?? 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Total products:{' '}
                        {suppliersData?.suppliers?.reduce(
                          (sum, s) => sum + parseInt(s.product_count || 0),
                          0
                        ) ?? 0}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Restaurants</span>
                        <Users className="h-4 w-4 text-[var(--mint)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {restaurantsData?.restaurants?.length ?? 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        30-day orders:{' '}
                        {restaurantsData?.restaurants?.reduce(
                          (sum, r) => sum + parseInt(r.orders_last_30d || 0),
                          0
                        ) ?? 0}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Suppliers over limit</span>
                        <AlertCircle className="h-4 w-4 text-[var(--red)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {suppliersData?.suppliers?.filter((s) => {
                          const limit =
                            s.plan_name === 'Free' ? 50 : s.plan_name === 'Bronze' ? 1000 : 10000
                          return parseInt(s.product_count || 0) > limit
                        }).length ?? 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">Product limit exceeded</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Restaurant spend (30d)</span>
                        <DollarSign className="h-4 w-4 text-[var(--mint)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {formatCurrency(
                          restaurantsData?.restaurants?.reduce(
                            (sum, r) => sum + parseFloat(r.total_spent || 0),
                            0
                          )
                        )}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">Across all restaurants</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {(suppliersLoading || restaurantsLoading) && (
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading usage data…
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="features">
          <AdminFeatureFlagsPanel
            restaurants={(restaurantsData?.restaurants ?? []).map((r: { id: string; name: string }) => ({
              id: r.id,
              name: r.name,
            }))}
            suppliers={(suppliersData?.suppliers ?? []).map((s: { id: string; name: string }) => ({
              id: s.id,
              name: s.name,
            }))}
          />
        </TabsContent>

        <TabsContent value="audit">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-[var(--text)]">Audit Logs</h2>
          </div>

          {auditLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <div className="space-y-4">
              {auditLogsData?.logs?.map((log) => (
                <Card key={log.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-[var(--text)]">{log.action_type}</p>
                        <Badge variant="outline">{log.target_entity_type}</Badge>
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">{log.action_description}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        By {log.admin_name} at {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Change plan preview modal (portal) */}
      {changePlanModal?.open && (
        <Dialog
          open={changePlanModal.open}
          onOpenChange={(open) => !open && setChangePlanModal(null)}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Change plan — {changePlanModal.tenantName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Target plan</Label>
                <select
                  className="w-full rounded-md border border-[var(--app-border-mid)] px-3 py-2 mt-1"
                  value={changePlanModal.targetPlanId}
                  onChange={(e) =>
                    setChangePlanModal((m) => m && { ...m, targetPlanId: e.target.value })
                  }
                >
                  <option value="">Select plan</option>
                  {plans
                    .filter((p) => p.tenant_type === changePlanModal.tenantType)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                </select>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={runPreviewPlanChange}
                disabled={!changePlanModal.targetPlanId}
              >
                Preview impact
              </Button>
              {changePlanPreview && (
                <div className="border rounded-lg p-4 space-y-3 text-sm">
                  {!hasPreviewContent(changePlanPreview) && (
                    <p className="text-[var(--text-muted)]">
                      No impact: usage is within target plan limits; no feature changes.
                    </p>
                  )}
                  {(changePlanPreview.willExceed?.length ?? 0) > 0 && (
                    <div>
                      <p className="font-semibold text-amber-700">Usage would exceed limits:</p>
                      <ul className="list-disc pl-4 mt-1">
                        {changePlanPreview.willExceed!.map((e) => (
                          <li key={e.limitKey}>
                            {e.limitKey}: {e.usage} &gt; {e.limit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {((changePlanPreview.featureDiff?.enabled?.length ?? 0) > 0 ||
                    (changePlanPreview.featureDiff?.disabled?.length ?? 0) > 0) && (
                    <div>
                      <p className="font-semibold text-[var(--text-mid)]">Feature changes:</p>
                      {(changePlanPreview.featureDiff?.enabled?.length ?? 0) > 0 && (
                        <p className="text-[var(--mint)]">
                          Enabled: {changePlanPreview.featureDiff!.enabled!.join(', ')}
                        </p>
                      )}
                      {(changePlanPreview.featureDiff?.disabled?.length ?? 0) > 0 && (
                        <p className="text-amber-600">
                          Disabled: {changePlanPreview.featureDiff!.disabled!.join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                  {(changePlanPreview.recommendedActions?.length ?? 0) > 0 && (
                    <p className="text-[var(--text-muted)]">
                      {changePlanPreview.recommendedActions!.join(' ')}
                    </p>
                  )}
                  {(changePlanPreview.willExceed?.length ?? 0) > 0 && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={changePlanForce}
                        onChange={(e) => setChangePlanForce(e.target.checked)}
                      />
                      <span>Force change anyway (allow exceedance)</span>
                    </label>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setChangePlanModal(null)}>
                  Cancel
                </Button>
                <Button onClick={applyPlanChange} disabled={!changePlanModal.targetPlanId}>
                  Apply change
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
