import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  api,
  useGetAdminOverviewQuery,
  useGetAdminConversionStatsQuery,
  useGetAdminPlansQuery,
  useGetAdminSubscriptionsQuery,
  useGetAdminAuditLogsQuery,
  useGetAdminActivityQuery,
  useGetAdminHealthQuery,
  useGetAdminPlatformSettingsQuery,
  useUpdateAdminPlanMutation,
  useUpdateAdminSubscriptionMutation,
  useCreateAdminPlanMutation,
  usePreviewSubscriptionPlanChangeMutation,
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
  useStartImpersonationMutation,
  useUnlockAdminSubscriptionMutation,
  useExtendAdminFreeTrialMutation,
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
  KeyRound,
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
  Mail,
  MapPin,
  Stethoscope,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { notifyAdminPlanSaveError, notifyAdminPlanSaveSuccess } from '../lib/adminPlanSaveFeedback'
import { getPaidActiveSubscriptionCount, type AdminOverview } from '../lib/adminOverview'
import { getAdminPageHeader } from '../lib/adminPageHeaders'
import { formatPlanPrice } from '../lib/formatPlanPrice'
import type { SubscriptionPlan } from '../types'
import { getPlanSubtitle, getLimitLabel, formatPlanDisplayName } from '../lib/planComparison'
import {
  parsePlanFeaturesJson,
  parsePlanLimitsJson,
  stringifyPlanJson,
} from '../lib/adminPlanJsonParse'
import {
  resolvePlanLimitFromCatalog,
  formatPlanLimitDisplayValue,
} from '../lib/adminPlanLimitLookup'
import { formatCurrency } from '../utils/format'
import { AdminFeatureFlagsPanel } from '../components/admin/AdminFeatureFlagsPanel'
import { AdminDealsPanel } from '../components/admin/AdminDealsPanel'
import { AdminLimitsTab } from '../components/admin/AdminLimitsTab'
import { AdminOverviewExtras } from '../components/admin/AdminOverviewExtras'
import { AdminPortalNav } from '../components/admin/AdminPortalNav'
import { AdminPlatformSettingsPanel } from '../components/admin/AdminPlatformSettingsPanel'
import { AdminPageHeader } from '../components/admin/AdminPageHeader'
import { AdminExecutiveSummary } from '../components/admin/AdminExecutiveSummary'
import { AdminOperationsSnapshot } from '../components/admin/AdminOperationsSnapshot'
import { AdminTenantUsageTable } from '../components/admin/AdminTenantUsageTable'
import { AdminKpiCard } from '../components/admin/AdminKpiCard'
import { AdminSectionHeader } from '../components/admin/adminUi'
import { AdminUsersTab } from '../components/admin/AdminUsersTab'
import { AdminOperationsPanel } from '../components/admin/AdminOperationsPanel'
import { AdminTenantDiagnosticsDrawer } from '../components/admin/AdminTenantDiagnosticsDrawer'
import type { AdminTenantType } from '../lib/adminTenantSearch'
import {
  AdminResetPasswordDialog,
  type AdminResetPasswordTarget,
} from '../components/admin/AdminResetPasswordDialog'
import { usePermissions } from '../hooks/usePermissions'
import { useAppSelector } from '../hooks/redux'

interface AdminDashboardPageProps {
  initialTab?: string
}

export function AdminDashboardPage({ initialTab = 'overview' }: AdminDashboardPageProps) {
  const { can } = usePermissions()
  const { user } = useAppSelector((state) => state.auth)
  const canAdminTab = {
    overview: can('ADMIN_ACCESS'),
    activity: can('ADMIN_ACCESS'),
    tenants: can('ADMIN_TENANTS'),
    users: can('ADMIN_SUPPORT'),
    subscriptions: can('ADMIN_PLANS'),
    plans: can('ADMIN_PLANS'),
    finance: can('ADMIN_FINANCE'),
    usage: can('ADMIN_PLANS'),
    features: can('ADMIN_GROWTH'),
    deals: can('ADMIN_GROWTH'),
    limits: can('ADMIN_PLANS'),
    health: can('ADMIN_ACCESS'),
    operations: can('ADMIN_ACCESS'),
    audit: can('ADMIN_ACCESS'),
  }

  // Default to 'tenants' tab for supplier/restaurant admin views, otherwise use initialTab
  const defaultTab =
    initialTab === 'suppliers' || initialTab === 'restaurants'
      ? 'tenants'
      : initialTab || 'overview'
  const [selectedTab, setSelectedTab] = useState(defaultTab)
  const TENANT_PAGE_SIZE = 50
  const [supplierListOffset, setSupplierListOffset] = useState(0)
  const [restaurantListOffset, setRestaurantListOffset] = useState(0)
  const [accumulatedSuppliers, setAccumulatedSuppliers] = useState<any[]>([])
  const [accumulatedRestaurants, setAccumulatedRestaurants] = useState<any[]>([])

  // Sync selected tab when route changes (e.g. sidebar: Admin Dashboard → Supplier Admin)
  useEffect(() => {
    setSelectedTab(defaultTab)
  }, [defaultTab])

  useEffect(() => {
    const allowed = canAdminTab[selectedTab as keyof typeof canAdminTab]
    if (allowed === false) {
      const fallback =
        (
          ['overview', 'finance', 'tenants', 'users', 'plans', 'subscriptions', 'activity'] as const
        ).find((tab) => canAdminTab[tab]) ?? 'overview'
      setSelectedTab(fallback)
    }
  }, [selectedTab, user?.adminPermissions])
  const [plansTenantFilter, setPlansTenantFilter] = useState<'RESTAURANT' | 'SUPPLIER' | undefined>(
    undefined
  )
  const [changePlanModal, setChangePlanModal] = useState<{
    open: boolean
    subId: string
    tenantType: 'RESTAURANT' | 'SUPPLIER'
    tenantName: string
    targetPlanId: string
  } | null>(null)

  const shouldLoadAdminPlans =
    ['plans', 'subscriptions', 'tenants', 'usage'].includes(selectedTab) ||
    Boolean(changePlanModal?.open)

  const {
    data: overview,
    isLoading: overviewLoading,
    isError: overviewError,
    error: overviewQueryError,
    refetch: refetchOverview,
    isFetching: overviewFetching,
  } = useGetAdminOverviewQuery(undefined, {
    skip: selectedTab !== 'overview' && selectedTab !== 'health' && selectedTab !== 'operations',
  })
  const [overviewLastUpdated, setOverviewLastUpdated] = useState<Date | null>(null)
  const [tenantSearch, setTenantSearch] = useState('')
  const [passwordResetTarget, setPasswordResetTarget] = useState<AdminResetPasswordTarget | null>(
    null
  )
  const [operationsSubTab, setOperationsSubTab] = useState<
    'summary' | 'email' | 'inventory' | 'fulfillment' | 'gps'
  >('summary')
  const [tenantDiag, setTenantDiag] = useState<{
    id: string
    tenantType: AdminTenantType
    name: string
  } | null>(null)

  useEffect(() => {
    if (overview && !overviewLoading) {
      setOverviewLastUpdated(new Date())
    }
  }, [overview, overviewLoading])
  const { data: conversionStats } = useGetAdminConversionStatsQuery(
    { days: 30 },
    { skip: selectedTab !== 'overview' }
  )
  const { data: overviewHealthData } = useGetAdminHealthQuery(undefined, {
    skip: selectedTab !== 'overview',
  })
  const { data: platformSettings } = useGetAdminPlatformSettingsQuery(undefined, {
    skip: selectedTab !== 'plans',
  })
  const { data: plansData, isLoading: plansLoading } = useGetAdminPlansQuery(
    selectedTab === 'plans' && plansTenantFilter ? { tenant_type: plansTenantFilter } : {},
    { skip: !shouldLoadAdminPlans }
  )
  const { data: changePlanPlansData, isLoading: changePlanPlansLoading } = useGetAdminPlansQuery(
    { tenant_type: changePlanModal?.tenantType ?? 'RESTAURANT' },
    { skip: !changePlanModal?.open }
  )
  const { data: subscriptionsData, isLoading: subscriptionsLoading } =
    useGetAdminSubscriptionsQuery(
      {},
      { skip: !['subscriptions', 'plans', 'usage'].includes(selectedTab) }
    )

  const dedupeAdminPlans = (raw: SubscriptionPlan[] | undefined) =>
    raw?.filter(
      (p, i, arr) =>
        (p.code || '').toLowerCase() !== 'enterprise' &&
        arr.findIndex(
          (x) =>
            x.code === p.code && (x.tenant_type || 'RESTAURANT') === (p.tenant_type || 'RESTAURANT')
        ) === i
    ) ?? []

  const plans = dedupeAdminPlans(plansData?.plans)

  const supplierProductLimit = (planCode: string | null | undefined) =>
    resolvePlanLimitFromCatalog(plans, 'SUPPLIER', planCode, 'supplier_products_skus')

  const restaurantOrdersPerDayLimit = (planCode: string | null | undefined) =>
    resolvePlanLimitFromCatalog(plans, 'RESTAURANT', planCode, 'orders_per_day')
  const changePlanPlanOptions = dedupeAdminPlans(changePlanPlansData?.plans).filter(
    (p) => (p.tenant_type || 'RESTAURANT') === changePlanModal?.tenantType
  )
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
  } = useGetAdminAuditLogsQuery(
    {
      limit: auditPageSize,
      offset: auditOffset,
      ...(auditActionType !== 'all' && { actionType: auditActionType }),
      ...(auditDateFrom && { dateFrom: auditDateFrom }),
      ...(auditDateTo && { dateTo: auditDateTo }),
      ...(auditSearch && { search: auditSearch }),
    },
    { skip: selectedTab !== 'audit' }
  )
  const [activityType, setActivityType] = useState('all')
  const [activityOffset, setActivityOffset] = useState(0)
  const activityPageSize = 30
  const {
    data: activityData,
    isLoading: activityLoading,
    isError: activityError,
    error: activityQueryError,
    refetch: refetchActivity,
  } = useGetAdminActivityQuery(
    {
      limit: activityPageSize,
      offset: activityOffset,
      ...(activityType !== 'all' && { type: activityType }),
    },
    { skip: selectedTab !== 'activity' }
  )

  const { data: healthData, isLoading: healthLoading } = (api as any).useGetAdminHealthQuery(
    undefined,
    { skip: selectedTab !== 'health' }
  )
  const {
    data: financeData,
    isLoading: financeLoading,
    isError: financeError,
    error: financeQueryError,
    refetch: refetchFinance,
  } = (api as any).useGetAdminFinancialOverviewQuery(undefined, { skip: selectedTab !== 'finance' })

  // Load tenant data
  const {
    data: suppliersData,
    isLoading: suppliersLoading,
    error: suppliersError,
  } = useGetAdminSuppliersQuery(
    { limit: TENANT_PAGE_SIZE, offset: supplierListOffset },
    {
      skip: !['tenants', 'features', 'usage'].includes(selectedTab),
    }
  )
  const {
    data: restaurantsData,
    isLoading: restaurantsLoading,
    error: restaurantsError,
  } = useGetAdminRestaurantsQuery(
    { limit: TENANT_PAGE_SIZE, offset: restaurantListOffset },
    {
      skip: !['tenants', 'features', 'usage'].includes(selectedTab),
    }
  )

  useEffect(() => {
    if (!suppliersData?.suppliers) return
    setAccumulatedSuppliers((prev) => {
      if (supplierListOffset === 0) return suppliersData.suppliers
      const ids = new Set(prev.map((s) => s.id))
      return [...prev, ...suppliersData.suppliers.filter((s: { id: string }) => !ids.has(s.id))]
    })
  }, [suppliersData, supplierListOffset])

  useEffect(() => {
    if (!restaurantsData?.restaurants) return
    setAccumulatedRestaurants((prev) => {
      if (restaurantListOffset === 0) return restaurantsData.restaurants
      const ids = new Set(prev.map((r) => r.id))
      return [...prev, ...restaurantsData.restaurants.filter((r: { id: string }) => !ids.has(r.id))]
    })
  }, [restaurantsData, restaurantListOffset])

  const suppliersForUi = accumulatedSuppliers.length
    ? accumulatedSuppliers
    : suppliersData?.suppliers
  const restaurantsForUi = accumulatedRestaurants.length
    ? accumulatedRestaurants
    : restaurantsData?.restaurants
  const suppliersTotal = suppliersData?.total ?? suppliersForUi?.length ?? 0
  const restaurantsTotal = restaurantsData?.total ?? restaurantsForUi?.length ?? 0

  const [createPlan] = useCreateAdminPlanMutation()
  const [updatePlan] = useUpdateAdminPlanMutation()
  const [updateSubscription] = useUpdateAdminSubscriptionMutation()
  const [previewPlanChange] = usePreviewSubscriptionPlanChangeMutation()
  const [startImpersonation] = useStartImpersonationMutation()

  const handleStartImpersonation = async (
    tenantId: string,
    tenantType: 'RESTAURANT' | 'SUPPLIER',
    tenantLabel: string,
    acknowledgeSuspended = false
  ) => {
    try {
      const result = await startImpersonation({
        tenantId,
        tenantType,
        acknowledgeSuspended,
      }).unwrap()
      toast.success(`Impersonating ${tenantLabel}`)
      window.location.href = result.redirectTo || '/app/dashboard'
    } catch (err: unknown) {
      const e = err as {
        data?: {
          error?: {
            name?: string
            message?: string
            requiresAcknowledgement?: boolean
          }
        }
      }
      if (
        e?.data?.error?.name === 'TENANT_SUSPENDED' &&
        e?.data?.error?.requiresAcknowledgement &&
        !acknowledgeSuspended
      ) {
        const ok = window.confirm(
          `${e.data.error.message || 'This tenant is suspended or inactive.'}\n\nContinue impersonation for support?`
        )
        if (ok) {
          return handleStartImpersonation(tenantId, tenantType, tenantLabel, true)
        }
        return
      }
      toast.error(e?.data?.error?.message || 'Failed to start impersonation')
    }
  }

  const [unlockSubscription, { isLoading: isUnlocking }] = useUnlockAdminSubscriptionMutation()
  const [extendFreeTrial, { isLoading: isExtendingTrial }] = useExtendAdminFreeTrialMutation()

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
    limitsJson: '{}',
    featuresJson: '{}',
  })
  const [editPlanJsonError, setEditPlanJsonError] = useState<string | null>(null)
  const [confirmEnterpriseActivation, setConfirmEnterpriseActivation] = useState(false)
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
    } catch (e: unknown) {
      notifyAdminPlanSaveError(e)
    }
  }

  const openEditPlanModal = (plan: SubscriptionPlan) => {
    setConfirmEnterpriseActivation(false)
    setEditPlanModal({ open: true, plan })
    setEditPlanForm({
      name: plan.name,
      description: plan.description ?? '',
      pricePerMonth: plan.price_per_month ?? 0,
      pricePerYear: plan.price_per_year ?? 0,
      trialDays: plan.trial_days ?? 0,
      displayOrder: plan.display_order ?? 0,
      isActive: plan.is_active ?? true,
      limitsJson: stringifyPlanJson(plan.limits as Record<string, unknown>),
      featuresJson: stringifyPlanJson(plan.features as Record<string, unknown>),
    })
    setEditPlanJsonError(null)
  }

  const handleSaveEditPlan = async () => {
    if (!editPlanModal?.plan) return
    const plan = editPlanModal.plan
    const isEnterprise = (plan.code || '').toLowerCase() === 'enterprise'
    try {
      let limits: Record<string, unknown>
      let features: Record<string, unknown>
      try {
        limits = parsePlanLimitsJson(editPlanForm.limitsJson)
        features = parsePlanFeaturesJson(editPlanForm.featuresJson)
        setEditPlanJsonError(null)
      } catch (parseErr) {
        const message = parseErr instanceof Error ? parseErr.message : 'Invalid JSON'
        setEditPlanJsonError(message)
        toast.error(message)
        return
      }
      const payload: Record<string, unknown> = {
        ...editPlanForm,
        limits,
        features,
      }
      delete payload.limitsJson
      delete payload.featuresJson
      if (isEnterprise && editPlanForm.isActive) {
        payload.confirmEnterpriseActivation = confirmEnterpriseActivation
      }
      const result = await updatePlan({
        id: plan.id,
        data: payload,
      }).unwrap()
      notifyAdminPlanSaveSuccess(result.plan.name || plan.name, result.validationWarnings)
      setEditPlanModal(null)
      setConfirmEnterpriseActivation(false)
    } catch (e: unknown) {
      notifyAdminPlanSaveError(e)
    }
  }

  const handleUpdatePlan = async (
    id: string,
    data: Record<string, unknown>,
    planLabel?: string
  ) => {
    try {
      const result = await updatePlan({ id, data }).unwrap()
      notifyAdminPlanSaveSuccess(planLabel || result.plan.name || 'Plan', result.validationWarnings)
      return result
    } catch (error) {
      notifyAdminPlanSaveError(error)
      throw error
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
    const selectedPlan = changePlanPlanOptions.find((p) => p.id === changePlanModal.targetPlanId)
    try {
      const result = await updateSubscription({
        id: changePlanModal.subId,
        data: {
          planId: changePlanModal.targetPlanId,
          allowExceedance: changePlanForce,
          ...(changePlanForce
            ? { force: true, reason: 'Admin plan change (usage exceeds target limits)' }
            : {}),
        },
      }).unwrap()
      const planLabel =
        selectedPlan?.name ||
        result.subscription?.plan_name ||
        result.subscription?.plan_code ||
        'selected plan'
      toast.success(
        result.appliedViaOrgBilling
          ? `Plan updated to ${planLabel} (applied to organization billing subscription)`
          : `Plan updated to ${planLabel}`
      )
      setChangePlanModal(null)
      setChangePlanPreview(null)
      setChangePlanForce(false)
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
    <div className="flex min-h-0 flex-1 flex-col" data-testid="admin-dashboard-page">
      <AdminPortalNav />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <AdminPageHeader
          {...getAdminPageHeader(
            initialTab === 'suppliers'
              ? 'suppliers'
              : initialTab === 'restaurants'
                ? 'restaurants'
                : 'platform'
          )}
        />

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <div className="overflow-x-auto mb-1">
            <TabsList className="justify-start min-w-max">
              {initialTab !== 'suppliers' && initialTab !== 'restaurants' && (
                <>
                  {canAdminTab.overview && <TabsTrigger value="overview">Overview</TabsTrigger>}
                  {canAdminTab.activity && <TabsTrigger value="activity">Activity</TabsTrigger>}
                  {canAdminTab.tenants && <TabsTrigger value="tenants">Tenants</TabsTrigger>}
                  {canAdminTab.users && <TabsTrigger value="users">Users</TabsTrigger>}
                  {canAdminTab.subscriptions && (
                    <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
                  )}
                  {canAdminTab.plans && <TabsTrigger value="plans">Plans</TabsTrigger>}
                  {canAdminTab.finance && <TabsTrigger value="finance">Finance</TabsTrigger>}
                  {canAdminTab.usage && <TabsTrigger value="usage">Usage</TabsTrigger>}
                  {canAdminTab.features && <TabsTrigger value="features">Features</TabsTrigger>}
                  {canAdminTab.deals && <TabsTrigger value="deals">Deals & Boosts</TabsTrigger>}
                  {canAdminTab.limits && <TabsTrigger value="limits">Limits</TabsTrigger>}
                  {canAdminTab.operations && (
                    <TabsTrigger value="operations">Operations</TabsTrigger>
                  )}
                  {canAdminTab.health && <TabsTrigger value="health">Health</TabsTrigger>}
                  {canAdminTab.audit && <TabsTrigger value="audit">Audit</TabsTrigger>}
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

          <TabsContent value="overview" className="w-full space-y-5">
            {overviewLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
              </div>
            ) : overviewError ? (
              <Card className="border-red-200 bg-red-50 p-6">
                <div className="flex flex-wrap items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-semibold text-red-900">Could not load dashboard metrics</p>
                    <p className="text-sm text-red-800 mt-1">
                      {(overviewQueryError as { data?: { message?: string } })?.data?.message ||
                        'The overview API request failed. Metrics are not shown as zero to avoid a misleading empty dashboard.'}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchOverview()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </Card>
            ) : (
              <>
                <AdminExecutiveSummary
                  overview={overview as AdminOverview}
                  recentErrorCount={
                    Array.isArray(overviewHealthData?.recentApiErrors)
                      ? overviewHealthData.recentApiErrors.length
                      : 0
                  }
                />

                <AdminOperationsSnapshot
                  overview={overview as AdminOverview}
                  recentErrorCount={
                    Array.isArray(overviewHealthData?.recentApiErrors)
                      ? overviewHealthData.recentApiErrors.length
                      : 0
                  }
                  onNavigateTab={setSelectedTab}
                  onOperationsSubTab={setOperationsSubTab}
                />

                <AdminOverviewExtras
                  overview={overview}
                  onNavigateTab={setSelectedTab}
                  onRefresh={() => refetchOverview()}
                  refreshing={overviewFetching}
                  lastUpdated={overviewLastUpdated}
                  canNavigateTab={(tab) => canAdminTab[tab as keyof typeof canAdminTab] ?? false}
                />

                {/* Tenants & Revenue */}
                <div>
                  <AdminSectionHeader title="Tenants & Revenue" />
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <AdminKpiCard
                      label="Suppliers"
                      value={overview?.tenants?.totalSuppliers ?? 0}
                      description={
                        (overview?.tenants?.newSuppliers7d || 0) > 0
                          ? `+${overview?.tenants?.newSuppliers7d} new this week`
                          : 'No new this week'
                      }
                      icon={Building2}
                      tone="brand"
                    />
                    <AdminKpiCard
                      label="Restaurants"
                      value={overview?.tenants?.totalRestaurants ?? 0}
                      description={
                        (overview?.tenants?.newRestaurants7d || 0) > 0
                          ? `+${overview?.tenants?.newRestaurants7d} new this week`
                          : 'No new this week'
                      }
                      icon={Store}
                      tone="success"
                    />
                    <AdminKpiCard
                      label="MRR"
                      value={formatCurrency(overview?.revenue?.mrr)}
                      description={`ARR: ${formatCurrency(overview?.revenue?.arr)}`}
                      icon={DollarSign}
                      tone="success"
                    />
                    <AdminKpiCard
                      label="Active subs"
                      value={getPaidActiveSubscriptionCount(overview)}
                      description="Paid plans (excl. Free Trial)"
                      icon={CreditCard}
                      tone="brand"
                    />
                  </div>
                </div>

                {/* Subscription breakdown */}
                <Card className="p-4">
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

          <TabsContent value="plans" className="space-y-5">
            <div>
              <AdminSectionHeader
                title="Subscription Defaults"
                description="Platform-wide subscription settings"
              />
              <AdminPlatformSettingsPanel variant="compact" />
            </div>

            <div className="flex flex-wrap justify-between items-center gap-4">
              <h2 className="text-lg font-bold text-[var(--text)]">Subscription Plans</h2>
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
                      <DialogDescription>
                        Add a subscription plan for restaurants or suppliers.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>Code (e.g. free, silver)</Label>
                        <Input
                          value={createPlanForm.code}
                          onChange={(e) =>
                            setCreatePlanForm((s) => ({ ...s, code: e.target.value }))
                          }
                          placeholder="free"
                        />
                      </div>
                      <div>
                        <Label>Name</Label>
                        <Input
                          value={createPlanForm.name}
                          onChange={(e) =>
                            setCreatePlanForm((s) => ({ ...s, name: e.target.value }))
                          }
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                {plans.map((plan) => (
                  <Card key={plan.id} className="p-4 transition-shadow hover:shadow-md">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-base font-bold text-[var(--text)]">{plan.name}</h3>
                        <Badge variant="outline" className="text-[10px]">
                          {plan.tenant_type === 'RESTAURANT' ? 'Restaurant' : 'Supplier'}
                        </Badge>
                        {plan.code?.toLowerCase() === 'free' &&
                          platformSettings?.freeSandboxDays != null && (
                            <Badge variant="secondary" className="text-[10px]">
                              {platformSettings.freeSandboxDays}d trial
                            </Badge>
                          )}
                      </div>
                      <Badge
                        variant={plan.is_active ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {plan.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    {plan.code && getPlanSubtitle(plan.code) ? (
                      <p className="mb-2 text-xs text-[var(--text-muted)]">
                        {getPlanSubtitle(plan.code)}
                      </p>
                    ) : null}
                    <div className="mb-3">
                      <p className="text-lg font-bold text-[var(--text)]">
                        {formatPlanPrice(plan.price_per_month, '/mo')}
                      </p>
                      {plan.price_per_year != null && plan.price_per_year > 0 && (
                        <p className="text-xs text-[var(--text-muted)]">
                          {formatPlanPrice(plan.price_per_year, '/yr')}
                        </p>
                      )}
                    </div>
                    {plan.description && (
                      <p className="mb-3 line-clamp-2 text-xs text-[var(--text-muted)]">
                        {plan.description}
                      </p>
                    )}
                    <div className="mb-3 space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {plan.limits ? Object.keys(plan.limits).length : 0} limits ·{' '}
                        {plan.features ? Object.keys(plan.features).length : 0} features
                      </p>
                      {plan.limits && Object.keys(plan.limits).length > 0 ? (
                        Object.entries(plan.limits)
                          .slice(0, 3)
                          .map(([key, value]) => (
                            <div key={key} className="flex justify-between text-xs">
                              <span className="text-[var(--text-muted)]">{getLimitLabel(key)}</span>
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
                      {(plan.limits && Object.keys(plan.limits).length > 3) ||
                      (plan.features && Object.keys(plan.features).length > 0) ? (
                        <p className="text-[10px] text-[var(--text-muted)]">
                          Edit plan for full details
                        </p>
                      ) : null}
                    </div>
                    {plan.updated_at && (
                      <p className="text-xs text-[var(--text-muted)] mb-3">
                        Updated {new Date(plan.updated_at).toLocaleDateString()}
                      </p>
                    )}
                    <div className="mt-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full whitespace-normal"
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
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Plan</DialogTitle>
                  <DialogDescription>
                    Update pricing, limits, features, trial days, and visibility for this plan.
                  </DialogDescription>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Trial days</Label>
                        <Input
                          type="number"
                          min={editPlanModal.plan.code === 'free' ? 3 : 0}
                          max={editPlanModal.plan.code === 'free' ? 7 : undefined}
                          value={editPlanForm.trialDays}
                          onChange={(e) =>
                            setEditPlanForm((s) => ({
                              ...s,
                              trialDays: Number(e.target.value) || 0,
                            }))
                          }
                        />
                        {editPlanModal.plan.code === 'free' ? (
                          <p className="mt-1 text-xs text-amber-800">
                            Free Trial catalog: trial days must be between 3 and 7.
                          </p>
                        ) : null}
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
                    <div>
                      <Label>Limits (JSON)</Label>
                      <Textarea
                        className="font-mono text-xs min-h-[140px]"
                        value={editPlanForm.limitsJson}
                        onChange={(e) =>
                          setEditPlanForm((s) => ({ ...s, limitsJson: e.target.value }))
                        }
                        spellCheck={false}
                      />
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Use -1 for unlimited. Numbers stay numbers; booleans are not valid limit
                        values.
                      </p>
                    </div>
                    <div>
                      <Label>Features (JSON)</Label>
                      <Textarea
                        className="font-mono text-xs min-h-[180px]"
                        value={editPlanForm.featuresJson}
                        onChange={(e) =>
                          setEditPlanForm((s) => ({ ...s, featuresJson: e.target.value }))
                        }
                        spellCheck={false}
                      />
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        true/false, tier strings (e.g. basic_kpis), or omit keys. Empty strings are
                        rejected.
                      </p>
                    </div>
                    {editPlanJsonError ? (
                      <p className="text-sm text-[var(--red)]">{editPlanJsonError}</p>
                    ) : null}
                    {editPlanModal.plan.code === 'enterprise' && editPlanForm.isActive ? (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                        <p className="font-semibold">Enterprise activation</p>
                        <p className="mt-1 text-amber-900">
                          Enterprise is admin-assigned only. Enabling the catalog row requires
                          explicit confirmation.
                        </p>
                        <label className="mt-2 flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={confirmEnterpriseActivation}
                            onChange={(e) => setConfirmEnterpriseActivation(e.target.checked)}
                            className="rounded border-[var(--app-border-mid)]"
                          />
                          <span>I confirm Enterprise catalog activation</span>
                        </label>
                      </div>
                    ) : null}
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
                      <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                        Tenant
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Plan</th>
                      <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">
                        Status
                      </th>
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
                          <Badge variant="outline">
                            {formatPlanDisplayName(
                              (sub as { plan_code?: string }).plan_code,
                              sub.plan_name
                            )}
                          </Badge>
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
                            {sub.lock_reason === 'free_sandbox_expired' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={isExtendingTrial}
                                onClick={async () => {
                                  try {
                                    await extendFreeTrial({ id: sub.id }).unwrap()
                                    toast.success('Free Trial extended')
                                  } catch {
                                    toast.error('Failed to extend Free Trial')
                                  }
                                }}
                              >
                                Extend trial
                              </Button>
                            )}
                            {(sub.account_locked_at ||
                              sub.lock_reason === 'pending_activation') && (
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

          <TabsContent value="operations" className="space-y-5">
            <AdminOperationsPanel
              initialSubTab={operationsSubTab}
              onNavigateDeals={() => setSelectedTab('deals')}
            />
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
            ) : null}
            {!overviewLoading && overviewError && (
              <Card className="p-6 border-red-200 bg-red-50/50 mb-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[var(--text)]">
                      Subscription health metrics unavailable
                    </p>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      Overview metrics failed to load. Infrastructure checks below may still apply.
                    </p>
                  </div>
                </div>
              </Card>
            )}
            {!overviewLoading && !overviewError && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
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
            )}
            {!healthLoading && (
              <>
                {/* DB Pool */}
                {healthData?.dbPool ? (
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
                ) : (
                  <Card className="p-5">
                    <p className="text-sm font-semibold text-[var(--text)] mb-1">Database Pool</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      Pool metrics not available from this environment.
                    </p>
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
                        <CheckCircle2 className="h-3.5 w-3.5" />{' '}
                        {healthData ? 'No errors in system_event' : 'Health checks limited'}
                      </span>
                    )}
                  </div>
                  {healthData?.emailFailures?.length ? (
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-[var(--text)] mb-2">
                        Email failures (24h)
                      </p>
                      <div className="rounded-lg overflow-hidden border border-[var(--app-border)]">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: 'var(--surface-mid)' }}>
                              <th className="text-left px-3 py-2">Event</th>
                              <th className="text-left px-3 py-2">Recipient</th>
                              <th className="text-left px-3 py-2">Error</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--app-border)]">
                            {healthData.emailFailures.map((e: any, i: number) => (
                              <tr key={e.id || i}>
                                <td className="px-3 py-2">{e.eventType}</td>
                                <td className="px-3 py-2 font-mono">{e.recipientRedacted}</td>
                                <td className="px-3 py-2 truncate max-w-[200px]">
                                  {e.errorMessage || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-2">
                        Job and webhook failure collectors are not configured yet.
                      </p>
                    </div>
                  ) : null}
                  {!healthData?.recentApiErrors?.length ? (
                    <p className="text-sm text-[var(--text-muted)]">
                      {healthData
                        ? 'No errors logged in system_event (requires system_event table). Job/webhook failure tracking is not configured yet.'
                        : 'Health endpoint did not return data.'}
                    </p>
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
            ) : financeError ? (
              <Card className="p-6 border-red-200 bg-red-50/50">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[var(--text)]">Finance data unavailable</p>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      {(financeQueryError as { data?: { message?: string } })?.data?.message ||
                        'The finance API request failed. Figures are not shown as zero to avoid misleading data.'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => refetchFinance()}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <>
                {financeData?.mrrExcludesFreeTrial && (
                  <p className="text-xs text-[var(--text-muted)] -mt-2">
                    MRR and ARR exclude Free Trial and Enterprise plans (paid subscriptions only).
                  </p>
                )}
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
                      note: `ARR: ${formatCurrency(financeData?.arr ?? 0)} · paid plans only`,
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
                                  <span className="font-medium text-[var(--text)]">
                                    {formatPlanDisplayName(r.planCode, r.planName)}
                                  </span>
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

          <TabsContent value="users" className="space-y-6">
            <AdminUsersTab />
          </TabsContent>

          <TabsContent value="tenants" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {initialTab !== 'suppliers' && initialTab !== 'restaurants' ? (
                <AdminSectionHeader
                  title="Tenant directory"
                  description="Manage supplier and restaurant accounts"
                />
              ) : null}
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  className="h-8 pl-8 text-sm"
                  placeholder={
                    initialTab === 'suppliers'
                      ? 'Search suppliers…'
                      : initialTab === 'restaurants'
                        ? 'Search restaurants…'
                        : 'Search suppliers or restaurants…'
                  }
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                />
              </div>
            </div>

            {(() => {
              // Show only suppliers or restaurants based on initialTab
              const showSuppliersOnly = initialTab === 'suppliers'
              const showRestaurantsOnly = initialTab === 'restaurants'
              const q = tenantSearch.trim().toLowerCase()
              const filteredSuppliers =
                suppliersForUi?.filter((s: { name?: string; contact_email?: string }) => {
                  if (!q) return true
                  return (
                    (s.name || '').toLowerCase().includes(q) ||
                    (s.contact_email || '').toLowerCase().includes(q)
                  )
                }) ?? []
              const filteredRestaurants =
                restaurantsForUi?.filter((r: { name?: string; contact_email?: string }) => {
                  if (!q) return true
                  return (
                    (r.name || '').toLowerCase().includes(q) ||
                    (r.contact_email || '').toLowerCase().includes(q)
                  )
                }) ?? []

              return (
                <div className="space-y-4">
                  {showSuppliersOnly && (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <AdminKpiCard
                        label="Suppliers"
                        value={`${suppliersForUi?.length ?? 0} / ${suppliersTotal}`}
                        icon={Building2}
                        tone="brand"
                      />
                      <AdminKpiCard
                        label="Active subs"
                        value={
                          suppliersForUi?.filter(
                            (s: { subscription_status?: string }) =>
                              s.subscription_status === 'ACTIVE' ||
                              s.subscription_status === 'TRIALING'
                          ).length ?? 0
                        }
                        icon={CreditCard}
                        tone="success"
                      />
                      <AdminKpiCard
                        label="Total products"
                        value={
                          suppliersForUi?.reduce(
                            (sum, s) => sum + parseInt(String(s.product_count || 0), 10),
                            0
                          ) ?? 0
                        }
                        icon={Package}
                        tone="neutral"
                      />
                      <AdminKpiCard
                        label="Revenue"
                        value={formatCurrency(
                          suppliersForUi?.reduce(
                            (sum, s) => sum + parseFloat(String(s.total_revenue || 0)),
                            0
                          )
                        )}
                        icon={DollarSign}
                        tone="neutral"
                      />
                    </div>
                  )}
                  {showRestaurantsOnly && (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      <AdminKpiCard
                        label="Restaurants"
                        value={`${restaurantsForUi?.length ?? 0} / ${restaurantsTotal}`}
                        icon={Users}
                        tone="brand"
                      />
                      <AdminKpiCard
                        label="Active subs"
                        value={
                          restaurantsForUi?.filter(
                            (r: { subscription_status?: string }) =>
                              r.subscription_status === 'ACTIVE' ||
                              r.subscription_status === 'TRIALING'
                          ).length ?? 0
                        }
                        icon={CreditCard}
                        tone="success"
                      />
                      <AdminKpiCard
                        label="Orders (30d)"
                        value={
                          restaurantsForUi?.reduce(
                            (sum, r) => sum + parseInt(String(r.orders_last_30d || 0), 10),
                            0
                          ) ?? 0
                        }
                        icon={TrendingUp}
                        tone="neutral"
                      />
                    </div>
                  )}
                  {/* Suppliers Section - Show if not restaurant-only view */}
                  {!showRestaurantsOnly && (
                    <Card>
                      <CardHeader className="px-4 py-3">
                        <h3 className="text-sm font-semibold text-[var(--text)]">Suppliers</h3>
                        <p className="text-sm text-[var(--text-muted)]">
                          Manage supplier tenants and subscriptions
                          {suppliersTotal > 0
                            ? ` (${suppliersForUi?.length ?? 0} of ${suppliersTotal} loaded)`
                            : ''}
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
                        ) : !filteredSuppliers.length ? (
                          <p className="text-center py-8 text-[var(--text-muted)]">
                            {q ? 'No suppliers match your search' : 'No suppliers found'}
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
                                {filteredSuppliers.map((supplier: any) => (
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
                                      <Badge variant="outline">
                                        {formatPlanDisplayName(
                                          (supplier as { plan_code?: string }).plan_code,
                                          supplier.plan_name || 'Free Trial'
                                        )}
                                      </Badge>
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
                                    <td className="py-3 px-4">
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          title="Operational diagnostics"
                                          onClick={() =>
                                            setTenantDiag({
                                              id: supplier.id,
                                              tenantType: 'SUPPLIER',
                                              name: supplier.name,
                                            })
                                          }
                                        >
                                          <Stethoscope className="h-4 w-4 mr-1" />
                                          Diagnostics
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          title="View as this supplier"
                                          onClick={() =>
                                            handleStartImpersonation(
                                              supplier.id,
                                              'SUPPLIER',
                                              supplier.name
                                            )
                                          }
                                        >
                                          <UserCog className="h-4 w-4 mr-1" />
                                          Impersonate
                                        </Button>
                                        {canAdminTab.users && supplier.contact_email && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            title="Reset sign-in password"
                                            onClick={() =>
                                              setPasswordResetTarget({
                                                email: supplier.contact_email,
                                                displayName: supplier.name,
                                              })
                                            }
                                          >
                                            <KeyRound className="h-4 w-4 mr-1" />
                                            Password
                                          </Button>
                                        )}
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
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!suppliersLoading && (suppliersForUi?.length ?? 0) < suppliersTotal && (
                          <div className="mt-4 flex justify-center">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setSupplierListOffset((o) => o + TENANT_PAGE_SIZE)}
                            >
                              Load more suppliers
                            </Button>
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
                          {restaurantsTotal > 0
                            ? ` (${restaurantsForUi?.length ?? 0} of ${restaurantsTotal} loaded)`
                            : ''}
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
                        ) : !filteredRestaurants.length ? (
                          <p className="text-center py-8 text-[var(--text-muted)]">
                            {q ? 'No restaurants match your search' : 'No restaurants found'}
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
                                {filteredRestaurants.map((restaurant: any) => (
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
                                        {formatPlanDisplayName(
                                          (restaurant as { plan_code?: string }).plan_code,
                                          restaurant.plan_name || 'Free Trial'
                                        )}
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
                                    <td className="py-3 px-4">
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          title="Operational diagnostics"
                                          onClick={() =>
                                            setTenantDiag({
                                              id: restaurant.id,
                                              tenantType: 'RESTAURANT',
                                              name: restaurant.name,
                                            })
                                          }
                                        >
                                          <Stethoscope className="h-4 w-4 mr-1" />
                                          Diagnostics
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          title="View as this restaurant"
                                          onClick={() =>
                                            handleStartImpersonation(
                                              restaurant.id,
                                              'RESTAURANT',
                                              restaurant.name
                                            )
                                          }
                                        >
                                          <UserCog className="h-4 w-4 mr-1" />
                                          Impersonate
                                        </Button>
                                        {canAdminTab.users && restaurant.contact_email && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            title="Reset sign-in password"
                                            onClick={() =>
                                              setPasswordResetTarget({
                                                email: restaurant.contact_email,
                                                displayName: restaurant.name,
                                              })
                                            }
                                          >
                                            <KeyRound className="h-4 w-4 mr-1" />
                                            Password
                                          </Button>
                                        )}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          title="Change plan"
                                          onClick={() => {
                                            const subId = (
                                              restaurant as { subscription_id?: string }
                                            ).subscription_id
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
                                            const subId = (
                                              restaurant as { subscription_id?: string }
                                            ).subscription_id
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
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!restaurantsLoading &&
                          (restaurantsForUi?.length ?? 0) < restaurantsTotal && (
                            <div className="mt-4 flex justify-center">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setRestaurantListOffset((o) => o + TENANT_PAGE_SIZE)}
                              >
                                Load more restaurants
                              </Button>
                            </div>
                          )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )
            })()}
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            <AdminSectionHeader
              title={
                initialTab === 'suppliers'
                  ? 'Supplier Usage & Quotas'
                  : initialTab === 'restaurants'
                    ? 'Restaurant Usage & Quotas'
                    : 'Usage & Quotas'
              }
              description="Monitor tenant resource usage against plan limits"
            />

            {/* Supplier-specific Usage View */}
            {initialTab === 'suppliers' && (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <AdminKpiCard
                    label="Total products"
                    value={
                      suppliersForUi?.reduce(
                        (sum, s) => sum + parseInt(String(s.product_count || 0), 10),
                        0
                      ) ?? 0
                    }
                    icon={Package}
                    tone="brand"
                  />
                  <AdminKpiCard
                    label="Loaded suppliers"
                    value={`${suppliersForUi?.length ?? 0} / ${suppliersTotal}`}
                    description="Paginate below to load more"
                    icon={Building2}
                    tone="success"
                  />
                  <AdminKpiCard
                    label="Over limit"
                    value={
                      suppliersForUi?.filter((s) => {
                        const limit = supplierProductLimit(s.plan_code ?? s.plan_name)
                        if (limit == null || limit === -1) return false
                        return parseInt(String(s.product_count || 0), 10) > limit
                      }).length ?? 0
                    }
                    icon={AlertCircle}
                    tone="danger"
                  />
                  <AdminKpiCard
                    label="Total revenue"
                    value={formatCurrency(
                      suppliersForUi?.reduce(
                        (sum, s) => sum + parseFloat(String(s.total_revenue || 0)),
                        0
                      )
                    )}
                    icon={DollarSign}
                    tone="neutral"
                  />
                </div>
                <Card className="p-4">
                  <CardHeader className="px-0 pb-3 pt-0">
                    <CardTitle className="text-sm font-semibold">Supplier usage table</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0 pt-0">
                    <AdminTenantUsageTable
                      mode="supplier"
                      suppliers={suppliersForUi ?? []}
                      plans={plans}
                      isLoading={suppliersLoading}
                      onDiagnostics={(id, name) =>
                        setTenantDiag({ id, tenantType: 'SUPPLIER', name })
                      }
                      onChangePlan={(id, name, tenantType) => {
                        const sub = subscriptions.find(
                          (s) => s.tenant_id === id && s.tenant_type === tenantType
                        )
                        if (sub) {
                          setChangePlanModal({
                            open: true,
                            subId: sub.id,
                            tenantType,
                            tenantName: name,
                            targetPlanId: sub.plan_id || '',
                          })
                        }
                      }}
                    />
                    {!suppliersLoading && (suppliersForUi?.length ?? 0) < suppliersTotal && (
                      <div className="mt-3 flex justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSupplierListOffset((o) => o + TENANT_PAGE_SIZE)}
                        >
                          Load more suppliers
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Restaurant-specific Usage View */}
            {initialTab === 'restaurants' && (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <AdminKpiCard
                    label="30-day orders"
                    value={
                      restaurantsForUi?.reduce(
                        (sum, r) => sum + parseInt(String(r.orders_last_30d || 0), 10),
                        0
                      ) ?? 0
                    }
                    icon={TrendingUp}
                    tone="brand"
                  />
                  <AdminKpiCard
                    label="Loaded restaurants"
                    value={`${restaurantsForUi?.length ?? 0} / ${restaurantsTotal}`}
                    description="Paginate below to load more"
                    icon={Users}
                    tone="success"
                  />
                  <AdminKpiCard
                    label="Lifetime spend"
                    value={formatCurrency(
                      restaurantsForUi?.reduce(
                        (sum, r) => sum + parseFloat(String(r.total_spent || 0)),
                        0
                      )
                    )}
                    description="Loaded tenants only (lifetime delivered)"
                    icon={DollarSign}
                    tone="neutral"
                  />
                </div>
                <Card className="p-4">
                  <CardHeader className="px-0 pb-3 pt-0">
                    <CardTitle className="text-sm font-semibold">Restaurant usage table</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0 pt-0">
                    <AdminTenantUsageTable
                      mode="restaurant"
                      restaurants={restaurantsForUi ?? []}
                      plans={plans}
                      isLoading={restaurantsLoading}
                      onDiagnostics={(id, name) =>
                        setTenantDiag({ id, tenantType: 'RESTAURANT', name })
                      }
                      onChangePlan={(id, name, tenantType) => {
                        const sub = subscriptions.find(
                          (s) => s.tenant_id === id && s.tenant_type === tenantType
                        )
                        if (sub) {
                          setChangePlanModal({
                            open: true,
                            subId: sub.id,
                            tenantType,
                            tenantName: name,
                            targetPlanId: sub.plan_id || '',
                          })
                        }
                      }}
                    />
                    {!restaurantsLoading && (restaurantsForUi?.length ?? 0) < restaurantsTotal && (
                      <div className="mt-3 flex justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRestaurantListOffset((o) => o + TENANT_PAGE_SIZE)}
                        >
                          Load more restaurants
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Default Usage view when on main Admin Dashboard (not Supplier/Restaurant Admin) */}
            {initialTab !== 'suppliers' && initialTab !== 'restaurants' && (
              <>
                <Card>
                  <CardHeader>
                    <h3 className="text-xl font-bold text-[var(--text)]">
                      Platform usage overview
                    </h3>
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
                            const limit = supplierProductLimit(s.plan_code ?? s.plan_name) ?? 1000
                            if (limit === -1) return false
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
              suppliers={(suppliersData?.suppliers ?? []).map(
                (s: { id: string; name: string }) => ({
                  id: s.id,
                  name: s.name,
                })
              )}
            />
          </TabsContent>

          <TabsContent value="deals">
            <AdminDealsPanel />
          </TabsContent>

          <TabsContent value="limits">
            <AdminLimitsTab />
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
                  <option value="order_confirmed">Order acknowledged</option>
                  <option value="order_completed">Order completed</option>
                  <option value="deal_activity">Deal activity</option>
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
            ) : activityError ? (
              <Card className="p-6 border-red-200 bg-red-50/50">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[var(--text)]">Activity feed unavailable</p>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      {(activityQueryError as { data?: { message?: string } })?.data?.message ||
                        'The activity API request failed. This is not shown as an empty feed.'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => refetchActivity()}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              </Card>
            ) : !activityData?.events?.length ? (
              <div className="text-center py-16 text-[var(--text-muted)]">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No matching activity</p>
                <p className="text-xs mt-1 max-w-md mx-auto">
                  {activityType !== 'all'
                    ? 'Try “All events” or another filter. The feed includes orders, registrations, plan changes, deals, boosts, reservations, and admin subscription actions when present in the database.'
                    : 'No platform events found yet. Create tenants, place orders, or change subscriptions to populate this feed.'}
                </p>
              </div>
            ) : (
              <>
                {(activityData as { partial?: boolean; failedSources?: string[] }).partial && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
                    Some activity sources could not be loaded (
                    {(activityData as { failedSources?: string[] }).failedSources?.join(', ')}).
                    Showing partial results.
                  </p>
                )}
                {/* Count */}
                <p className="text-xs text-[var(--text-muted)] mb-4">
                  {activityData.total ?? activityData.events.length} events in current window
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
                                        <p className="text-[var(--text)]">
                                          {log.action_description}
                                        </p>
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
                <DialogDescription>
                  Select a target plan and preview limits or feature changes before applying.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Target plan</Label>
                  <select
                    className="w-full rounded-md border border-[var(--app-border-mid)] bg-[var(--app-surface)] px-3 py-2 mt-1 text-[var(--text-primary)]"
                    value={changePlanModal.targetPlanId}
                    disabled={changePlanPlansLoading}
                    onChange={(e) =>
                      setChangePlanModal((m) => m && { ...m, targetPlanId: e.target.value })
                    }
                  >
                    <option value="">
                      {changePlanPlansLoading ? 'Loading plans…' : 'Select plan'}
                    </option>
                    {changePlanPlanOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                  {!changePlanPlansLoading && changePlanPlanOptions.length === 0 && (
                    <p className="mt-1 text-sm text-amber-600">
                      No plans found for {changePlanModal.tenantType.toLowerCase()} tenants. Create
                      one on the Plans tab.
                    </p>
                  )}
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
        <AdminResetPasswordDialog
          open={Boolean(passwordResetTarget)}
          onOpenChange={(open) => !open && setPasswordResetTarget(null)}
          target={passwordResetTarget}
        />
        {tenantDiag && (
          <AdminTenantDiagnosticsDrawer
            open={Boolean(tenantDiag)}
            onOpenChange={(open) => !open && setTenantDiag(null)}
            tenantId={tenantDiag.id}
            tenantType={tenantDiag.tenantType}
            tenantName={tenantDiag.name}
            onNavigateLimits={() => {
              setTenantDiag(null)
              setSelectedTab('limits')
            }}
            onNavigateFeatures={() => {
              setTenantDiag(null)
              setSelectedTab('features')
            }}
          />
        )}
      </div>
    </div>
  )
}
