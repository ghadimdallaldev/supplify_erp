import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Loader2, Flag } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  useClearTenantFeatureOverrideMutation,
  useGetAdminFeatureFlagsQuery,
  useGetTenantFeatureOverridesQuery,
  useSetTenantFeatureOverrideMutation,
  useUpdateAdminFeatureFlagMutation,
} from '../../services/api'
import type { EffectiveFeature } from '../../types'
import { isRemovedFeatureKey } from '../../lib/removedFeatures'

type TenantType = 'RESTAURANT' | 'SUPPLIER'

interface TenantOption {
  id: string
  name: string
}

interface AdminFeatureFlagsPanelProps {
  restaurants: TenantOption[]
  suppliers: TenantOption[]
}

function globalModeLabel(globalOverride: boolean | null) {
  if (globalOverride === true) return 'On (global)'
  if (globalOverride === false) return 'Off (global)'
  return 'Inherit from plans'
}

function sourceBadge(source: EffectiveFeature['source']) {
  const map: Record<EffectiveFeature['source'], string> = {
    tenant_override: 'Tenant override',
    global: 'Global',
    plan: 'Plan',
    default: 'Default',
  }
  return map[source] ?? source
}

export function AdminFeatureFlagsPanel({ restaurants, suppliers }: AdminFeatureFlagsPanelProps) {
  const { data: flagsData, isLoading: flagsLoading } = useGetAdminFeatureFlagsQuery()
  const [updateGlobalFlag, { isLoading: updatingGlobal }] = useUpdateAdminFeatureFlagMutation()

  const [tenantType, setTenantType] = useState<TenantType>('RESTAURANT')
  const [tenantId, setTenantId] = useState('')

  const tenantOptions = tenantType === 'RESTAURANT' ? restaurants : suppliers
  const selectedTenantId = tenantId || tenantOptions[0]?.id || ''

  const { data: tenantData, isLoading: tenantLoading } = useGetTenantFeatureOverridesQuery(
    { tenantType, tenantId: selectedTenantId },
    { skip: !selectedTenantId }
  )

  const [setTenantOverride, { isLoading: savingOverride }] = useSetTenantFeatureOverrideMutation()
  const [clearTenantOverride, { isLoading: clearingOverride }] =
    useClearTenantFeatureOverrideMutation()

  const globalFlags = useMemo(
    () => (flagsData?.flags ?? []).filter((f) => !isRemovedFeatureKey(f.featureKey)),
    [flagsData?.flags]
  )

  const effectiveFeatures = useMemo(
    () =>
      (tenantData?.effectiveFeatures ?? []).filter((f) => !isRemovedFeatureKey(f.featureKey)),
    [tenantData?.effectiveFeatures]
  )

  const handleGlobalChange = async (featureKey: string, mode: 'inherit' | 'on' | 'off') => {
    try {
      await updateGlobalFlag({ featureKey, mode }).unwrap()
      toast.success(`Global ${featureKey}: ${mode}`)
    } catch {
      toast.error(`Failed to update ${featureKey}`)
    }
  }

  const handleTenantToggle = async (feature: EffectiveFeature, enabled: boolean) => {
    if (!selectedTenantId) return
    try {
      await setTenantOverride({
        tenantType,
        tenantId: selectedTenantId,
        featureKey: feature.featureKey,
        enabled,
      }).unwrap()
      toast.success(`${feature.featureName} ${enabled ? 'enabled' : 'disabled'} for tenant`)
    } catch {
      toast.error(`Failed to update ${feature.featureName}`)
    }
  }

  const handleClearOverride = async (featureKey: string) => {
    if (!selectedTenantId) return
    try {
      await clearTenantOverride({ tenantType, tenantId: selectedTenantId, featureKey }).unwrap()
      toast.success('Override cleared')
    } catch {
      toast.error('Failed to clear override')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-violet-600" />
            Global feature flags
          </CardTitle>
          <p className="text-sm text-[var(--text-muted)]">
            Force features on or off for all tenants, or inherit from each subscription plan.
          </p>
        </CardHeader>
        <CardContent>
          {flagsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[var(--text-muted)]">
                    <th className="py-2 pr-4 font-medium">Feature</th>
                    <th className="py-2 pr-4 font-medium">Global</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {globalFlags.map((flag) => (
                    <tr key={flag.featureKey} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-[var(--text)]">{flag.featureName}</div>
                        <div className="text-xs text-[var(--text-muted)]">{flag.featureKey}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">{globalModeLabel(flag.globalOverride)}</Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          {(['inherit', 'on', 'off'] as const).map((mode) => (
                            <Button
                              key={mode}
                              size="sm"
                              variant={
                                (mode === 'inherit' && flag.globalOverride === null) ||
                                (mode === 'on' && flag.globalOverride === true) ||
                                (mode === 'off' && flag.globalOverride === false)
                                  ? 'default'
                                  : 'outline'
                              }
                              disabled={updatingGlobal}
                              onClick={() => handleGlobalChange(flag.featureKey, mode)}
                            >
                              {mode}
                            </Button>
                          ))}
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

      <Card>
        <CardHeader>
          <CardTitle>Per-tenant overrides</CardTitle>
          <p className="text-sm text-[var(--text-muted)]">
            Overrides win over global settings and plan features for a single restaurant or
            supplier.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-mid)]">
                Tenant type
              </label>
              <select
                className="rounded-md border border-[var(--app-border-mid)] px-3 py-2 text-sm"
                value={tenantType}
                onChange={(e) => {
                  setTenantType(e.target.value as TenantType)
                  setTenantId('')
                }}
              >
                <option value="RESTAURANT">Restaurant</option>
                <option value="SUPPLIER">Supplier</option>
              </select>
            </div>
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-sm font-medium text-[var(--text-mid)]">
                Tenant
              </label>
              <select
                className="w-full rounded-md border border-[var(--app-border-mid)] px-3 py-2 text-sm"
                value={selectedTenantId}
                onChange={(e) => setTenantId(e.target.value)}
              >
                {tenantOptions.length === 0 ? (
                  <option value="">No tenants</option>
                ) : (
                  tenantOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {!selectedTenantId ? (
            <p className="text-sm text-[var(--text-muted)]">Select a tenant to manage overrides.</p>
          ) : tenantLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[var(--text-muted)]">
                    <th className="py-2 pr-4 font-medium">Feature</th>
                    <th className="py-2 pr-4 font-medium">Effective</th>
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveFeatures.map((feature) => (
                    <tr key={feature.featureKey} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium text-[var(--text)]">
                        {feature.featureName}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={feature.enabled ? 'default' : 'secondary'}>
                          {feature.enabled ? 'On' : 'Off'}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-[var(--text-muted)]">
                        {sourceBadge(feature.source)}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingOverride || clearingOverride}
                            onClick={() => handleTenantToggle(feature, true)}
                          >
                            Force on
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingOverride || clearingOverride}
                            onClick={() => handleTenantToggle(feature, false)}
                          >
                            Force off
                          </Button>
                          {feature.source === 'tenant_override' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={savingOverride || clearingOverride}
                              onClick={() => handleClearOverride(feature.featureKey)}
                            >
                              Clear override
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
    </div>
  )
}
