import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { StatusBadge } from '../ui/status-badge'
import { AppPanel, SummaryStrip } from '../ui/app-panel'
import { TableScroll } from '../ui/table-scroll'
import { Filter, Flag, Loader2, RefreshCw, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  useClearTenantFeatureOverrideMutation,
  useGetAdminFeatureFlagsQuery,
  useGetTenantFeatureOverridesQuery,
  useSetTenantFeatureOverrideMutation,
  useUpdateAdminFeatureFlagMutation,
} from '../../services/api'
import type { EffectiveFeature } from '../../types'
import { isRemovedFeatureKey } from '../../lib/removedFeatures'
import type { AdminTenantOption, AdminTenantType } from '../../lib/adminTenantSearch'
import { AdminTenantPicker } from './AdminTenantPicker'
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSkeleton,
  AdminSectionHeader,
} from './adminUi'
import { cn } from '../../lib/utils'

interface AdminFeatureFlagsPanelProps {
  tenants: AdminTenantOption[]
  tenantsLoading?: boolean
}

type GlobalModeFilter = 'all' | 'inherit' | 'on' | 'off'

function featureDisplayLabel(t: TFunction<'admin'>, featureKey: string, featureName: string) {
  const fromCatalog = t(`featureKeys.${featureKey}`, { defaultValue: '' })
  return fromCatalog || featureName
}

function globalModeLabel(t: TFunction<'admin'>, globalOverride: boolean | null) {
  if (globalOverride === true) return t('features.globalMode.onGlobal')
  if (globalOverride === false) return t('features.globalMode.offGlobal')
  return t('features.globalMode.inheritFromPlans')
}

function globalModeTone(globalOverride: boolean | null): string {
  if (globalOverride === true) {
    return 'bg-[var(--mint-pale)] text-[var(--mint)] border-[color-mix(in_srgb,var(--mint)_35%,transparent)]'
  }
  if (globalOverride === false) {
    return 'bg-[var(--red-pale)] text-[var(--red)] border-[color-mix(in_srgb,var(--red)_35%,transparent)]'
  }
  return 'bg-[var(--app-bg-subtle)] text-[var(--text-mid)] border-[var(--app-border)]'
}

function sourceLabel(t: TFunction<'admin'>, source: EffectiveFeature['source']) {
  const map: Record<EffectiveFeature['source'], string> = {
    tenant_override: t('features.source.tenantOverride'),
    global: t('features.source.global'),
    plan: t('features.source.plan'),
    default: t('features.source.default'),
  }
  return map[source] ?? source
}

function sourceTone(source: EffectiveFeature['source']): string {
  const map: Record<EffectiveFeature['source'], string> = {
    tenant_override:
      'bg-[var(--amber-pale)] text-[var(--amber)] border-[color-mix(in_srgb,var(--amber)_35%,transparent)]',
    global: 'bg-[var(--app-bg-subtle)] text-[var(--text)] border-[var(--app-border-mid)]',
    plan: 'bg-[var(--brand-ultra)] text-[var(--brand-mid)] border-[var(--app-border-mid)]',
    default: 'bg-[var(--app-bg-subtle)] text-[var(--text-mid)] border-[var(--app-border)]',
  }
  return (
    map[source] ?? 'bg-[var(--app-bg-subtle)] text-[var(--text-mid)] border-[var(--app-border)]'
  )
}

function matchesFeatureSearch(
  feature: { featureKey: string; featureName: string },
  query: string
): boolean {
  if (!query) return true
  const haystack = `${feature.featureName} ${feature.featureKey}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function isFeatureOn(enabled: unknown): boolean {
  if (enabled === true) return true
  if (enabled === false || enabled == null) return false
  if (typeof enabled === 'string') {
    return enabled !== 'false' && enabled !== 'disabled' && enabled !== ''
  }
  return Boolean(enabled)
}

function effectiveStatusLabel(t: TFunction<'admin'>, enabled: unknown): string {
  if (typeof enabled === 'string' && enabled !== 'true' && enabled !== 'false') {
    return enabled.replace(/_/g, ' ')
  }
  return isFeatureOn(enabled) ? t('features.effective.on') : t('features.effective.off')
}

export function AdminFeatureFlagsPanel({ tenants, tenantsLoading }: AdminFeatureFlagsPanelProps) {
  const { t } = useTranslation('admin')
  const {
    data: flagsData,
    isLoading: flagsLoading,
    isFetching: flagsFetching,
    isError: flagsError,
    refetch: refetchFlags,
  } = useGetAdminFeatureFlagsQuery()
  const [updateGlobalFlag, { isLoading: updatingGlobal }] = useUpdateAdminFeatureFlagMutation()

  const [globalSearch, setGlobalSearch] = useState('')
  const [debouncedGlobalSearch, setDebouncedGlobalSearch] = useState('')
  const [globalModeFilter, setGlobalModeFilter] = useState<GlobalModeFilter>('all')

  const [tenantType, setTenantType] = useState<AdminTenantType>('RESTAURANT')
  const [selectedTenant, setSelectedTenant] = useState<AdminTenantOption | null>(null)
  const [tenantFeatureSearch, setTenantFeatureSearch] = useState('')
  const [debouncedTenantFeatureSearch, setDebouncedTenantFeatureSearch] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedGlobalSearch(globalSearch.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [globalSearch])

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedTenantFeatureSearch(tenantFeatureSearch.trim()),
      300
    )
    return () => window.clearTimeout(timer)
  }, [tenantFeatureSearch])

  const selectedTenantId = selectedTenant?.id ?? ''

  const {
    data: tenantData,
    isLoading: tenantLoading,
    isFetching: tenantFetching,
    isError: tenantError,
    refetch: refetchTenant,
  } = useGetTenantFeatureOverridesQuery(
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

  const globalStats = useMemo(() => {
    let forcedOn = 0
    let forcedOff = 0
    let inherit = 0
    for (const flag of globalFlags) {
      if (flag.globalOverride === true) forcedOn += 1
      else if (flag.globalOverride === false) forcedOff += 1
      else inherit += 1
    }
    return { total: globalFlags.length, forcedOn, forcedOff, inherit }
  }, [globalFlags])

  const filteredGlobalFlags = useMemo(() => {
    return globalFlags.filter((flag) => {
      if (!matchesFeatureSearch(flag, debouncedGlobalSearch)) return false
      if (globalModeFilter === 'all') return true
      if (globalModeFilter === 'inherit') return flag.globalOverride === null
      if (globalModeFilter === 'on') return flag.globalOverride === true
      return flag.globalOverride === false
    })
  }, [globalFlags, debouncedGlobalSearch, globalModeFilter])

  const effectiveFeatures = useMemo(
    () => (tenantData?.effectiveFeatures ?? []).filter((f) => !isRemovedFeatureKey(f.featureKey)),
    [tenantData?.effectiveFeatures]
  )

  const filteredEffectiveFeatures = useMemo(() => {
    return effectiveFeatures.filter((feature) =>
      matchesFeatureSearch(feature, debouncedTenantFeatureSearch)
    )
  }, [effectiveFeatures, debouncedTenantFeatureSearch])

  const hasGlobalFilters = Boolean(debouncedGlobalSearch) || globalModeFilter !== 'all'
  const hasTenantFeatureFilter = Boolean(debouncedTenantFeatureSearch)

  const selectedTenantName = selectedTenant?.name ?? t('features.selectedTenant')

  const handleGlobalChange = async (featureKey: string, mode: 'inherit' | 'on' | 'off') => {
    try {
      await updateGlobalFlag({ featureKey, mode }).unwrap()
      toast.success(t('featuresToasts.globalUpdated', { key: featureKey, mode }))
      if (selectedTenantId) refetchTenant()
    } catch {
      toast.error(t('featuresToasts.updateFailed', { key: featureKey }))
    }
  }

  const handleTenantToggle = async (feature: EffectiveFeature, enabled: boolean) => {
    if (!selectedTenantId) return
    const label = featureDisplayLabel(t, feature.featureKey, feature.featureName)
    try {
      await setTenantOverride({
        tenantType,
        tenantId: selectedTenantId,
        featureKey: feature.featureKey,
        enabled,
      }).unwrap()
      toast.success(
        enabled
          ? t('featuresToasts.tenantEnabled', { name: label })
          : t('featuresToasts.tenantDisabled', { name: label })
      )
    } catch {
      toast.error(t('featuresToasts.tenantUpdateFailed', { name: label }))
    }
  }

  const handleClearOverride = async (featureKey: string) => {
    if (!selectedTenantId) return
    try {
      await clearTenantOverride({ tenantType, tenantId: selectedTenantId, featureKey }).unwrap()
      toast.success(t('featuresToasts.overrideCleared'))
    } catch {
      toast.error(t('featuresToasts.clearFailed'))
    }
  }

  const clearGlobalFilters = () => {
    setGlobalSearch('')
    setDebouncedGlobalSearch('')
    setGlobalModeFilter('all')
  }

  return (
    <>
      <AdminSectionHeader
        title={t('features.title')}
        description={t('features.description')}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchFlags()
              if (selectedTenantId) refetchTenant()
            }}
            disabled={flagsFetching || tenantFetching}
          >
            {flagsFetching || tenantFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        }
      />

      {!flagsLoading && !flagsError && globalFlags.length > 0 && (
        <div className="mb-4">
          <SummaryStrip
            testId="admin-feature-flags-stats"
            metrics={[
              {
                label: t('features.stats.totalFeatures'),
                value: globalStats.total,
                hint: t('features.stats.totalFeaturesHint'),
                tone: 'brand',
              },
              {
                label: t('features.stats.forcedOn'),
                value: globalStats.forcedOn,
                hint: t('features.stats.forcedOnHint'),
                tone: globalStats.forcedOn > 0 ? 'mint' : 'default',
                active: globalModeFilter === 'on',
                onClick: () => setGlobalModeFilter(globalModeFilter === 'on' ? 'all' : 'on'),
              },
              {
                label: t('features.stats.forcedOff'),
                value: globalStats.forcedOff,
                hint: t('features.stats.forcedOffHint'),
                tone: globalStats.forcedOff > 0 ? 'danger' : 'default',
                active: globalModeFilter === 'off',
                onClick: () => setGlobalModeFilter(globalModeFilter === 'off' ? 'all' : 'off'),
              },
              {
                label: t('features.stats.inheritPlans'),
                value: globalStats.inherit,
                hint: t('features.stats.inheritPlansHint'),
                tone: 'default',
                active: globalModeFilter === 'inherit',
                onClick: () =>
                  setGlobalModeFilter(globalModeFilter === 'inherit' ? 'all' : 'inherit'),
              },
            ]}
          />
        </div>
      )}

      <div className="mb-4 rounded-md border border-[var(--app-border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" />
          {t('features.globalFlagsFilter')}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <Input
                className="h-10 pl-9"
                placeholder={t('features.searchGlobalPlaceholder')}
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                aria-label={t('features.searchGlobalAriaLabel')}
              />
            </div>
            <select
              className="h-10 w-full min-w-[160px] cursor-pointer appearance-none rounded-lg border border-[var(--app-border-mid)] bg-[var(--surface)] px-3 py-2 text-sm sm:w-auto"
              value={globalModeFilter}
              onChange={(e) => setGlobalModeFilter(e.target.value as GlobalModeFilter)}
              aria-label={t('features.filterGlobalModeAriaLabel')}
            >
              <option value="all">{t('features.modeFilter.allModes')}</option>
              <option value="inherit">{t('features.modeFilter.inheritFromPlans')}</option>
              <option value="on">{t('features.modeFilter.forcedOn')}</option>
              <option value="off">{t('features.modeFilter.forcedOff')}</option>
            </select>
          </div>
          {hasGlobalFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 shrink-0 text-[var(--text-mid)]"
              onClick={clearGlobalFilters}
            >
              <X className="mr-1.5 h-4 w-4" />
              {t('common.clearFilters')}
            </Button>
          )}
        </div>
      </div>

      <AppPanel
        title={t('features.globalFlagsTitle')}
        description={
          flagsLoading
            ? t('features.loadingPlatformFlags')
            : t('features.flagsShown', {
                shown: filteredGlobalFlags.length,
                total: globalFlags.length,
                count: filteredGlobalFlags.length,
              })
        }
        testId="admin-global-feature-flags-panel"
        className="mb-4"
        footer={
          flagsFetching && !flagsLoading ? (
            <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('features.updatingFlags')}
            </p>
          ) : undefined
        }
      >
        {flagsLoading ? (
          <AdminLoadingSkeleton rows={6} />
        ) : flagsError ? (
          <AdminErrorState
            title={t('features.loadFailedTitle')}
            message={t('features.loadFailedMessage')}
            onRetry={() => refetchFlags()}
          />
        ) : filteredGlobalFlags.length === 0 ? (
          <AdminEmptyState
            icon={<Flag className="h-8 w-8 text-[var(--text-muted)]" />}
            title={
              hasGlobalFilters
                ? t('features.empty.noFlagsMatchTitle')
                : t('features.empty.noFlagsTitle')
            }
            description={
              hasGlobalFilters
                ? t('features.empty.noFlagsMatchDescription')
                : t('features.empty.noFlagsDescription')
            }
            action={
              hasGlobalFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={clearGlobalFilters}>
                  {t('common.clearFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="space-y-3 lg:hidden">
              {filteredGlobalFlags.map((flag) => (
                <article
                  key={flag.featureKey}
                  className="rounded-md border border-[var(--app-border)] p-4 space-y-2"
                >
                  <p className="font-medium">
                    {featureDisplayLabel(t, flag.featureKey, flag.featureName)}
                  </p>
                  <p className="font-mono text-xs text-[var(--text-muted)]">{flag.featureKey}</p>
                  <Badge
                    variant="outline"
                    className={cn('text-xs font-medium', globalModeTone(flag.globalOverride))}
                  >
                    {globalModeLabel(t, flag.globalOverride)}
                  </Badge>
                </article>
              ))}
            </div>
            <TableScroll
              aria-label={t('features.globalTableAriaLabel')}
              className="hidden lg:block"
            >
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    <th className="px-4 py-3">{t('features.table.feature')}</th>
                    <th className="px-4 py-3">{t('features.table.globalMode')}</th>
                    <th className="px-4 py-3 text-right">{t('common.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {filteredGlobalFlags.map((flag) => (
                    <tr
                      key={flag.featureKey}
                      className="transition-colors hover:bg-[var(--brand-ultra)]/35"
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-[var(--text)]">
                          {featureDisplayLabel(t, flag.featureKey, flag.featureName)}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">
                          {flag.featureKey}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className={cn('text-xs font-medium', globalModeTone(flag.globalOverride))}
                        >
                          {globalModeLabel(t, flag.globalOverride)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap justify-end gap-2">
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
                              {t(`features.actions.${mode}`)}
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </>
        )}
      </AppPanel>

      <div className="mb-4 rounded-md border border-[var(--app-border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" />
          {t('features.tenantOverridesFilter')}
        </div>
        <AdminTenantPicker
          tenantType={tenantType}
          onTenantTypeChange={(type) => {
            setTenantType(type)
            setSelectedTenant(null)
          }}
          tenants={tenants}
          selectedId={selectedTenantId}
          onSelect={setSelectedTenant}
          loading={tenantsLoading}
        />
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-mid)]">
            {t('features.featureSearch')}
          </label>
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <Input
              className="h-10 pl-9"
              placeholder={t('features.searchTenantPlaceholder')}
              value={tenantFeatureSearch}
              onChange={(e) => setTenantFeatureSearch(e.target.value)}
              aria-label={t('features.searchTenantAriaLabel')}
              disabled={!selectedTenantId}
            />
          </div>
        </div>
      </div>

      <AppPanel
        title={t('features.tenantOverridesTitle')}
        description={
          !selectedTenantId
            ? t('features.selectTenantHint')
            : tenantLoading
              ? t('features.loadingOverridesFor', { name: selectedTenantName })
              : t('features.featuresForTenant', {
                  shown: filteredEffectiveFeatures.length,
                  total: effectiveFeatures.length,
                  name: selectedTenantName,
                })
        }
        testId="admin-tenant-feature-overrides-panel"
        footer={
          tenantFetching && !tenantLoading && selectedTenantId ? (
            <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('features.updatingOverrides')}
            </p>
          ) : undefined
        }
      >
        {!selectedTenantId ? (
          <AdminEmptyState
            icon={<Flag className="h-8 w-8 text-[var(--text-muted)]" />}
            title={t('features.noTenantSelectedTitle')}
            description={t('features.noTenantSelectedDescription')}
          />
        ) : tenantLoading ? (
          <AdminLoadingSkeleton rows={6} />
        ) : tenantError ? (
          <AdminErrorState
            title={t('features.tenantLoadFailedTitle')}
            message={t('features.tenantLoadFailedMessage')}
            onRetry={() => refetchTenant()}
          />
        ) : filteredEffectiveFeatures.length === 0 ? (
          <AdminEmptyState
            icon={<Flag className="h-8 w-8 text-[var(--text-muted)]" />}
            title={
              hasTenantFeatureFilter
                ? t('features.empty.noFeaturesMatchTitle')
                : t('features.empty.noFeaturesTitle')
            }
            description={
              hasTenantFeatureFilter
                ? t('features.empty.noFeaturesMatchDescription')
                : t('features.empty.noFeaturesDescription')
            }
            action={
              hasTenantFeatureFilter ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTenantFeatureSearch('')
                    setDebouncedTenantFeatureSearch('')
                  }}
                >
                  {t('common.clearSearch')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="space-y-3 lg:hidden">
              {filteredEffectiveFeatures.map((feature) => (
                <article
                  key={feature.featureKey}
                  className="rounded-md border border-[var(--app-border)] p-4 space-y-2"
                >
                  <p className="font-medium">
                    {featureDisplayLabel(t, feature.featureKey, feature.featureName)}
                  </p>
                  <p className="font-mono text-xs text-[var(--text-muted)]">{feature.featureKey}</p>
                  <StatusBadge status={feature.enabled ? 'ACTIVE' : 'INACTIVE'} />
                </article>
              ))}
            </div>
            <TableScroll
              aria-label={t('features.tenantTableAriaLabel')}
              className="hidden lg:block"
            >
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    <th className="px-4 py-3">{t('features.table.feature')}</th>
                    <th className="px-4 py-3">{t('features.table.effective')}</th>
                    <th className="px-4 py-3">{t('features.table.source')}</th>
                    <th className="px-4 py-3 text-right">{t('common.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {filteredEffectiveFeatures.map((feature) => {
                    const on = isFeatureOn(feature.enabled)
                    return (
                      <tr
                        key={feature.featureKey}
                        className="transition-colors hover:bg-[var(--brand-ultra)]/35"
                      >
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-[var(--text)]">
                            {featureDisplayLabel(t, feature.featureKey, feature.featureName)}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">
                            {feature.featureKey}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge
                            status={on ? 'ACTIVE' : 'INACTIVE'}
                            label={effectiveStatusLabel(t, feature.enabled)}
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge
                            variant="outline"
                            className={cn('text-xs font-medium', sourceTone(feature.source))}
                          >
                            {sourceLabel(t, feature.source)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={savingOverride || clearingOverride}
                              onClick={() => handleTenantToggle(feature, true)}
                            >
                              {t('features.actions.forceOn')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={savingOverride || clearingOverride}
                              onClick={() => handleTenantToggle(feature, false)}
                            >
                              {t('features.actions.forceOff')}
                            </Button>
                            {feature.source === 'tenant_override' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={savingOverride || clearingOverride}
                                onClick={() => handleClearOverride(feature.featureKey)}
                              >
                                {t('features.actions.clearOverride')}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableScroll>
          </>
        )}
      </AppPanel>
    </>
  )
}
