import { useState } from 'react'
import { motion } from 'framer-motion'
import { Badge } from '../ui/badge'
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
import { Loader2 } from 'lucide-react'

export function AdminLimitOverridesPanel() {
  const [tenantType, setTenantType] = useState<'RESTAURANT' | 'SUPPLIER'>('RESTAURANT')
  const [planId, setPlanId] = useState('')
  const [limitKey, setLimitKey] = useState('')
  const [overrideValue, setOverrideValue] = useState('')
  const [reason, setReason] = useState('')

  const { data: keysData } = useGetAdminLimitKeysQuery({ tenantType })
  const { data, isLoading, refetch } = useGetAdminLimitOverridesQuery({})
  const [createPlanOverride, { isLoading: saving }] = useCreateAdminPlanLimitOverrideMutation()
  const [updateTenantOverride] = useUpdateAdminTenantLimitOverrideMutation()
  const [updatePlanOverride] = useUpdateAdminPlanLimitOverrideMutation()

  const keys = keysData?.keys || []
  const tenantOverrides = data?.tenantOverrides || []
  const planOverrides = data?.planOverrides || []

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
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <motion.div>
        <h2 className="text-lg font-bold text-[var(--text)]">Limit overrides</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Increase plan or tenant limits for testing. Overrides cannot reduce limits below the plan
          default.
        </p>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add plan-tier override</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <motion.div>
            <Label>Tenant type</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              value={tenantType}
              onChange={(e) => setTenantType(e.target.value as 'RESTAURANT' | 'SUPPLIER')}
            >
              <option value="RESTAURANT">Restaurant</option>
              <option value="SUPPLIER">Supplier</option>
            </select>
          </motion.div>
          <motion.div>
            <Label>Plan ID (UUID)</Label>
            <Input
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              placeholder="Plan UUID"
            />
          </motion.div>
          <motion.div>
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
          </motion.div>
          <motion.div>
            <Label>Override value</Label>
            <Input
              type="number"
              min={0}
              value={overrideValue}
              onChange={(e) => setOverrideValue(e.target.value)}
            />
          </motion.div>
          <motion.div className="md:col-span-2">
            <Label>Reason / note</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </motion.div>
          <Button onClick={handleCreatePlanOverride} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save plan override'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active overrides</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <div className="space-y-4">
              <motion.div>
                <p className="text-xs font-semibold uppercase text-[var(--text-muted)] mb-2">
                  Tenant overrides
                </p>
                {tenantOverrides.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">None</p>
                ) : (
                  tenantOverrides.map((row) => (
                    <div
                      key={String(row.id)}
                      className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-3 mb-2"
                    >
                      <motion.div>
                        <p className="font-medium text-sm">
                          {String(row.limit_type)} → {String(row.override_value)}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {String(row.tenant_type)} · {String(row.tenant_id).slice(0, 8)}…
                          {row.reason ? ` · ${String(row.reason)}` : ''}
                        </p>
                      </motion.div>
                      <motion.div className="flex items-center gap-2">
                        <Badge variant={row.is_active === false ? 'outline' : 'secondary'}>
                          {row.is_active === false ? 'inactive' : 'active'}
                        </Badge>
                        {row.is_active !== false ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => disableTenantOverride(String(row.id))}
                          >
                            Disable
                          </Button>
                        ) : null}
                      </motion.div>
                    </div>
                  ))
                )}
              </motion.div>
              <motion.div>
                <p className="text-xs font-semibold uppercase text-[var(--text-muted)] mb-2">
                  Plan overrides
                </p>
                {planOverrides.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">None</p>
                ) : (
                  planOverrides.map((row) => (
                    <div
                      key={String(row.id)}
                      className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-3 mb-2"
                    >
                      <motion.div>
                        <p className="font-medium text-sm">
                          {String(row.plan_code || row.plan_name)} · {String(row.limit_type)} →{' '}
                          {String(row.override_value)}
                        </p>
                        {row.reason ? (
                          <p className="text-xs text-[var(--text-muted)]">{String(row.reason)}</p>
                        ) : null}
                      </motion.div>
                      <motion.div className="flex items-center gap-2">
                        <Badge variant={row.is_active === false ? 'outline' : 'secondary'}>
                          {row.is_active === false ? 'inactive' : 'active'}
                        </Badge>
                        {row.is_active !== false ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => disablePlanOverride(String(row.id))}
                          >
                            Disable
                          </Button>
                        ) : null}
                      </motion.div>
                    </div>
                  ))
                )}
              </motion.div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
