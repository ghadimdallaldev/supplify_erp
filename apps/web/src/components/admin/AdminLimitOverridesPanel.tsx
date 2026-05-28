import { useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  useGetAdminLimitKeysQuery,
  useGetAdminLimitOverridesQuery,
  useCreateAdminPlanLimitOverrideMutation,
  useUpdateAdminTenantLimitOverrideMutation,
  useUpdateAdminPlanLimitOverrideMutation,
} from '../../services/api'
import toast from 'react-hot-toast'
import { Loader2, Search } from 'lucide-react'
import { AdminEmptyState, AdminLoadingState, AdminStatusBadge } from './adminUi'

export function AdminLimitOverridesPanel() {
  const [tenantType, setTenantType] = useState<'RESTAURANT' | 'SUPPLIER'>('RESTAURANT')
  const [planId, setPlanId] = useState('')
  const [limitKey, setLimitKey] = useState('')
  const [overrideValue, setOverrideValue] = useState('')
  const [reason, setReason] = useState('')
  const [overrideSearch, setOverrideSearch] = useState('')
  const [overrideScope, setOverrideScope] = useState<'all' | 'tenant' | 'plan'>('all')

  const { data: keysData } = useGetAdminLimitKeysQuery({ tenantType })
  const { data, isLoading, refetch } = useGetAdminLimitOverridesQuery({})
  const [createPlanOverride, { isLoading: saving }] = useCreateAdminPlanLimitOverrideMutation()
  const [updateTenantOverride] = useUpdateAdminTenantLimitOverrideMutation()
  const [updatePlanOverride] = useUpdateAdminPlanLimitOverrideMutation()

  const keys = keysData?.keys || []
  const tenantOverrides = data?.tenantOverrides || []
  const planOverrides = data?.planOverrides || []

  const q = overrideSearch.trim().toLowerCase()
  const filteredTenantOverrides = useMemo(() => {
    if (overrideScope === 'plan') return []
    return tenantOverrides.filter((row) => {
      if (!q) return true
      return (
        String(row.limit_type).toLowerCase().includes(q) ||
        String(row.tenant_id).toLowerCase().includes(q) ||
        String(row.tenant_type).toLowerCase().includes(q) ||
        String(row.reason || '')
          .toLowerCase()
          .includes(q)
      )
    })
  }, [tenantOverrides, q, overrideScope])

  const filteredPlanOverrides = useMemo(() => {
    if (overrideScope === 'tenant') return []
    return planOverrides.filter((row) => {
      if (!q) return true
      return (
        String(row.limit_type).toLowerCase().includes(q) ||
        String(row.plan_code || row.plan_name || '')
          .toLowerCase()
          .includes(q) ||
        String(row.reason || '')
          .toLowerCase()
          .includes(q)
      )
    })
  }, [planOverrides, q, overrideScope])

  const handleCreatePlanOverride = async () => {
    if (!planId.trim() || !limitKey || !overrideValue) {
      toast.error('Plan ID, limit key, and value are required')
      return
    }
    try {
      await createPlanOverride({
        planId: planId.trim(),
        limit_type: limitKey,
        override_value: Number(overrideValue),
        reason: reason || null,
      }).unwrap()
      toast.success('Plan override saved')
      setOverrideValue('')
      setReason('')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to save override')
    }
  }

  const disableTenantOverride = async (id: string) => {
    try {
      await updateTenantOverride({ id, is_active: false }).unwrap()
      toast.success('Tenant override disabled')
      refetch()
    } catch {
      toast.error('Failed to disable override')
    }
  }

  const disablePlanOverride = async (id: string) => {
    try {
      await updatePlanOverride({ id, is_active: false }).unwrap()
      toast.success('Plan override disabled')
      refetch()
    } catch {
      toast.error('Failed to disable override')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--text)]">Limit overrides</h2>
        <p className="text-sm text-[var(--text-muted)]">
          View and manage plan-tier and tenant-specific limit increases. Overrides cannot reduce
          limits below the plan default.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add plan-tier override</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Tenant type</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              value={tenantType}
              onChange={(e) => setTenantType(e.target.value as 'RESTAURANT' | 'SUPPLIER')}
            >
              <option value="RESTAURANT">Restaurant</option>
              <option value="SUPPLIER">Supplier</option>
            </select>
          </div>
          <div>
            <Label>Plan ID (UUID)</Label>
            <Input
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              placeholder="Plan UUID"
            />
          </div>
          <div>
            <Label>Limit key</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              value={limitKey}
              onChange={(e) => setLimitKey(e.target.value)}
            >
              <option value="">Select limit key</option>
              {keys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Override value</Label>
            <Input
              type="number"
              min={0}
              value={overrideValue}
              onChange={(e) => setOverrideValue(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Reason / note</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button onClick={handleCreatePlanOverride} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save plan override'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div>
              <Label>Scope</Label>
              <select
                className="mt-1 h-9 rounded-md border px-2 text-sm"
                value={overrideScope}
                onChange={(e) => setOverrideScope(e.target.value as 'all' | 'tenant' | 'plan')}
              >
                <option value="all">All overrides</option>
                <option value="tenant">Tenant only</option>
                <option value="plan">Plan tier only</option>
              </select>
            </div>
            <div className="flex-1 min-w-[12rem]">
              <Label>Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-2 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Limit key, tenant ID, plan, reason…"
                  value={overrideSearch}
                  onChange={(e) => setOverrideSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <AdminLoadingState label="Loading overrides…" />
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold uppercase text-[var(--text-muted)] mb-2">
                  Tenant overrides ({filteredTenantOverrides.length})
                </p>
                {filteredTenantOverrides.length === 0 ? (
                  <AdminEmptyState
                    title="No tenant overrides"
                    description={
                      tenantOverrides.length === 0
                        ? 'No limit overrides have been added for individual tenants yet.'
                        : 'No tenant overrides match your search.'
                    }
                  />
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-[var(--app-bg-subtle)]/50 text-left text-xs text-[var(--text-muted)]">
                          <th className="px-3 py-2">Limit key</th>
                          <th className="px-3 py-2">Value</th>
                          <th className="px-3 py-2">Tenant</th>
                          <th className="px-3 py-2">Reason</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredTenantOverrides.map((row) => (
                          <tr key={String(row.id)} className="hover:bg-[var(--brand-ultra)]/30">
                            <td className="px-3 py-2 font-medium">{String(row.limit_type)}</td>
                            <td className="px-3 py-2">{String(row.override_value)}</td>
                            <td className="px-3 py-2 text-[var(--text-muted)]">
                              {String(row.tenant_type)} · {String(row.tenant_id).slice(0, 8)}…
                            </td>
                            <td className="px-3 py-2 text-[var(--text-muted)] max-w-[10rem] truncate">
                              {String(row.reason || '—')}
                            </td>
                            <td className="px-3 py-2">
                              <AdminStatusBadge
                                status={row.is_active === false ? 'inactive' : 'active'}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              {row.is_active !== false && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => disableTenantOverride(String(row.id))}
                                >
                                  Disable
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-[var(--text-muted)] mb-2">
                  Plan overrides ({filteredPlanOverrides.length})
                </p>
                {filteredPlanOverrides.length === 0 ? (
                  <AdminEmptyState
                    title="No plan overrides"
                    description={
                      planOverrides.length === 0
                        ? 'No plan-tier limit overrides configured yet.'
                        : 'No plan overrides match your search.'
                    }
                  />
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-[var(--app-bg-subtle)]/50 text-left text-xs text-[var(--text-muted)]">
                          <th className="px-3 py-2">Plan</th>
                          <th className="px-3 py-2">Limit key</th>
                          <th className="px-3 py-2">Value</th>
                          <th className="px-3 py-2">Reason</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredPlanOverrides.map((row) => (
                          <tr key={String(row.id)} className="hover:bg-[var(--brand-ultra)]/30">
                            <td className="px-3 py-2 font-medium">
                              {String(row.plan_code || row.plan_name || '—')}
                            </td>
                            <td className="px-3 py-2">{String(row.limit_type)}</td>
                            <td className="px-3 py-2">{String(row.override_value)}</td>
                            <td className="px-3 py-2 text-[var(--text-muted)] max-w-[10rem] truncate">
                              {String(row.reason || '—')}
                            </td>
                            <td className="px-3 py-2">
                              <AdminStatusBadge
                                status={row.is_active === false ? 'inactive' : 'active'}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              {row.is_active !== false && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => disablePlanOverride(String(row.id))}
                                >
                                  Disable
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
