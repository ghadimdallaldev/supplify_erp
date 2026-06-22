import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select'
import {
  useGetEntitlementsQuery,
  useGetTenantAuditLogFiltersQuery,
  useGetTenantAuditLogsQuery,
} from '../services/api'
import { isEntitlementFeatureEnabled } from '../lib/planLimits'
import { downloadCsv } from '../utils/csvExport'
import { getApiBase } from '../lib/env'

const API_URL = getApiBase()
const AUDIT_BACKFILL_COMMAND = 'pnpm run seed:audit-backfill'

type ActivityLogTabProps = {
  canExport?: boolean
}

export function ActivityLogTab({ canExport = false }: ActivityLogTabProps) {
  const { t, i18n } = useTranslation('settings')
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const tenantAuditEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'tenant_audit_log'
  )

  const [action, setAction] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data: filterOptions } = useGetTenantAuditLogFiltersQuery(undefined, {
    skip: !tenantAuditEnabled,
  })
  const actionOptions = filterOptions?.actions ?? []
  const resourceOptions = filterOptions?.resourceTypes ?? []

  const filters = useMemo(
    () => ({
      action: action || undefined,
      resourceType: resourceType || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: 50,
      offset: 0,
    }),
    [action, resourceType, from, to]
  )

  const { data, isLoading, refetch } = useGetTenantAuditLogsQuery(filters, {
    skip: !tenantAuditEnabled,
  })
  const logs = data?.logs || []
  const emptyValue = t('activityLog.emptyValue')

  if (!tenantAuditEnabled) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-[var(--text-muted)]">
          {t('activityLog.locked')}
        </CardContent>
      </Card>
    )
  }

  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      if (action) params.set('action', action)
      if (resourceType) params.set('resourceType', resourceType)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`${API_URL}/api/audit/logs/export?${params}`, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'Supplify' },
      })
      if (!res.ok) throw new Error(t('activityLog.errors.exportFailed'))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'audit-log.csv'
      link.click()
      URL.revokeObjectURL(url)
      toast.success(t('activityLog.toasts.exported'))
    } catch {
      toast.error(t('activityLog.toasts.exportFailed'))
    }
  }

  const hasFilters = Boolean(action || resourceType || from || to)

  const clearFilters = () => {
    setAction('')
    setResourceType('')
    setFrom('')
    setTo('')
  }

  const handleQuickCsv = () => {
    downloadCsv(
      'activity-log.csv',
      [
        t('activityLog.csv.time'),
        t('activityLog.csv.action'),
        t('activityLog.csv.resource'),
        t('activityLog.csv.user'),
        t('activityLog.csv.email'),
      ],
      logs.map((row) => [
        String(row.created_at || ''),
        String(row.action_label || row.action || ''),
        String(row.resource_type_label || row.resource_type || ''),
        String(row.user_name || ''),
        String(row.user_email || ''),
      ])
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>{t('activityLog.title')}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            {t('activityLog.refresh')}
          </Button>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              {t('activityLog.clearFilters')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleQuickCsv}>
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              {t('activityLog.exportServer')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>{t('activityLog.labels.action')}</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger placeholder={t('activityLog.filters.allActions')}>
                <SelectContent>
                  <SelectItem value="">{t('activityLog.filters.allActions')}</SelectItem>
                  {actionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectTrigger>
            </Select>
          </div>
          <div>
            <Label>{t('activityLog.labels.resourceType')}</Label>
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger placeholder={t('activityLog.filters.allResources')}>
                <SelectContent>
                  <SelectItem value="">{t('activityLog.filters.allResources')}</SelectItem>
                  {resourceOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectTrigger>
            </Select>
          </div>
          <div>
            <Label>{t('activityLog.labels.from')}</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>{t('activityLog.labels.to')}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : logs.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)] space-y-2 py-2">
            <p>{t('activityLog.empty.title')}</p>
            {hasFilters ? (
              <p>
                {t('activityLog.empty.filteredPrefix')}{' '}
                <button
                  type="button"
                  className="underline text-[var(--brand-mid)]"
                  onClick={clearFilters}
                >
                  {t('activityLog.empty.clearFiltersLink')}
                </button>{' '}
                {t('activityLog.empty.filteredSuffix', {
                  command: AUDIT_BACKFILL_COMMAND,
                })}
              </p>
            ) : (
              <p>
                {t('activityLog.empty.defaultPrefix', {
                  command: AUDIT_BACKFILL_COMMAND,
                })}
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[var(--text-muted)]">
                  <th className="py-2 pr-4">{t('activityLog.table.time')}</th>
                  <th className="py-2 pr-4">{t('activityLog.table.action')}</th>
                  <th className="py-2 pr-4">{t('activityLog.table.resource')}</th>
                  <th className="py-2">{t('activityLog.table.user')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={String(row.id)} className="border-b border-[var(--app-border)]">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {row.created_at
                        ? new Date(String(row.created_at)).toLocaleString(i18n.language)
                        : emptyValue}
                    </td>
                    <td className="py-2 pr-4">{String(row.action_label || row.action || '')}</td>
                    <td className="py-2 pr-4">
                      {String(row.resource_type_label || row.resource_type || emptyValue)}
                      {row.resource_id ? (
                        <span className="block text-xs text-[var(--text-muted)] truncate max-w-[140px]">
                          {String(row.resource_id)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <span className="font-medium">{String(row.user_name || emptyValue)}</span>
                      {row.user_email ? (
                        <span className="block text-xs text-[var(--text-muted)]">
                          {String(row.user_email)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data?.total != null && data.total > logs.length ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t('activityLog.pagination', { shown: logs.length, total: data.total })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
