import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  api,
  useGetAdminOverviewQuery,
  useGetAdminConversionStatsQuery,
  useGetAdminPlansQuery,
  useGetAdminSubscriptionsQuery,
  useGetAdminAuditLogsQuery,
  useGetAdminActivityQuery,
  useUpdateAdminPlanMutation,
  useUpdateAdminSubscriptionMutation,
  useCreateAdminPlanMutation,
  usePreviewSubscriptionPlanChangeMutation,
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
  useStartImpersonationMutation,
  useUnlockAdminSubscriptionMutation,
} from '../services/api'
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
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Shield,
  Activity,
  CreditCard,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Filter,
  ShoppingCart,
  MessageSquare,
  Calendar,
  Store,
  ListOrdered,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { SubscriptionPlan } from '../types'
import { getPlanSubtitle, getFeatureLabel, formatPlanFeatureCell } from '../lib/planComparison'
import { formatCurrency } from '../utils/format'
import { AdminFeatureFlagsPanel } from '../components/admin/AdminFeatureFlagsPanel'
import { AdminDealsPanel } from '../components/admin/AdminDealsPanel'
import { AdminLimitOverridesPanel } from '../components/admin/AdminLimitOverridesPanel'

interface AdminDashboardPageProps {
  initialTab?: string
}

export function AdminDashboardPage({ initialTab = 'overview' }: AdminDashboardPageProps) {
  // Default to 'tenants' tab for supplier/restaurant admin views, otherwise use initialTab
  const defaultTab =
    initialTab === 'suppliers' || initialTab === 'restaurants'
      ? 'tenants'
      : initialTab || 'overview'
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

  // Deduplicate plans by (code, tenant_type), exclude enterprise
  const plans =
    plansData?.plans?.filter(
      (p, i, arr) =>
        (p.code || '').toLowerCase() !== 'enterprise' &&
        arr.findIndex(
          (x) =>
            x.code === p.code && (x.tenant_type || 'RESTAURANT') === (p.tenant_type || 'RESTAURANT')
        ) === i
    ) ?? []
  const subscriptions =
    subscriptionsData?.subscriptions?.filter(
      (s, i, arr) =>
        arr.findIndex((x) => x.tenant_id === s.tenant_id && x.tenant_type === s.tenant_type) === i
    ) ?? []
  const [auditActionType, setAuditActionType] = useState('all')
  const [auditDateFrom, setAuditDateFrom] = useState('')
  const [auditDateTo, setAuditDateTo] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditExpandedId, setAuditExpandedId] = useState<string | null>(null)
  const auditPageSize = 20

  const {
    data: auditLogsData,
    isLoading: auditLoading,
    refetch: refetchAudit,
  } = useGetAdminAuditLogsQuery({
    limit: auditPageSize,
    offset: auditOffset,
    ...(auditActionType !== 'all' && { actionType: auditActionType }),
    ...(auditDateFrom && { dateFrom: auditDateFrom }),
    ...(auditDateTo && { dateTo: auditDateTo }),
    ...(auditSearch && { search: auditSearch }),
  })
  const [activityType, setActivityType] = useState('all')
  const [activityOffset, setActivityOffset] = useState(0)
  const activityPageSize = 30
  const {
    data: activityData,
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useGetAdminActivityQuery({
    limit: activityPageSize,
    offset: activityOffset,
    ...(activityType !== 'all' && { type: activityType }),
  })

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
  const [unlockSubscription, { isLoading: isUnlocking }] = useUnlockAdminSubscriptionMutation()

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
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">Admin Panel</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Platform management · subscriptions · tenants · billing
          </p>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <div className="overflow-x-auto mb-1">
          <TabsList
            className={
              initialTab === 'suppliers' || initialTab === 'restaurants'
                ? 'grid grid-cols-3 min-w-max'
                : 'flex w-max gap-0'
            }
          >
            {initialTab !== 'suppliers' && initialTab !== 'restaurants' && (
              <>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="tenants">Tenants</TabsTrigger>
                <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
                <TabsTrigger value="plans">Plans</TabsTrigger>
                <TabsTrigger value="finance">Finance</TabsTrigger>
                <TabsTrigger value="usage">Usage</TabsTrigger>
                <TabsTrigger value="features">Features</TabsTrigger>
                <TabsTrigger value="deals">Deals</TabsTrigger>
                <TabsTrigger value="limits">Limits</TabsTrigger>
                <TabsTrigger value="health">Health</TabsTrigger>
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
        </div>

        <TabsContent value="overview" className="space-y-5">
          {overviewLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <>
              {/* Alerts banner — only visible if there are issues */}
              {((overview?.alerts?.pastDueSubscriptions || 0) > 0 ||
                (overview?.alerts?.trialsExpiringSoon || 0) > 0) && (
                <div className="flex flex-wrap gap-3">
                  {(overview?.alerts?.pastDueSubscriptions || 0) > 0 && (
                    <div
                      className="flex items-center gap-2 rounded-lg px-4 py-2.5"
                      style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
                    >
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-red-700">
                        {overview.alerts.pastDueSubscriptions} past-due subscription
                        {overview.alerts.pastDueSubscriptions > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  {(overview?.alerts?.trialsExpiringSoon || 0) > 0 && (
                    <div
                      className="flex items-center gap-2 rounded-lg px-4 py-2.5"
                      style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
                    >
                      <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-amber-700">
                        {overview.alerts.trialsExpiringSoon} trial
                        {overview.alerts.trialsExpiringSoon > 1 ? 's' : ''} expiring in 7 days
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Row 1 — Orders & Activity */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                  Orders & Activity
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--brand-ultra)' }}>
                        <ListOrdered className="h-4 w-4" style={{ color: 'var(--brand)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">
                        Orders Today
                      </span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {overview?.orders?.today ?? 0}
                    </p>
                    <div className="flex gap-3 mt-2 text-xs text-[var(--text-muted)]">
                      <span>{overview?.orders?.week ?? 0} this week</span>
                      <span>·</span>
                      <span>{overview?.orders?.month ?? 0} this month</span>
                    </div>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--brand-ultra)' }}>
                        <ShoppingCart className="h-4 w-4" style={{ color: 'var(--brand)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">
                        Active Carts
                      </span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {overview?.activeCarts ?? 0}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-2">Draft orders with items</p>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--mint-pale)' }}>
                        <MessageSquare className="h-4 w-4" style={{ color: 'var(--mint)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">
                        Chats (24h)
                      </span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {overview?.chatsLast24h ?? 0}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-2">Messages sent</p>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--brand-ultra)' }}>
                        <Users className="h-4 w-4" style={{ color: 'var(--brand)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">
                        Active Staff
                      </span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {overview?.totalActiveStaff ?? 0}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-2">Across all tenants</p>
                  </Card>
                </div>
              </div>

              {/* Row 2 — Reservations & Catalog */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                  Reservations & Catalog
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--mint-pale)' }}>
                        <Calendar className="h-4 w-4" style={{ color: 'var(--mint)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">
                        Reservations Today
                      </span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {overview?.reservations?.today ?? 0}
                    </p>
                    <div className="flex gap-3 mt-2 text-xs text-[var(--text-muted)]">
                      <span>{overview?.reservations?.week ?? 0} this week</span>
                      <span>·</span>
                      <span>{overview?.reservations?.confirmed ?? 0} confirmed</span>
                    </div>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--brand-ultra)' }}>
                        <Package className="h-4 w-4" style={{ color: 'var(--brand)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">
                        Active Products
                      </span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {overview?.totalActiveProducts ?? 0}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-2">Across all suppliers</p>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--brand-ultra)' }}>
                        <ListOrdered className="h-4 w-4" style={{ color: 'var(--brand)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">
                        Quick Lists
                      </span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {overview?.totalQuickLists ?? 0}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-2">Saved ordering lists</p>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--brand-ultra)' }}>
                        <Activity className="h-4 w-4" style={{ color: 'var(--brand)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">
                        Orders Total
                      </span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {overview?.orders?.total ?? 0}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-2">All time (non-draft)</p>
                  </Card>
                </div>
              </div>

              {/* Row 3 — Tenants & Revenue */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                  Tenants & Revenue
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--brand-ultra)' }}>
                        <Building2 className="h-4 w-4" style={{ color: 'var(--brand)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">
                        Suppliers
                      </span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {overview?.tenants?.totalSuppliers ?? 0}
                    </p>
                    {(overview?.tenants?.newSuppliers7d || 0) > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <ArrowUpRight className="h-3 w-3" style={{ color: 'var(--mint)' }} />
                        <span className="text-xs font-semibold" style={{ color: 'var(--mint)' }}>
                          +{overview.tenants.newSuppliers7d} this week
                        </span>
                      </div>
                    )}
                    {!overview?.tenants?.newSuppliers7d && (
                      <p className="text-xs text-[var(--text-muted)] mt-2">No new this week</p>
                    )}
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--mint-pale)' }}>
                        <Store className="h-4 w-4" style={{ color: 'var(--mint)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">
                        Restaurants
                      </span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {overview?.tenants?.totalRestaurants ?? 0}
                    </p>
                    {(overview?.tenants?.newRestaurants7d || 0) > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <ArrowUpRight className="h-3 w-3" style={{ color: 'var(--mint)' }} />
                        <span className="text-xs font-semibold" style={{ color: 'var(--mint)' }}>
                          +{overview.tenants.newRestaurants7d} this week
                        </span>
                      </div>
                    )}
                    {!overview?.tenants?.newRestaurants7d && (
                      <p className="text-xs text-[var(--text-muted)] mt-2">No new this week</p>
                    )}
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--mint-pale)' }}>
                        <DollarSign className="h-4 w-4" style={{ color: 'var(--mint)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">MRR</span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {formatCurrency(overview?.revenue?.mrr)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      ARR: {formatCurrency(overview?.revenue?.arr)}
                    </p>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg p-2" style={{ background: 'var(--brand-ultra)' }}>
                        <CreditCard className="h-4 w-4" style={{ color: 'var(--brand)' }} />
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-medium">
                        Active Subs
                      </span>
                    </div>
                    <p className="text-3xl font-black text-[var(--text)]">
                      {(overview?.subscriptionStats as any)?.ACTIVE || 0}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      {(overview?.subscriptionStats as any)?.TRIALING || 0} trialing
                      {((overview?.subscriptionStats as any)?.PAST_DUE || 0) > 0 && (
                        <span className="text-red-500 ml-2">
                          · {(overview?.subscriptionStats as any)?.PAST_DUE} past due
                        </span>
                      )}
                    </p>
                  </Card>
                </div>
              </div>

              {/* Subscription breakdown */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-[var(--text)] mb-4">
                  Subscription Status Breakdown
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    {
                      status: 'ACTIVE',
                      icon: CheckCircle2,
                      color: 'var(--mint)',
                      bg: 'var(--mint-pale)',
                    },
                    {
                      status: 'TRIALING',
                      icon: Clock,
                      color: 'var(--brand)',
                      bg: 'var(--brand-ultra)',
                    },
                    { status: 'PAST_DUE', icon: AlertCircle, color: '#ef4444', bg: '#fef2f2' },
                    { status: 'SUSPENDED', icon: PauseCircle, color: '#f59e0b', bg: '#fffbeb' },
                    {
                      status: 'CANCELLED',
                      icon: XCircle,
                      color: 'var(--text-muted)',
                      bg: 'var(--surface-mid)',
                    },
                  ].map(({ status, icon: Icon, color, bg }) => (
                    <div
                      key={status}
                      className="flex items-center gap-2 rounded-lg p-3"
                      style={{ background: bg }}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" style={{ color }} />
                      <div>
                        <p className="text-xs font-semibold" style={{ color }}>
                          {status}
                        </p>
                        <p className="text-xl font-black text-[var(--text)]">
                          {String((overview?.subscriptionStats as any)?.[status] || 0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Conversion funnel */}
              {conversionStats && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-[var(--text)]">
                        Conversion Funnel (30d)
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {conversionStats.blocksToUpgradesConversionPercent}% rate
                      </Badge>
                    </div>
                    {(() => {
                      const s30 = conversionStats.funnelDropOff?.['30d']
                      const funnelSteps = [
                        {
                          label: 'Feature / limit blocks',
                          value: Number(conversionStats.totalBlocks),
                        },
                        { label: 'Upgrade modal opens', value: Number(s30?.openUpgrade ?? 0) },
                        { label: 'Upgrade clicked', value: Number(s30?.clickUpgrade ?? 0) },
                        {
                          label: 'Upgrades completed',
                          value: Number(conversionStats.totalUpgrades),
                        },
                      ]
                      const topValue = Math.max(...funnelSteps.map((s) => s.value), 1)
                      return (
                        <div className="space-y-3">
                          {funnelSteps.map(({ label, value }) => (
                            <div key={label}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-[var(--text-muted)]">{label}</span>
                                <span className="font-semibold text-[var(--text)]">{value}</span>
                              </div>
                              <div
                                className="h-1.5 rounded-full overflow-hidden"
                                style={{ background: 'var(--app-border)' }}
                              >
                                <div
                                  className="h-1.5 rounded-full"
                                  style={{
                                    width: `${Math.min(100, Math.round((value / topValue) * 100))}%`,
                                    background: 'var(--brand)',
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                    {(conversionStats.mostBlockedFeature || conversionStats.mostBlockedLimit) && (
                      <div className="mt-4 pt-3 border-t space-y-1">
                        {conversionStats.mostBlockedFeature && (
                          <p className="text-xs text-[var(--text-muted)]">
                            Top blocked feature:{' '}
                            <span className="font-medium text-[var(--text)]">
                              {conversionStats.mostBlockedFeature}
                            </span>
                          </p>
                        )}
                        {conversionStats.mostBlockedLimit && (
                          <p className="text-xs text-[var(--text-muted)]">
                            Top blocked limit:{' '}
                            <span className="font-medium text-[var(--text)]">
                              {conversionStats.mostBlockedLimit}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </Card>

                  {conversionStats.funnelDropOff && (
                    <Card className="p-5">
                      <h3 className="text-sm font-semibold text-[var(--text)] mb-4">
                        7-day vs 30-day Comparison
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 text-[var(--text-muted)] font-medium">
                                Step
                              </th>
                              <th className="text-right py-2 text-[var(--text-muted)] font-medium">
                                7d
                              </th>
                              <th className="text-right py-2 text-[var(--text-muted)] font-medium">
                                30d
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--app-border)]">
                            {[
                              { label: 'Blocked', key: 'blocked' },
                              { label: 'Open upgrade', key: 'openUpgrade' },
                              { label: 'Click upgrade', key: 'clickUpgrade' },
                              { label: 'Upgrade success', key: 'upgradeSuccess' },
                            ].map(({ label, key }) => (
                              <tr key={key}>
                                <td className="py-2 text-[var(--text)]">{label}</td>
                                <td className="py-2 text-right font-semibold text-[var(--text)]">
                                  {(conversionStats.funnelDropOff!['7d'] as any)[key] ?? 0}
                                </td>
                                <td className="py-2 text-right font-semibold text-[var(--text)]">
                                  {(conversionStats.funnelDropOff!['30d'] as any)[key] ?? 0}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </div>
              )}
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
                      {plan.code && (
                        <span className="text-xs text-[var(--text-muted)]">{plan.code}</span>
                      )}
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
                  <div className="space-y-1.5 mb-4">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                      Limits
                    </p>
                    {plan.limits && Object.keys(plan.limits).length > 0 ? (
                      Object.entries(plan.limits).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-[var(--text-muted)]">{key.replace(/_/g, ' ')}</span>
                          <span
                            className={`font-semibold ${value === -1 ? 'text-[var(--mint)]' : 'text-[var(--text)]'}`}
                          >
                            {value === -1 ? '∞ unlimited' : String(value)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">No limits defined</p>
                    )}
                  </div>
                  <div className="space-y-1.5 mb-4">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                      Features
                    </p>
                    {plan.features &&
                    typeof plan.features === 'object' &&
                    Object.keys(plan.features).length > 0 ? (
                      Object.entries(plan.features).map(([key, value]) => {
                        const cell = formatPlanFeatureCell(key, value)
                        return (
                          <div key={key} className="flex justify-between items-center text-xs">
                            <span className="text-[var(--text-muted)]">{getFeatureLabel(key)}</span>
                            {!cell.enabled ? (
                              <span className="text-[var(--text-muted)]">—</span>
                            ) : cell.caption ? (
                              <span className="font-medium text-[var(--brand)] text-right max-w-[120px] truncate">
                                {cell.caption}
                              </span>
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--mint)]" />
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">No features defined</p>
                    )}
                  </div>
                  {plan.updated_at && (
                    <p className="text-xs text-[var(--text-muted)] mb-3">
                      Updated {new Date(plan.updated_at).toLocaleDateString()}
                    </p>
                  )}
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
                    <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                      Created
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((sub) => (
                    <tr
                      key={sub.id}
                      className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
                    >
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
                        <div className="flex flex-wrap gap-2">
                          {(sub.account_locked_at || sub.lock_reason === 'pending_activation') && (
                            <Button
                              size="sm"
                              disabled={isUnlocking}
                              onClick={async () => {
                                try {
                                  await unlockSubscription({
                                    id: sub.id,
                                    reason: 'admin_activation',
                                  }).unwrap()
                                  toast.success('Account activated')
                                } catch {
                                  toast.error('Failed to activate account')
                                }
                              }}
                            >
                              Activate
                            </Button>
                          )}
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="health" className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">System Health</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Platform status, subscription health, upcoming expirations
              </p>
            </div>
          </div>
          {healthLoading || overviewLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <>
              {/* Subscription health */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Active',
                    value: (overview?.subscriptionStats as any)?.ACTIVE ?? 0,
                    color: 'var(--mint)',
                    bg: 'var(--mint-pale)',
                  },
                  {
                    label: 'Trialing',
                    value: (overview?.subscriptionStats as any)?.TRIALING ?? 0,
                    color: 'var(--brand)',
                    bg: 'var(--brand-ultra)',
                  },
                  {
                    label: 'Past Due',
                    value:
                      (overview?.alerts as any)?.pastDueSubscriptions ??
                      (overview?.subscriptionStats as any)?.PAST_DUE ??
                      0,
                    color: '#ef4444',
                    bg: '#fef2f2',
                  },
                  {
                    label: 'Trials expiring (7d)',
                    value: (overview?.alerts as any)?.trialsExpiringSoon ?? 0,
                    color: '#f59e0b',
                    bg: '#fffbeb',
                  },
                ].map(({ label, value, color, bg }) => (
                  <Card key={label} className="p-4">
                    <p className="text-xs font-medium text-[var(--text-muted)] mb-1">{label}</p>
                    <p className="text-2xl font-black" style={{ color }}>
                      {value}
                    </p>
                    <div className="mt-2 h-1 rounded-full" style={{ background: bg }}>
                      <div
                        className="h-1 rounded-full"
                        style={{ width: '100%', background: color + '40' }}
                      />
                    </div>
                  </Card>
                ))}
              </div>

              {/* DB Pool */}
              {healthData?.dbPool && (
                <Card className="p-5">
                  <p className="text-sm font-semibold text-[var(--text)] mb-3">Database Pool</p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    {[
                      { label: 'Total', value: healthData.dbPool.total },
                      { label: 'Idle', value: healthData.dbPool.idle, note: 'available' },
                      {
                        label: 'Waiting',
                        value: healthData.dbPool.waiting,
                        alert: healthData.dbPool.waiting > 0,
                      },
                    ].map(({ label, value, note, alert }) => (
                      <div
                        key={label}
                        className="rounded-lg p-3"
                        style={{ background: alert ? '#fef2f2' : 'var(--surface-mid)' }}
                      >
                        <p
                          className="text-xl font-black"
                          style={{ color: alert ? '#ef4444' : 'var(--text)' }}
                        >
                          {value}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          {label}
                          {note ? ` (${note})` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
                      <span>Pool utilization</span>
                      <span>
                        {healthData.dbPool.total > 0
                          ? Math.round(
                              ((healthData.dbPool.total - healthData.dbPool.idle) /
                                healthData.dbPool.total) *
                                100
                            )
                          : 0}
                        %
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full overflow-hidden"
                      style={{ background: 'var(--app-border)' }}
                    >
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width:
                            healthData.dbPool.total > 0
                              ? `${Math.min(100, Math.round(((healthData.dbPool.total - healthData.dbPool.idle) / healthData.dbPool.total) * 100))}%`
                              : '0%',
                          background: 'var(--brand)',
                        }}
                      />
                    </div>
                  </div>
                </Card>
              )}

              {/* Recent API errors */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-[var(--text)]">Recent API Errors</p>
                  {!healthData?.recentApiErrors?.length && (
                    <span
                      className="flex items-center gap-1 text-xs font-medium"
                      style={{ color: 'var(--mint)' }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> All clear
                    </span>
                  )}
                </div>
                {!healthData?.recentApiErrors?.length ? (
                  <p className="text-sm text-[var(--text-muted)]">No errors logged recently</p>
                ) : (
                  <div className="rounded-lg overflow-hidden border border-[var(--app-border)]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--surface-mid)' }}>
                          <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">
                            Type
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">
                            Source
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">
                            Message
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--app-border)]">
                        {healthData.recentApiErrors.map((e: any, i: number) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-red-500 font-medium">{e.type}</td>
                            <td className="px-3 py-2 text-[var(--text-muted)]">{e.source}</td>
                            <td className="px-3 py-2 text-[var(--text)] max-w-[300px] truncate">
                              {e.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="finance" className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-[var(--text)]">Finance Dashboard</h2>
            <p className="text-sm text-[var(--text-muted)]">
              GMV, recurring revenue, invoices, and top tenants
            </p>
          </div>
          {financeLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <>
              {/* Top KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: 'GMV (all time)',
                    value: financeData?.gmv ?? 0,
                    color: 'var(--brand)',
                    bg: 'var(--brand-ultra)',
                    note: 'Total invoice value',
                  },
                  {
                    label: 'MRR',
                    value: financeData?.mrr ?? 0,
                    color: 'var(--mint)',
                    bg: 'var(--mint-pale)',
                    note: `ARR: ${formatCurrency(financeData?.arr ?? 0)}`,
                  },
                  {
                    label: 'Outstanding',
                    value: financeData?.outstanding ?? 0,
                    color: '#f59e0b',
                    bg: '#fffbeb',
                    note: 'Awaiting payment',
                  },
                  {
                    label: 'Overdue',
                    value: financeData?.overdue ?? 0,
                    color: '#ef4444',
                    bg: '#fef2f2',
                    note: 'Past due date',
                  },
                ].map(({ label, value, color, bg, note }) => (
                  <Card key={label} className="p-5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                      style={{ background: bg }}
                    >
                      <DollarSign className="h-4 w-4" style={{ color }} />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] font-medium mb-1">{label}</p>
                    <p className="text-2xl font-black" style={{ color }}>
                      {formatCurrency(value)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{note}</p>
                  </Card>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                {/* Revenue by plan */}
                <Card className="p-5">
                  <p className="text-sm font-semibold text-[var(--text)] mb-4">Revenue by Plan</p>
                  {!financeData?.revenueByPlan?.length ? (
                    <p className="text-sm text-[var(--text-muted)]">No data</p>
                  ) : (
                    <div className="space-y-3">
                      {(() => {
                        const maxMrr = Math.max(
                          ...financeData.revenueByPlan.map((r: any) => Number(r.mrr) || 0),
                          1
                        )
                        return financeData.revenueByPlan.map((r: any, i: number) => (
                          <div key={i}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-[var(--text)]">{r.planName}</span>
                                <Badge variant="outline" className="text-xs">
                                  {r.tenantType}
                                </Badge>
                                <span className="text-[var(--text-muted)]">
                                  {r.subscriptionCount} subs
                                </span>
                              </div>
                              <span className="font-semibold text-[var(--text)]">
                                {formatCurrency(r.mrr)}
                                <span className="text-[var(--text-muted)] font-normal">/mo</span>
                              </span>
                            </div>
                            <div
                              className="h-1.5 rounded-full overflow-hidden"
                              style={{ background: 'var(--app-border)' }}
                            >
                              <div
                                className="h-1.5 rounded-full"
                                style={{
                                  width: `${Math.min(100, Math.round((Number(r.mrr) / maxMrr) * 100))}%`,
                                  background: 'var(--brand)',
                                }}
                              />
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  )}
                </Card>

                {/* Top tenants by revenue */}
                <Card className="p-5">
                  <p className="text-sm font-semibold text-[var(--text)] mb-4">
                    Top Tenants by Revenue
                  </p>
                  {!financeData?.topTenantsByRevenue?.length ? (
                    <p className="text-sm text-[var(--text-muted)]">No data</p>
                  ) : (
                    <div className="space-y-2">
                      {financeData.topTenantsByRevenue.slice(0, 8).map((t: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm py-1.5 border-b border-[var(--app-border)] last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--text-muted)] w-5">
                              #{i + 1}
                            </span>
                            <span className="text-[var(--text)] truncate max-w-[160px]">
                              {t.tenant_id?.slice(0, 8) ?? '?'}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {t.tenant_type}
                            </Badge>
                          </div>
                          <span className="font-semibold" style={{ color: 'var(--mint)' }}>
                            {formatCurrency(t.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* Overdue tenants */}
              {financeData?.topTenantsByOverdue?.length > 0 && (
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <p className="text-sm font-semibold text-red-700">Overdue Balances</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: '#fef2f2' }}>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-red-700">
                            Tenant
                          </th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-red-700">
                            Type
                          </th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-red-700">
                            Overdue Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {financeData.topTenantsByOverdue.map((t: any, i: number) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-mono text-xs text-[var(--text)]">
                              {t.tenant_id?.slice(0, 8) ?? '?'}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-xs">
                                {t.tenant_type}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-red-600">
                              {formatCurrency(t.overdue_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
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
                        <p className="text-center py-8 text-[var(--text-muted)]">
                          No suppliers found
                        </p>
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
                                      <p className="font-medium text-[var(--text)]">
                                        {supplier.name}
                                      </p>
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
                        <p className="text-center py-8 text-[var(--text-muted)]">
                          No restaurants found
                        </p>
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
                                      <p className="font-medium text-[var(--text)]">
                                        {restaurant.name}
                                      </p>
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
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        With active subscriptions
                      </p>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Over Limit</span>
                        <AlertCircle className="h-4 w-4 text-[var(--red)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {suppliersData?.suppliers?.filter((s) => {
                          const limit =
                            s.plan_name === 'Free'
                              ? 50
                              : s.plan_name === 'Bronze'
                                ? 1000
                                : s.plan_name === 'Platinum'
                                  ? 999999
                                  : 1000
                          return parseInt(s.product_count || 0) > limit
                        }).length || 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Suppliers over product limit
                      </p>
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
                            : supplier.plan_name === 'Platinum'
                              ? 999999
                              : 1000
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
                  <h3 className="text-xl font-bold text-[var(--text)]">
                    Restaurant Usage Overview
                  </h3>
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
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Total orders last 30 days
                      </p>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Active Restaurants</span>
                        <Users className="h-4 w-4 text-[var(--mint)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {restaurantsData?.restaurants?.length || 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        With active subscriptions
                      </p>
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
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Across all restaurants
                      </p>
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
                        <span className="text-sm text-[var(--text-muted)]">
                          Suppliers over limit
                        </span>
                        <AlertCircle className="h-4 w-4 text-[var(--red)]" />
                      </div>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {suppliersData?.suppliers?.filter((s) => {
                          const limit =
                            s.plan_name === 'Free'
                              ? 50
                              : s.plan_name === 'Bronze'
                                ? 1000
                                : s.plan_name === 'Platinum'
                                  ? 999999
                                  : 1000
                          return parseInt(s.product_count || 0) > limit
                        }).length ?? 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Product limit exceeded
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--text-muted)]">
                          Restaurant spend (30d)
                        </span>
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
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Across all restaurants
                      </p>
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
            restaurants={(restaurantsData?.restaurants ?? []).map(
              (r: { id: string; name: string }) => ({
                id: r.id,
                name: r.name,
              })
            )}
            suppliers={(suppliersData?.suppliers ?? []).map((s: { id: string; name: string }) => ({
              id: s.id,
              name: s.name,
            }))}
          />
        </TabsContent>

        <TabsContent value="deals">
          <AdminDealsPanel />
        </TabsContent>

        <TabsContent value="limits">
          <AdminLimitOverridesPanel />
        </TabsContent>

        {/* ─── ACTIVITY FEED ──────────────────────────────────────────── */}
        <TabsContent value="activity">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">Platform Activity</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Real-time stream of orders, registrations, plan changes and more
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-md border border-[var(--app-border-mid)] px-3 py-2 text-sm"
                value={activityType}
                onChange={(e) => {
                  setActivityType(e.target.value)
                  setActivityOffset(0)
                }}
              >
                <option value="all">All events</option>
                <option value="order_placed">Order placed</option>
                <option value="order_confirmed">Order confirmed</option>
                <option value="cart_updated">Cart updated</option>
                <option value="new_tenant">New registration</option>
                <option value="plan_changed">Plan changed</option>
                <option value="subscription_status">Subscription status</option>
                <option value="staff_added">Staff added</option>
                <option value="reservation">Reservation</option>
                <option value="invoice_issued">Invoice issued</option>
                <option value="payment_received">Payment received</option>
                <option value="quick_list">Quick list</option>
                <option value="receiving">Receiving</option>
                <option value="chat_started">Chat started</option>
              </select>
              <Button variant="outline" size="sm" onClick={() => refetchActivity()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {activityLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : !activityData?.events?.length ? (
            <div className="text-center py-16 text-[var(--text-muted)]">
              <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs mt-1">
                Events will appear as orders are placed, tenants register, and plans change
              </p>
            </div>
          ) : (
            <>
              {/* Count */}
              <p className="text-xs text-[var(--text-muted)] mb-4">
                {activityData.total ?? activityData.events.length} total events
              </p>

              <div className="relative">
                {/* Timeline line */}
                <div
                  className="absolute left-5 top-0 bottom-0 w-px"
                  style={{ background: 'var(--app-border)' }}
                />

                <div className="space-y-0">
                  {activityData.events.map((event: any, idx: number) => {
                    const eventConfig: Record<
                      string,
                      { icon: any; color: string; bg: string; label: string }
                    > = {
                      order_placed: {
                        icon: Package,
                        color: 'var(--brand)',
                        bg: 'var(--brand-ultra)',
                        label: 'Order',
                      },
                      new_tenant: {
                        icon: Users,
                        color: 'var(--mint)',
                        bg: 'var(--mint-pale)',
                        label: 'New Tenant',
                      },
                      plan_changed: {
                        icon: CreditCard,
                        color: '#8b5cf6',
                        bg: '#ede9fe',
                        label: 'Plan Change',
                      },
                      subscription_status: {
                        icon: Shield,
                        color: '#f59e0b',
                        bg: '#fffbeb',
                        label: 'Subscription',
                      },
                    }
                    const cfg = eventConfig[event.event_type] ?? {
                      icon: Activity,
                      color: 'var(--text-muted)',
                      bg: 'var(--surface-mid)',
                      label: event.event_type,
                    }
                    const Icon = cfg.icon
                    const timeStr = new Date(event.occurred_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                    const prevEvent = idx > 0 ? activityData.events[idx - 1] : null
                    const showDateDivider =
                      !prevEvent ||
                      new Date(prevEvent.occurred_at).toDateString() !==
                        new Date(event.occurred_at).toDateString()

                    return (
                      <React.Fragment key={`${event.event_type}-${event.id}-${idx}`}>
                        {showDateDivider && (
                          <div className="flex items-center gap-3 py-3 ml-10">
                            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                              {new Date(event.occurred_at).toLocaleDateString('en-GB', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'long',
                              })}
                            </span>
                            <div
                              className="flex-1 h-px"
                              style={{ background: 'var(--app-border)' }}
                            />
                          </div>
                        )}
                        <div className="flex items-start gap-4 py-2.5 group">
                          {/* Icon on timeline */}
                          <div
                            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center z-10 border-2"
                            style={{ background: cfg.bg, borderColor: cfg.color + '40' }}
                          >
                            <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                          </div>

                          {/* Content */}
                          <div
                            className="flex-1 min-w-0 pb-2.5"
                            style={{ borderBottom: '1px solid var(--app-border)' }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                                    style={{ background: cfg.bg, color: cfg.color }}
                                  >
                                    {cfg.label}
                                  </span>
                                  <span className="text-sm font-semibold text-[var(--text)] truncate">
                                    {event.title}
                                  </span>
                                </div>
                                {event.subtitle && (
                                  <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                                    {event.subtitle}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                {event.amount != null && event.amount > 0 && (
                                  <span
                                    className="text-sm font-semibold"
                                    style={{ color: 'var(--mint)' }}
                                  >
                                    {formatCurrency(event.amount)}
                                  </span>
                                )}
                                <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                                  {timeStr}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>

              {/* Pagination */}
              {(activityData.total ?? 0) > activityPageSize && (
                <div className="flex items-center justify-between mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={activityOffset === 0}
                    onClick={() =>
                      setActivityOffset(Math.max(0, activityOffset - activityPageSize))
                    }
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-[var(--text-muted)]">
                    Page {Math.floor(activityOffset / activityPageSize) + 1} of{' '}
                    {Math.ceil((activityData.total ?? 0) / activityPageSize)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={activityOffset + activityPageSize >= (activityData.total ?? 0)}
                    onClick={() => setActivityOffset(activityOffset + activityPageSize)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ─── AUDIT LOGS ─────────────────────────────────────────────── */}
        <TabsContent value="audit">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-5">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
              <Input
                className="pl-9"
                placeholder="Search action, admin, description…"
                value={auditSearch}
                onChange={(e) => {
                  setAuditSearch(e.target.value)
                  setAuditOffset(0)
                }}
              />
            </div>
            <select
              className="rounded-md border border-[var(--app-border-mid)] px-3 py-2 text-sm min-w-[160px]"
              value={auditActionType}
              onChange={(e) => {
                setAuditActionType(e.target.value)
                setAuditOffset(0)
              }}
            >
              <option value="all">All action types</option>
              {auditLogsData?.actionTypes?.map((t: string) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="w-36 text-sm"
                value={auditDateFrom}
                onChange={(e) => {
                  setAuditDateFrom(e.target.value)
                  setAuditOffset(0)
                }}
              />
              <span className="text-[var(--text-muted)] text-sm">to</span>
              <Input
                type="date"
                className="w-36 text-sm"
                value={auditDateTo}
                onChange={(e) => {
                  setAuditDateTo(e.target.value)
                  setAuditOffset(0)
                }}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchAudit()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Results count */}
          {!auditLoading && auditLogsData && (
            <p className="text-sm text-[var(--text-muted)] mb-3">
              {auditLogsData.total ?? auditLogsData.logs?.length ?? 0} total entries
              {auditOffset > 0 &&
                ` · showing ${auditOffset + 1}–${Math.min(auditOffset + auditPageSize, auditLogsData.total ?? 0)}`}
            </p>
          )}

          {auditLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : !auditLogsData?.logs?.length ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No audit logs match your filters</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-[var(--app-border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--surface-mid)' }}>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                        Action
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide hidden md:table-cell">
                        Target
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide hidden lg:table-cell">
                        Description
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                        Admin
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                        Time
                      </th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--app-border)]">
                    {auditLogsData.logs.map((log: any) => {
                      const isExpanded = auditExpandedId === log.id
                      const actionCategory = log.action_type?.split('.')[0] ?? ''
                      const categoryColor: Record<string, string> = {
                        subscription: 'var(--brand)',
                        plan: 'var(--mint)',
                        impersonation: '#8b5cf6',
                        override: '#f59e0b',
                        feature_flag: '#06b6d4',
                        IMPERSONATION_START: '#8b5cf6',
                        IMPERSONATION_END: '#8b5cf6',
                        REMOVE_OVERRIDE: '#f59e0b',
                      }
                      const color =
                        categoryColor[actionCategory] ||
                        categoryColor[log.action_type] ||
                        'var(--text-muted)'
                      return (
                        <React.Fragment key={log.id}>
                          <tr
                            className="hover:bg-[var(--surface-mid)] cursor-pointer transition-colors"
                            onClick={() => setAuditExpandedId(isExpanded ? null : log.id)}
                          >
                            <td className="px-4 py-3">
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                                style={{ background: color + '18', color }}
                              >
                                {log.action_type}
                              </span>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              {log.target_entity_type && (
                                <Badge variant="outline" className="text-xs">
                                  {log.target_entity_type}
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-[var(--text-muted)] hidden lg:table-cell max-w-[260px]">
                              <span className="truncate block">{log.action_description}</span>
                            </td>
                            <td className="px-4 py-3 text-[var(--text)]">
                              {log.admin_name || '—'}
                            </td>
                            <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                              {new Date(log.created_at).toLocaleDateString()}{' '}
                              <span className="text-xs">
                                {new Date(log.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr
                              key={`${log.id}-detail`}
                              style={{ background: 'var(--surface-mid)' }}
                            >
                              <td colSpan={6} className="px-4 py-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                  {log.action_description && (
                                    <div>
                                      <p className="font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
                                        Description
                                      </p>
                                      <p className="text-[var(--text)]">{log.action_description}</p>
                                    </div>
                                  )}
                                  {log.target_tenant_id && (
                                    <div>
                                      <p className="font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
                                        Tenant
                                      </p>
                                      <p className="text-[var(--text)] font-mono">
                                        {log.target_tenant_type} · {log.target_tenant_id}
                                      </p>
                                    </div>
                                  )}
                                  {log.ip_address && (
                                    <div>
                                      <p className="font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
                                        IP Address
                                      </p>
                                      <p className="text-[var(--text)] font-mono">
                                        {log.ip_address}
                                      </p>
                                    </div>
                                  )}
                                  {(log.old_value || log.new_value) && (
                                    <div className="md:col-span-2">
                                      <p className="font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                                        Change
                                      </p>
                                      <div className="grid grid-cols-2 gap-3">
                                        {log.old_value && (
                                          <div
                                            className="rounded-md p-2"
                                            style={{
                                              background: '#fef2f2',
                                              border: '1px solid #fecaca',
                                            }}
                                          >
                                            <p className="text-red-600 font-semibold mb-1">
                                              Before
                                            </p>
                                            <pre className="whitespace-pre-wrap text-[var(--text)] overflow-auto max-h-32">
                                              {JSON.stringify(log.old_value, null, 2)}
                                            </pre>
                                          </div>
                                        )}
                                        {log.new_value && (
                                          <div
                                            className="rounded-md p-2"
                                            style={{
                                              background: 'var(--mint-pale)',
                                              border: '1px solid var(--mint)',
                                            }}
                                          >
                                            <p
                                              className="font-semibold mb-1"
                                              style={{ color: 'var(--mint)' }}
                                            >
                                              After
                                            </p>
                                            <pre className="whitespace-pre-wrap text-[var(--text)] overflow-auto max-h-32">
                                              {JSON.stringify(log.new_value, null, 2)}
                                            </pre>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                                    <div className="md:col-span-2">
                                      <p className="font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
                                        Metadata
                                      </p>
                                      <pre className="whitespace-pre-wrap text-[var(--text)] text-xs overflow-auto max-h-24">
                                        {JSON.stringify(log.metadata, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {(auditLogsData.total ?? 0) > auditPageSize && (
                <div className="flex items-center justify-between mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={auditOffset === 0}
                    onClick={() => setAuditOffset(Math.max(0, auditOffset - auditPageSize))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-[var(--text-muted)]">
                    Page {Math.floor(auditOffset / auditPageSize) + 1} of{' '}
                    {Math.ceil((auditLogsData.total ?? 0) / auditPageSize)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={auditOffset + auditPageSize >= (auditLogsData.total ?? 0)}
                    onClick={() => setAuditOffset(auditOffset + auditPageSize)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
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
