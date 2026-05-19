import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select'
import { useGetTenantAuditLogFiltersQuery, useGetTenantAuditLogsQuery } from '../services/api'
import { downloadCsv } from '../utils/csvExport'
import { Loader2, Download } from 'lucide-react'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:4000')

type ActivityLogTabProps = {
  canExport?: boolean
}

export function ActivityLogTab({ canExport = false }: ActivityLogTabProps) {
  const [action, setAction] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data: filterOptions } = useGetTenantAuditLogFiltersQuery()
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

  const { data, isLoading, refetch } = useGetTenantAuditLogsQuery(filters)
  const logs = data?.logs || []

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
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'audit-log.csv'
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Audit log exported')
    } catch {
      toast.error('Failed to export audit log')
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
      ['Time', 'Action', 'Resource', 'User', 'Email'],
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
        <CardTitle>Activity log</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleQuickCsv}>
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              Export (server)
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger placeholder="All actions">
                <SelectContent>
                  <SelectItem value="">All actions</SelectItem>
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
            <Label>Resource type</Label>
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger placeholder="All resources">
                <SelectContent>
                  <SelectItem value="">All resources</SelectItem>
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
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : logs.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)] space-y-2 py-2">
            <p>No activity recorded for these filters.</p>
            {hasFilters ? (
              <p>
                Try{' '}
                <button
                  type="button"
                  className="underline text-[var(--brand-mid)]"
                  onClick={clearFilters}
                >
                  clearing filters
                </button>{' '}
                or widening the date range. Seeded demo orders do not appear until you run{' '}
                <code className="text-xs">pnpm run seed:audit-backfill</code> or place a new order
                in the app.
              </p>
            ) : (
              <p>
                The log only records actions through the app (e.g. placing an order). For tier demo
                data, run <code className="text-xs">pnpm run seed:audit-backfill</code> once, then
                refresh.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[var(--text-muted)]">
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Resource</th>
                  <th className="py-2">User</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={String(row.id)} className="border-b border-[var(--app-border)]">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {row.created_at ? new Date(String(row.created_at)).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 pr-4">{String(row.action_label || row.action || '')}</td>
                    <td className="py-2 pr-4">
                      {String(row.resource_type_label || row.resource_type || '—')}
                      {row.resource_id ? (
                        <span className="block text-xs text-[var(--text-muted)] truncate max-w-[140px]">
                          {String(row.resource_id)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <span className="font-medium">{String(row.user_name || '—')}</span>
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
            Showing {logs.length} of {data.total} entries. Refine filters or use server export for
            more.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
