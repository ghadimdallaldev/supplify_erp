import { useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import toast from 'react-hot-toast'
import { Loader2, Minus, Plus } from 'lucide-react'
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
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminStatusBadge,
  formatAdminDateTime,
} from './adminUi'

const SUPPLIER_ADDON_OPTIONS = [
  { key: 'supplier_extra_branch', label: 'Extra branch' },
  { key: 'supplier_extra_warehouse', label: 'Extra warehouse' },
]

const RESTAURANT_ADDON_OPTIONS = [{ key: 'restaurant_extra_branch', label: 'Extra branch' }]

type LocationMetric = {
  included?: number | null
  addonQuantity?: number
  effective?: number | null
  current?: number
  overIncludedLimit?: boolean
  overEffectiveLimit?: boolean
  atEnterpriseThreshold?: boolean
}

function LocationMetricCard({
  title,
  metric,
  showEnterprise,
}: {
  title: string
  metric?: LocationMetric
  showEnterprise?: boolean
}) {
  if (!metric) return null
  return (
    <div className="rounded-lg border border-[var(--border)] p-4 space-y-2">
      <p className="font-medium text-[var(--text)]">{title}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[var(--text-muted)]">Included</dt>
          <dd className="font-medium">{formatLimitValue(metric.included)}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Add-ons</dt>
          <dd className="font-medium">{metric.addonQuantity ?? 0}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Effective</dt>
          <dd className="font-medium">{formatLimitValue(metric.effective)}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">In use</dt>
          <dd className="font-medium">{metric.current ?? 0}</dd>
        </div>
      </dl>
      <p className="text-xs text-[var(--text-muted)]">
        Usage: {metric.current ?? 0} / {formatLimitValue(metric.included)} included
        {(metric.addonQuantity ?? 0) > 0 ? `, +${metric.addonQuantity} add-on` : ''}
        {metric.effective != null ? ` → effective ${metric.effective}` : ''}
      </p>
      {metric.overIncludedLimit && !metric.overEffectiveLimit && (
        <span className="inline-flex text-xs font-semibold rounded-md border px-2 py-0.5 bg-amber-50 text-amber-800 border-amber-200">
          Over included limit (within effective cap)
        </span>
      )}
      {metric.overEffectiveLimit && (
        <span className="inline-flex text-xs font-semibold rounded-md border px-2 py-0.5 bg-red-50 text-red-800 border-red-200">
          Over effective limit
        </span>
      )}
      {showEnterprise && metric.atEnterpriseThreshold && (
        <span className="inline-flex text-xs font-semibold rounded-md border px-2 py-0.5 bg-red-50 text-red-800 border-red-200">
          At Enterprise threshold (6+ branches)
        </span>
      )}
    </div>
  )
}

export function AdminLimitsTab() {
  const [tenantType, setTenantType] = useState<AdminTenantType>('RESTAURANT')
  const [selectedTenant, setSelectedTenant] = useState<AdminTenantOption | null>(null)
  const [orgMainOnly, setOrgMainOnly] = useState(false)

  const { data: suppliersData, isLoading: suppliersLoading } = useGetAdminSuppliersQuery()
  const { data: restaurantsData, isLoading: restaurantsLoading } = useGetAdminRestaurantsQuery()

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

  const {
    data: addonData,
    isLoading: addonsLoading,
    isFetching: addonsFetching,
    refetch: refetchAddons,
  } = useGetAdminSubscriptionAddonsQuery({ tenantType, tenantId }, { skip: !tenantId })

  const { data: keysData } = useGetAdminLimitKeysQuery({ tenantType })
  const { data: plansData } = useGetAdminPlansQuery({ tenant_type: tenantType })
  const {
    data: overridesData,
    isLoading: overridesLoading,
    refetch: refetchOverrides,
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

  // Add-on form
  const addonOptions =
    tenantType === 'RESTAURANT' ? RESTAURANT_ADDON_OPTIONS : SUPPLIER_ADDON_OPTIONS
  const [addonKey, setAddonKey] = useState('restaurant_extra_branch')
  const [addonQty, setAddonQty] = useState(1)
  const [addonReason, setAddonReason] = useState('')
  const [upsertAddon, { isLoading: savingAddon }] = useUpsertAdminSubscriptionAddonMutation()

  // Plan override form
  const [planId, setPlanId] = useState('')
  const [planLimitKey, setPlanLimitKey] = useState('')
  const [planOverrideValue, setPlanOverrideValue] = useState('')
  const [planReason, setPlanReason] = useState('')
  const [createPlanOverride, { isLoading: savingPlanOverride }] =
    useCreateAdminPlanLimitOverrideMutation()
  const [updatePlanOverride] = useUpdateAdminPlanLimitOverrideMutation()

  // Tenant override form
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

  const loc = addonData?.locationLimits as {
    branches?: LocationMetric
    warehouses?: LocationMetric
  }
  const activeAddons = addonData?.addons ?? []

  const handleGrantAddon = async () => {
    if (!tenantId) {
      toast.error('Select a tenant first')
      return
    }
    if (!addonReason.trim()) {
      toast.error('Please enter a reason for this add-on change')
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
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to update add-on')
    }
  }

  const handleSavePlanOverride = async () => {
    if (!planId || !planLimitKey || planOverrideValue === '') {
      toast.error('Plan, limit key, and value are required')
      return
    }
    if (!planReason.trim()) {
      toast.error('Please enter a reason for this override')
      return
    }
    const num = Number(planOverrideValue)
    if (planDefaultLimit != null && planDefaultLimit !== -1 && num < Number(planDefaultLimit)) {
      toast.error('Override cannot be lower than the plan default')
      return
    }
    try {
      await createPlanOverride({
        planId,
        limit_type: planLimitKey,
        override_value: num,
        reason: planReason.trim(),
      }).unwrap()
      toast.success('Plan override saved')
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
      toast.error('Select a tenant and enter limit key and value')
      return
    }
    if (!tenantReason.trim()) {
      toast.error('Please enter a reason for this override')
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
      toast.success('Tenant override saved')
      setTenantOverrideValue('')
      setTenantReason('')
      refetchOverrides()
      refetchAddons()
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

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-bold text-[var(--text)]">Limits & add-ons</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Search for a tenant, review branch/warehouse usage, grant add-ons, and manage plan or
          tenant limit overrides — without copying UUIDs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select tenant</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {tenantId && addonsLoading && <AdminLoadingState label="Loading tenant limits…" />}

      {tenantId && !addonsLoading && addonData && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tenant summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <span className="text-[var(--text-muted)]">Tenant:</span>{' '}
                  <strong>{addonData.tenantName ?? selectedTenant?.name}</strong>
                </span>
                <span>
                  <span className="text-[var(--text-muted)]">Type:</span> {tenantType}
                </span>
                <span>
                  <span className="text-[var(--text-muted)]">Plan:</span>{' '}
                  {formatPlanCodeLabel(addonData.planCode)}
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
                <LocationMetricCard title="Branches" metric={loc?.branches} showEnterprise />
                {tenantType === 'SUPPLIER' && (
                  <LocationMetricCard title="Warehouses" metric={loc?.warehouses} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Add-ons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Branch & warehouse add-ons</CardTitle>
              <p className="text-sm text-[var(--text-muted)]">
                Set quantity to 0 to remove an add-on. Unit price defaults from plan tier unless you
                set a custom price later via billing.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {activeAddons.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--app-bg-subtle)]/50 text-left text-xs text-[var(--text-muted)]">
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Unit price</th>
                        <th className="px-3 py-2 text-right">Actions</th>
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
                </div>
              ) : (
                <AdminEmptyState
                  title="No active add-ons"
                  description="Grant an extra branch or warehouse below."
                />
              )}

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
                <div>
                  <Label>Add-on type</Label>
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm"
                    value={addonKey}
                    onChange={(e) => setAddonKey(e.target.value)}
                  >
                    {addonOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
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
                      aria-label="Decrease quantity"
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
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label>Reason (required)</Label>
                  <Input
                    className="mt-1"
                    value={addonReason}
                    onChange={(e) => setAddonReason(e.target.value)}
                    placeholder="e.g. Sales-approved Gold add-on pack"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleGrantAddon} disabled={savingAddon || addonsFetching}>
                  {savingAddon ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {addonQty === 0 ? 'Remove add-on' : 'Grant / update add-on'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {tenantId && !addonsLoading && !addonData && (
        <AdminEmptyState
          title="No subscription data"
          description="This tenant may not have an active or trialing subscription."
        />
      )}

      {/* Limit overrides */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan-tier limit override</CardTitle>
          <p className="text-sm text-[var(--text-muted)]">
            Raises the default limit for every tenant on that plan (cannot go below plan default).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Plan</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm"
                value={planId}
                onChange={(e) => {
                  setPlanId(e.target.value)
                  setPlanLimitKey('')
                }}
              >
                <option value="">Select plan tier</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatPlanCodeLabel(p.code)} ({p.name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Limit</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm"
                value={planLimitKey}
                onChange={(e) => setPlanLimitKey(e.target.value)}
                disabled={!planId}
              >
                <option value="">Select limit</option>
                {limitKeys.map((k) => (
                  <option key={k} value={k}>
                    {formatLimitKeyLabel(k)}
                  </option>
                ))}
              </select>
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
                className="mt-1"
                value={planOverrideValue}
                onChange={(e) => setPlanOverrideValue(e.target.value)}
              />
            </div>
            <div>
              <Label>Reason (required)</Label>
              <Input
                className="mt-1"
                value={planReason}
                onChange={(e) => setPlanReason(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={handleSavePlanOverride} disabled={savingPlanOverride}>
            {savingPlanOverride ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save plan override
          </Button>
        </CardContent>
      </Card>

      {tenantId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenant-specific limit override</CardTitle>
            <p className="text-sm text-[var(--text-muted)]">
              Applies only to <strong>{selectedTenant?.name}</strong> (billing tenant resolved
              automatically).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Limit</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm"
                  value={tenantLimitKey}
                  onChange={(e) => setTenantLimitKey(e.target.value)}
                >
                  <option value="">Select limit</option>
                  {limitKeys.map((k) => (
                    <option key={k} value={k}>
                      {formatLimitKeyLabel(k)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Override value</Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1"
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
                  placeholder="Why this tenant needs a higher limit"
                />
              </div>
            </div>
            <Button onClick={handleSaveTenantOverride} disabled={savingTenantOverride}>
              {savingTenantOverride ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save tenant override
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tenantId ? 'Overrides for selected tenant' : 'Active overrides'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {overridesLoading ? (
            <AdminLoadingState label="Loading overrides…" />
          ) : (
            <>
              {tenantId && (
                <div>
                  <p className="text-xs font-semibold uppercase text-[var(--text-muted)] mb-2">
                    Tenant overrides
                  </p>
                  {tenantOverridesForSelected.length === 0 ? (
                    <AdminEmptyState
                      title="No tenant overrides"
                      description="None configured for this tenant."
                    />
                  ) : (
                    <OverridesTable
                      rows={tenantOverridesForSelected}
                      kind="tenant"
                      tenantName={selectedTenant?.name}
                      onDisable={async (id) => {
                        if (!window.confirm('Disable this tenant override?')) return
                        try {
                          await updateTenantOverride({ id, is_active: false }).unwrap()
                          toast.success('Override disabled')
                          refetchOverrides()
                          refetchAddons()
                        } catch {
                          toast.error('Failed to disable override')
                        }
                      }}
                    />
                  )}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase text-[var(--text-muted)] mb-2">
                  Plan-tier overrides ({tenantType})
                </p>
                {planOverridesForType.length === 0 ? (
                  <AdminEmptyState
                    title="No plan overrides"
                    description={`No active plan overrides for ${tenantType.toLowerCase()} plans.`}
                  />
                ) : (
                  <OverridesTable
                    rows={planOverridesForType}
                    kind="plan"
                    onDisable={async (id) => {
                      if (!window.confirm('Disable this plan override?')) return
                      try {
                        await updatePlanOverride({ id, is_active: false }).unwrap()
                        toast.success('Plan override disabled')
                        refetchOverrides()
                      } catch {
                        toast.error('Failed to disable override')
                      }
                    }}
                  />
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function OverridesTable({
  rows,
  kind,
  tenantName,
  onDisable,
}: {
  rows: Array<Record<string, unknown>>
  kind: 'tenant' | 'plan'
  tenantName?: string
  onDisable: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-[var(--app-bg-subtle)]/50 text-left text-xs text-[var(--text-muted)]">
            {kind === 'plan' && <th className="px-3 py-2">Plan</th>}
            <th className="px-3 py-2">Limit</th>
            <th className="px-3 py-2">Value</th>
            {kind === 'tenant' && <th className="px-3 py-2">Tenant</th>}
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2">Updated</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={String(row.id)} className="hover:bg-[var(--brand-ultra)]/30">
              {kind === 'plan' && (
                <td className="px-3 py-2 font-medium">
                  {formatPlanCodeLabel(String(row.plan_code || ''))}
                </td>
              )}
              <td className="px-3 py-2">{formatLimitKeyLabel(String(row.limit_type))}</td>
              <td className="px-3 py-2">{String(row.override_value)}</td>
              {kind === 'tenant' && (
                <td className="px-3 py-2 text-[var(--text-muted)]">{tenantName ?? '—'}</td>
              )}
              <td className="px-3 py-2 text-[var(--text-muted)] max-w-[12rem] truncate">
                {String(row.reason || '—')}
              </td>
              <td className="px-3 py-2 text-[var(--text-muted)] text-xs">
                {formatAdminDateTime(row.updated_at || row.created_at)}
              </td>
              <td className="px-3 py-2">
                <AdminStatusBadge status={row.is_active === false ? 'inactive' : 'active'} />
              </td>
              <td className="px-3 py-2 text-right">
                {row.is_active !== false && (
                  <Button size="sm" variant="outline" onClick={() => onDisable(String(row.id))}>
                    Disable
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
