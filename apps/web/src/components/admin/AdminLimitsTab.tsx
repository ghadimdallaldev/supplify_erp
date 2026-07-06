import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import { toast } from 'sonner'
import { Filter, Loader2, Minus, Plus, RefreshCw, Search, X } from 'lucide-react'
import { AppPanel, SummaryStrip } from '../ui/app-panel'
import { TableScroll } from '../ui/table-scroll'
import { responsiveDataListClasses } from '../ui/responsive-data-list'
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminSectionHeader,
  AdminStatusBadge,
} from './adminUi'
import {
  useCreateAdminPlanLimitOverrideMutation,
  useCreateAdminTenantLimitOverrideMutation,
  useGetAdminEffectiveLimitQuery,
  useGetAdminLimitKeysQuery,
  useGetAdminLimitOverridesQuery,
  useGetAdminPlansQuery,
  useGetAdminRestaurantsQuery,
  useGetAdminSubscriptionAddonsQuery,
  useGetAdminSuppliersQuery,
  useGetAdminTenantEntitlementsQuery,
  useUpdateAdminPlanLimitOverrideMutation,
  useUpdateAdminTenantLimitOverrideMutation,
  useUpsertAdminSubscriptionAddonMutation,
} from '../../services/api'
import {
  filterAdminLimitKeys,
  formatAddonKeyLabel,
  formatLimitKeyLabel,
  formatLimitValue,
  formatPlanCodeLabel,
} from '../../lib/adminLimitLabels'
import {
  mapAdminTenantRow,
  type AdminTenantOption,
  type AdminTenantType,
} from '../../lib/adminTenantSearch'
import { AdminTenantPicker } from './AdminTenantPicker'
import { LocationMetricCard, type LocationMetric } from './limits/LocationMetricCard'
import { EffectiveLimitsTable } from './limits/EffectiveLimitsTable'
import { OverridesTable } from './limits/OverridesTable'
import type { Entitlements } from '../../types/admin'

const SUPPLIER_ADDON_OPTIONS = [
  { key: 'supplier_extra_branch', label: 'Extra branch' },
  { key: 'supplier_extra_warehouse', label: 'Extra warehouse' },
]

const RESTAURANT_ADDON_OPTIONS = [{ key: 'restaurant_extra_branch', label: 'Extra branch' }]

export function AdminLimitsTab() {
  const { t } = useTranslation('admin')
  const [tenantType, setTenantType] = useState<AdminTenantType>('RESTAURANT')
  const [selectedTenant, setSelectedTenant] = useState<AdminTenantOption | null>(null)
  const [orgMainOnly, setOrgMainOnly] = useState(false)
  const [overrideSearch, setOverrideSearch] = useState('')

  const tenantListArgs = { limit: 100, offset: 0 }
  const {
    data: suppliersData,
    isLoading: suppliersLoading,
    isFetching: suppliersFetching,
    refetch: refetchSuppliers,
  } = useGetAdminSuppliersQuery(tenantListArgs)
  const {
    data: restaurantsData,
    isLoading: restaurantsLoading,
    isFetching: restaurantsFetching,
    refetch: refetchRestaurants,
  } = useGetAdminRestaurantsQuery(tenantListArgs)

  const tenants = useMemo(() => {
    const suppliers = (suppliersData?.suppliers ?? []).map((r: Record<string, unknown>) =>
      mapAdminTenantRow(r as Parameters<typeof mapAdminTenantRow>[0], 'SUPPLIER')
    )
    const restaurants = (restaurantsData?.restaurants ?? []).map((r: Record<string, unknown>) =>
      mapAdminTenantRow(r as Parameters<typeof mapAdminTenantRow>[0], 'RESTAURANT')
    )
    return [...suppliers, ...restaurants]
  }, [suppliersData, restaurantsData])

  const tenantId = selectedTenant?.id ?? ''
  const tenantsLoading = suppliersLoading || restaurantsLoading
  const tenantsFetching = suppliersFetching || restaurantsFetching

  const {
    data: addonData,
    isLoading: addonsLoading,
    isFetching: addonsFetching,
    refetch: refetchAddons,
    error: addonsError,
  } = useGetAdminSubscriptionAddonsQuery({ tenantType, tenantId }, { skip: !tenantId })

  const {
    data: entitlementsData,
    isLoading: entitlementsLoading,
    isFetching: entitlementsFetching,
    refetch: refetchEntitlements,
    error: entitlementsError,
  } = useGetAdminTenantEntitlementsQuery({ tenantType, tenantId }, { skip: !tenantId })

  const { data: keysData } = useGetAdminLimitKeysQuery({ tenantType })
  const { data: plansData } = useGetAdminPlansQuery({ tenant_type: tenantType })
  const {
    data: overridesData,
    isLoading: overridesLoading,
    isFetching: overridesFetching,
    refetch: refetchOverrides,
    error: overridesError,
  } = useGetAdminLimitOverridesQuery(
    tenantId ? { tenantType, tenantId, active: 'true' } : { active: 'true' }
  )

  const limitKeys = useMemo(
    () => filterAdminLimitKeys(keysData?.keys ?? [], tenantType),
    [keysData?.keys, tenantType]
  )

  const plans = useMemo(() => {
    const list = plansData?.plans ?? []
    return [...list].sort((a, b) => {
      const order = ['free', 'silver', 'gold', 'platinum', 'enterprise']
      const ai = order.indexOf((a.code || '').toLowerCase())
      const bi = order.indexOf((b.code || '').toLowerCase())
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
  }, [plansData?.plans])

  const [addonKey, setAddonKey] = useState('restaurant_extra_branch')
  const [addonQty, setAddonQty] = useState(1)
  const [addonReason, setAddonReason] = useState('')
  const [upsertAddon, { isLoading: savingAddon }] = useUpsertAdminSubscriptionAddonMutation()

  const [planId, setPlanId] = useState('')
  const [planLimitKey, setPlanLimitKey] = useState('')
  const [planOverrideValue, setPlanOverrideValue] = useState('')
  const [planReason, setPlanReason] = useState('')
  const [createPlanOverride, { isLoading: savingPlanOverride }] =
    useCreateAdminPlanLimitOverrideMutation()
  const [updatePlanOverride] = useUpdateAdminPlanLimitOverrideMutation()

  const [tenantLimitKey, setTenantLimitKey] = useState('')
  const [tenantOverrideValue, setTenantOverrideValue] = useState('')
  const [tenantReason, setTenantReason] = useState('')
  const [createTenantOverride, { isLoading: savingTenantOverride }] =
    useCreateAdminTenantLimitOverrideMutation()
  const [updateTenantOverride] = useUpdateAdminTenantLimitOverrideMutation()

  const selectedPlan = plans.find((p) => p.id === planId)
  const planDefaultLimit =
    planLimitKey && selectedPlan?.limits
      ? (selectedPlan.limits as Record<string, number>)[planLimitKey]
      : undefined
  const existingPlanOverride = (overridesData?.planOverrides ?? []).find(
    (o) => o.plan_id === planId && o.limit_type === planLimitKey && o.is_active !== false
  )

  const { data: effectiveData } = useGetAdminEffectiveLimitQuery(
    { tenantType, tenantId, limitKey: tenantLimitKey },
    { skip: !tenantId || !tenantLimitKey }
  )

  const existingTenantOverride = (overridesData?.tenantOverrides ?? []).find(
    (o) =>
      o.tenant_id === tenantId &&
      o.tenant_type === tenantType &&
      o.limit_type === tenantLimitKey &&
      o.is_active !== false
  )

  const tenantOverridesForSelected = useMemo(() => {
    if (!tenantId) return overridesData?.tenantOverrides ?? []
    return (overridesData?.tenantOverrides ?? []).filter(
      (o) => o.tenant_id === tenantId && o.tenant_type === tenantType
    )
  }, [overridesData?.tenantOverrides, tenantId, tenantType])

  const planOverridesForType = useMemo(() => {
    return (overridesData?.planOverrides ?? []).filter((o) => {
      const plan = plans.find((p) => p.id === o.plan_id)
      return (plan?.tenant_type || tenantType) === tenantType
    })
  }, [overridesData?.planOverrides, plans, tenantType])

  const filterOverrideRows = (rows: Array<Record<string, unknown>>) => {
    const q = overrideSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      const haystack = [
        row.limit_type,
        row.reason,
        row.plan_code,
        row.override_value,
        selectedTenant?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }

  const filteredTenantOverrides = filterOverrideRows(tenantOverridesForSelected)
  const filteredPlanOverrides = filterOverrideRows(planOverridesForType)

  const loc = addonData?.locationLimits as {
    branches?: LocationMetric
    warehouses?: LocationMetric
  }
  const activeAddons = addonData?.addons ?? []
  const entitlements = entitlementsData?.entitlements as Entitlements | undefined

  const summaryStats = useMemo(() => {
    const tenantOverrides = overridesData?.tenantOverrides ?? []
    const planOverrides = overridesData?.planOverrides ?? []
    const activeTenantOverrides = tenantOverrides.filter((o) => o.is_active !== false)
    const activePlanOverrides = planOverrides.filter((o) => o.is_active !== false)
    let limitsAtRisk = 0
    if (entitlements?.limits && entitlements.usage) {
      for (const key of filterAdminLimitKeys(Object.keys(entitlements.limits), tenantType)) {
        const used = entitlements.usage[key] ?? 0
        const limit = entitlements.limits[key]
        if (limit != null && limit !== -1 && limit > 0 && used >= limit * 0.8) limitsAtRisk++
      }
    }
    return {
      activeTenantOverrides: activeTenantOverrides.length,
      activePlanOverrides: activePlanOverrides.length,
      limitsAtRisk,
    }
  }, [overridesData, entitlements, tenantType])

  const addonOptions =
    tenantType === 'RESTAURANT' ? RESTAURANT_ADDON_OPTIONS : SUPPLIER_ADDON_OPTIONS

  const handleGrantAddon = async () => {
    if (!tenantId) {
      toast.error(t('limitsToasts.selectTenantFirst'))
      return
    }
    if (!addonReason.trim()) {
      toast.error(t('limitsToasts.addonReasonRequired'))
      return
    }
    try {
      await upsertAddon({
        tenantType,
        tenantId,
        addonKey,
        quantity: addonQty,
        reason: addonReason.trim(),
      }).unwrap()
      toast.success(addonQty === 0 ? 'Add-on removed' : 'Add-on saved')
      refetchAddons()
      refetchEntitlements()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to update add-on')
    }
  }

  const handleSavePlanOverride = async () => {
    if (!planId || !planLimitKey || planOverrideValue === '') {
      toast.error(t('limitsToasts.planOverrideRequired'))
      return
    }
    if (!planReason.trim()) {
      toast.error(t('limitsToasts.overrideReasonRequired'))
      return
    }
    const num = Number(planOverrideValue)
    if (planDefaultLimit != null && planDefaultLimit !== -1 && num < Number(planDefaultLimit)) {
      toast.error(t('limitsToasts.overrideBelowDefault'))
      return
    }
    try {
      await createPlanOverride({
        planId,
        limit_type: planLimitKey,
        override_value: num,
        reason: planReason.trim(),
      }).unwrap()
      toast.success(t('limitsToasts.planOverrideSaved'))
      setPlanOverrideValue('')
      setPlanReason('')
      refetchOverrides()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to save plan override')
    }
  }

  const handleSaveTenantOverride = async () => {
    if (!tenantId || !tenantLimitKey || tenantOverrideValue === '') {
      toast.error(t('limitsToasts.tenantFieldsRequired'))
      return
    }
    if (!tenantReason.trim()) {
      toast.error(t('limitsToasts.overrideReasonRequired'))
      return
    }
    try {
      await createTenantOverride({
        tenantType,
        tenantId,
        limit_type: tenantLimitKey,
        override_value: Number(tenantOverrideValue),
        reason: tenantReason.trim(),
      }).unwrap()
      toast.success(t('limitsToasts.tenantOverrideSaved'))
      setTenantOverrideValue('')
      setTenantReason('')
      refetchOverrides()
      refetchAddons()
      refetchEntitlements()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to save tenant override')
    }
  }

  const adjustAddonQty = (delta: number) => {
    setAddonQty((q) => Math.max(0, Math.min(99, q + delta)))
  }

  const editAddonRow = (key: string, currentQty: number) => {
    setAddonKey(key)
    setAddonQty(currentQty)
  }

  const handleRefresh = () => {
    refetchSuppliers()
    refetchRestaurants()
    refetchOverrides()
    if (tenantId) {
      refetchAddons()
      refetchEntitlements()
    }
  }

  return (
    <>
      <AdminSectionHeader
        title={t('limits.title')}
        description={t('limits.description')}
        action={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={tenantsFetching}>
            {tenantsFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        }
      />

      <SummaryStrip
        testId="admin-limits-stats"
        columns={4}
        metrics={[
          {
            label: 'Tenant overrides',
            value: summaryStats.activeTenantOverrides,
            hint: 'Active across platform',
          },
          {
            label: 'Plan overrides',
            value: summaryStats.activePlanOverrides,
            hint: `${tenantType.toLowerCase()} plan tiers`,
          },
          {
            label: 'Limits at risk',
            value: tenantId ? summaryStats.limitsAtRisk : '—',
            tone: summaryStats.limitsAtRisk > 0 ? 'amber' : 'default',
            hint: tenantId ? 'Selected tenant ≥80% usage' : 'Select a tenant',
          },
          {
            label: 'Limit keys',
            value: limitKeys.length,
            hint: `Configurable for ${tenantType.toLowerCase()}`,
            tone: 'brand',
          },
        ]}
      />

      <AppPanel title={t('limits.selectTenant')} testId="admin-limits-tenant-picker">
        <AdminTenantPicker
          tenantType={tenantType}
          onTenantTypeChange={(t) => {
            setTenantType(t)
            setSelectedTenant(null)
            setAddonKey(t === 'RESTAURANT' ? 'restaurant_extra_branch' : 'supplier_extra_branch')
          }}
          tenants={tenants}
          selectedId={tenantId}
          onSelect={setSelectedTenant}
          loading={tenantsLoading}
          orgMainOnly={orgMainOnly}
          onOrgMainOnlyChange={setOrgMainOnly}
        />
      </AppPanel>

      {tenantId && addonsLoading && <AdminLoadingState label={t('limits.loading')} />}

      {tenantId && addonsError && (
        <AdminErrorState
          title={t('limits.addonsFailedTitle')}
          message="Could not fetch subscription add-on data for this tenant."
          onRetry={() => refetchAddons()}
        />
      )}

      {tenantId && !addonsLoading && addonData && (
        <>
          <AppPanel
            title={t('limits.tenantSummary')}
            description={`${addonData.tenantName ?? selectedTenant?.name} · ${formatPlanCodeLabel(addonData.planCode)}`}
            testId="admin-limits-tenant-summary"
          >
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <span className="text-[var(--text-muted)]">Type:</span> {tenantType}
                </span>
                <AdminStatusBadge status={selectedTenant?.status ?? 'active'} />
              </div>
              {addonData.usesOrgBilling && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                  Add-ons and subscription limits apply to org billing tenant{' '}
                  <strong>{addonData.billingTenantName}</strong>
                  {addonData.billingTenantId !== tenantId ? ' (main branch)' : ''}.
                </p>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <LocationMetricCard
                  title={t('limits.branches')}
                  metric={loc?.branches}
                  showEnterprise
                />
                {tenantType === 'SUPPLIER' && (
                  <LocationMetricCard title={t('limits.warehouses')} metric={loc?.warehouses} />
                )}
              </div>
            </div>
          </AppPanel>

          <AppPanel
            title={t('limits.effectiveLimitsTitle')}
            description={t('limits.effectiveLimitsDescription')}
            testId="admin-limits-effective-table"
            footer={
              entitlementsFetching && !entitlementsLoading ? (
                <span className="text-xs text-[var(--text-muted)]">Refreshing usage…</span>
              ) : undefined
            }
          >
            {entitlementsError ? (
              <AdminErrorState
                title={t('limits.entitlementsFailedTitle')}
                message="Could not fetch full limit and usage snapshot."
                onRetry={() => refetchEntitlements()}
              />
            ) : (
              <EffectiveLimitsTable
                entitlements={entitlements}
                tenantType={tenantType}
                loading={entitlementsLoading}
              />
            )}
          </AppPanel>

          <AppPanel
            title={t('limits.addonsTitle')}
            description={t('limits.addonsDescription')}
            testId="admin-limits-addons"
          >
            <div className="space-y-6">
              {activeAddons.length > 0 ? (
                <>
                  <div className="space-y-3 lg:hidden">
                    {activeAddons.map((a) => {
                      const key = String(a.addon_key)
                      const qty = Number(a.quantity) || 0
                      return (
                        <article
                          key={String(a.id)}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--app-border)] p-4"
                        >
                          <div>
                            <p className="font-medium">{formatAddonKeyLabel(key)}</p>
                            <p className="text-sm text-[var(--text-muted)]">
                              Qty {qty}
                              {a.unit_price_monthly != null ? ` · $${a.unit_price_monthly}/mo` : ''}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => editAddonRow(key, qty)}
                          >
                            Edit
                          </Button>
                        </article>
                      )
                    })}
                  </div>
                  <TableScroll
                    aria-label={t('limits.addonsTableAriaLabel')}
                    className="hidden lg:block"
                  >
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b bg-[var(--app-bg-subtle)]/50 text-left text-xs text-[var(--text-muted)]">
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Qty</th>
                          <th className="px-3 py-2">Unit price</th>
                          <th className="px-3 py-2 text-right">{t('common.table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {activeAddons.map((a) => {
                          const key = String(a.addon_key)
                          const qty = Number(a.quantity) || 0
                          return (
                            <tr key={String(a.id)} className="hover:bg-[var(--brand-ultra)]/30">
                              <td className="px-3 py-2 font-medium">{formatAddonKeyLabel(key)}</td>
                              <td className="px-3 py-2">{qty}</td>
                              <td className="px-3 py-2 text-[var(--text-muted)]">
                                {a.unit_price_monthly != null ? `$${a.unit_price_monthly}/mo` : '—'}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => editAddonRow(key, qty)}
                                >
                                  Edit
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </TableScroll>
                </>
              ) : (
                <AdminEmptyState
                  title={t('limits.noAddonsTitle')}
                  description={t('limits.noAddonsDescription')}
                />
              )}

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
                <div>
                  <Label>Add-on type</Label>
                  <Select value={addonKey} onValueChange={(value) => setAddonKey(value)}>
                    <SelectTrigger className="mt-1.5 w-full">
                      {addonOptions.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </SelectTrigger>
                  </Select>
                </div>
                <div>
                  <Label>Quantity</Label>
                  <div className="mt-1 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => adjustAddonQty(-1)}
                      aria-label={t('limits.decreaseQtyAriaLabel')}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      className="text-center"
                      value={addonQty}
                      onChange={(e) =>
                        setAddonQty(Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)))
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => adjustAddonQty(1)}
                      aria-label={t('limits.increaseQtyAriaLabel')}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label>Reason (required)</Label>
                  <Input
                    className="mt-1.5"
                    value={addonReason}
                    onChange={(e) => setAddonReason(e.target.value)}
                    placeholder={t('limits.addonReasonPlaceholder')}
                  />
                </div>
              </div>
              <div className="action-bar">
                <Button
                  onClick={handleGrantAddon}
                  disabled={savingAddon || addonsFetching}
                  className="w-full sm:w-auto"
                >
                  {savingAddon ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {addonQty === 0 ? 'Remove add-on' : 'Grant / update add-on'}
                </Button>
              </div>
            </div>
          </AppPanel>
        </>
      )}

      {tenantId && !addonsLoading && !addonData && (
        <AdminEmptyState
          title={t('limits.noSubscriptionTitle')}
          description={t('limits.noSubscriptionDescription')}
        />
      )}

      <AppPanel
        title={t('limits.planOverrideTitle')}
        description={t('limits.planOverrideDescription')}
        testId="admin-limits-plan-override"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>{t('common.table.plan')}</Label>
              <Select
                value={planId}
                onValueChange={(value) => {
                  setPlanId(value)
                  setPlanLimitKey('')
                }}
              >
                <SelectTrigger className="mt-1.5 w-full">
                  <option value="">Select plan tier</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatPlanCodeLabel(p.code)} ({p.name})
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div>
              <Label>Limit</Label>
              <Select value={planLimitKey} onValueChange={(value) => setPlanLimitKey(value)}>
                <SelectTrigger className="mt-1.5 w-full" disabled={!planId}>
                  <option value="">Select limit</option>
                  {limitKeys.map((k) => (
                    <option key={k} value={k}>
                      {formatLimitKeyLabel(k)}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            {planLimitKey && (
              <div className="md:col-span-2 rounded-md bg-[var(--app-bg-subtle)]/80 px-3 py-2 text-sm">
                <span className="text-[var(--text-muted)]">Plan default: </span>
                <strong>{formatLimitValue(planDefaultLimit)}</strong>
                {existingPlanOverride && (
                  <>
                    {' · '}
                    <span className="text-[var(--text-muted)]">Current override: </span>
                    <strong>{String(existingPlanOverride.override_value)}</strong>
                  </>
                )}
                {planOverrideValue !== '' && (
                  <>
                    {' · '}
                    <span className="text-[var(--text-muted)]">Preview: </span>
                    <strong>
                      {formatLimitValue(planDefaultLimit)} → {planOverrideValue}
                    </strong>
                  </>
                )}
              </div>
            )}
            <div>
              <Label>Override value</Label>
              <Input
                type="number"
                min={0}
                className="mt-1.5"
                value={planOverrideValue}
                onChange={(e) => setPlanOverrideValue(e.target.value)}
              />
            </div>
            <div>
              <Label>Reason (required)</Label>
              <Input
                className="mt-1.5"
                value={planReason}
                onChange={(e) => setPlanReason(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleSavePlanOverride}
            disabled={savingPlanOverride}
            className="w-full sm:w-auto"
          >
            {savingPlanOverride ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save plan override
          </Button>
        </div>
      </AppPanel>

      {tenantId && (
        <AppPanel
          title={t('limits.tenantOverrideTitle')}
          description={`Applies only to ${selectedTenant?.name} (billing tenant resolved automatically).`}
          testId="admin-limits-tenant-override"
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Limit</Label>
                <Select value={tenantLimitKey} onValueChange={(value) => setTenantLimitKey(value)}>
                  <SelectTrigger className="mt-1.5 w-full">
                    <option value="">Select limit</option>
                    {limitKeys.map((k) => (
                      <option key={k} value={k}>
                        {formatLimitKeyLabel(k)}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
              <div>
                <Label>Override value</Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1.5"
                  value={tenantOverrideValue}
                  onChange={(e) => setTenantOverrideValue(e.target.value)}
                />
              </div>
              {tenantLimitKey && effectiveData?.resolved && (
                <div className="md:col-span-2 rounded-md bg-[var(--app-bg-subtle)]/80 px-3 py-2 text-sm">
                  <span className="text-[var(--text-muted)]">Current effective: </span>
                  <strong>{formatLimitValue(effectiveData.resolved.effectiveLimit)}</strong>
                  <span className="text-[var(--text-muted)]"> (plan base </span>
                  <strong>{formatLimitValue(effectiveData.resolved.baseLimit)}</strong>
                  <span className="text-[var(--text-muted)]">)</span>
                  {existingTenantOverride && (
                    <>
                      {' · '}
                      <span className="text-[var(--text-muted)]">Saved override: </span>
                      <strong>{String(existingTenantOverride.override_value)}</strong>
                    </>
                  )}
                  {tenantOverrideValue !== '' && (
                    <>
                      {' · '}
                      <span className="text-[var(--text-muted)]">Preview: </span>
                      <strong>
                        {formatLimitValue(effectiveData.resolved.effectiveLimit)} →{' '}
                        {tenantOverrideValue}
                      </strong>
                    </>
                  )}
                </div>
              )}
              <div className="md:col-span-2">
                <Label>Reason (required)</Label>
                <Input
                  value={tenantReason}
                  onChange={(e) => setTenantReason(e.target.value)}
                  placeholder={t('limits.tenantOverrideReasonPlaceholder')}
                />
              </div>
            </div>
            <Button
              onClick={handleSaveTenantOverride}
              disabled={savingTenantOverride}
              className="w-full sm:w-auto"
            >
              {savingTenantOverride ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save tenant override
            </Button>
          </div>
        </AppPanel>
      )}

      <AppPanel
        title={tenantId ? 'Overrides for selected tenant' : 'Active overrides'}
        description={
          overridesLoading
            ? 'Loading overrides…'
            : `${filteredTenantOverrides.length + filteredPlanOverrides.length} override row${filteredTenantOverrides.length + filteredPlanOverrides.length === 1 ? '' : 's'} shown`
        }
        testId="admin-limits-overrides"
        footer={
          overridesFetching && !overridesLoading ? (
            <span className="text-xs text-[var(--text-muted)]">Refreshing overrides…</span>
          ) : undefined
        }
      >
        {overridesError ? (
          <AdminErrorState
            title={t('limits.overridesFailedTitle')}
            onRetry={() => refetchOverrides()}
          />
        ) : overridesLoading ? (
          <AdminLoadingState label={t('limits.loadingOverrides')} />
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border border-[var(--app-border)] p-3">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <Filter className="h-4 w-4 text-[var(--text-mid)]" aria-hidden />
                Search overrides
              </h3>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
                <Input
                  className="h-10 pl-9"
                  placeholder={t('limits.searchOverridesPlaceholder')}
                  value={overrideSearch}
                  onChange={(e) => setOverrideSearch(e.target.value)}
                  aria-label={t('limits.searchOverridesAriaLabel')}
                />
                {overrideSearch && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 h-8 -translate-y-1/2"
                    onClick={() => setOverrideSearch('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {tenantId && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Tenant overrides</h3>
                {filteredTenantOverrides.length === 0 ? (
                  <AdminEmptyState
                    title={t('limits.noTenantOverridesTitle')}
                    description={
                      overrideSearch
                        ? 'No matches for your search on this tenant.'
                        : 'None configured for this tenant.'
                    }
                  />
                ) : (
                  <OverridesTable
                    rows={filteredTenantOverrides}
                    kind="tenant"
                    tenantName={selectedTenant?.name}
                    onDisable={async (id) => {
                      if (!window.confirm('Disable this tenant override?')) return
                      try {
                        await updateTenantOverride({ id, is_active: false }).unwrap()
                        toast.success(t('limitsToasts.overrideDisabled'))
                        refetchOverrides()
                        refetchAddons()
                        refetchEntitlements()
                      } catch {
                        toast.error(t('limitsToasts.disableFailed'))
                      }
                    }}
                  />
                )}
              </div>
            )}

            <div>
              <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
                Plan-tier overrides ({tenantType})
              </h3>
              {filteredPlanOverrides.length === 0 ? (
                <AdminEmptyState
                  title={t('limits.noPlanOverridesTitle')}
                  description={
                    overrideSearch
                      ? 'No matches for your search.'
                      : `No active plan overrides for ${tenantType.toLowerCase()} plans.`
                  }
                />
              ) : (
                <OverridesTable
                  rows={filteredPlanOverrides}
                  kind="plan"
                  onDisable={async (id) => {
                    if (!window.confirm('Disable this plan override?')) return
                    try {
                      await updatePlanOverride({ id, is_active: false }).unwrap()
                      toast.success(t('limitsToasts.planOverrideDisabled'))
                      refetchOverrides()
                    } catch {
                      toast.error(t('limitsToasts.disableFailed'))
                    }
                  }}
                />
              )}
            </div>
          </div>
        )}
      </AppPanel>
    </>
  )
}
