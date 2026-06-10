import React, { Fragment, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Search, Shield } from 'lucide-react'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Input } from '../../ui/input'
import { Select, SelectTrigger } from '../../ui/select'
import { useGetAdminAuditLogsQuery } from '../../../services/api'

const AUDIT_PAGE_SIZE = 20

export type AdminAuditTabProps = {
  active: boolean
}

export function AdminAuditTab({ active }: AdminAuditTabProps) {
  const [auditActionType, setAuditActionType] = useState('all')
  const [auditDateFrom, setAuditDateFrom] = useState('')
  const [auditDateTo, setAuditDateTo] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditExpandedId, setAuditExpandedId] = useState<string | null>(null)

  const {
    data: auditLogsData,
    isLoading: auditLoading,
    refetch: refetchAudit,
  } = useGetAdminAuditLogsQuery(
    {
      limit: AUDIT_PAGE_SIZE,
      offset: auditOffset,
      ...(auditActionType !== 'all' && { actionType: auditActionType }),
      ...(auditDateFrom && { dateFrom: auditDateFrom }),
      ...(auditDateTo && { dateTo: auditDateTo }),
      ...(auditSearch && { search: auditSearch }),
    },
    { skip: !active }
  )

  return (
    <>
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
        <Select
          value={auditActionType}
          onValueChange={(value) => {
            setAuditActionType(value)
            setAuditOffset(0)
          }}
        >
          <SelectTrigger className="w-auto min-w-[160px]">
            <option value="all">All action types</option>
            {auditLogsData?.actionTypes?.map((t: string) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectTrigger>
        </Select>
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

      {!auditLoading && auditLogsData && (
        <p className="text-sm text-[var(--text-muted)] mb-3">
          {auditLogsData.total ?? auditLogsData.logs?.length ?? 0} total entries
          {auditOffset > 0 &&
            ` · showing ${auditOffset + 1}–${Math.min(auditOffset + AUDIT_PAGE_SIZE, auditLogsData.total ?? 0)}`}
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
                    <Fragment key={log.id}>
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
                        <td className="px-4 py-3 text-[var(--text)]">{log.admin_name || '—'}</td>
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
                        <tr key={`${log.id}-detail`} style={{ background: 'var(--surface-mid)' }}>
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
                                  <p className="text-[var(--text)] font-mono">{log.ip_address}</p>
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
                                        <p className="text-red-600 font-semibold mb-1">Before</p>
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
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {(auditLogsData.total ?? 0) > AUDIT_PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={auditOffset === 0}
                onClick={() => setAuditOffset(Math.max(0, auditOffset - AUDIT_PAGE_SIZE))}
              >
                Previous
              </Button>
              <span className="text-sm text-[var(--text-muted)]">
                Page {Math.floor(auditOffset / AUDIT_PAGE_SIZE) + 1} of{' '}
                {Math.ceil((auditLogsData.total ?? 0) / AUDIT_PAGE_SIZE)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={auditOffset + AUDIT_PAGE_SIZE >= (auditLogsData.total ?? 0)}
                onClick={() => setAuditOffset(auditOffset + AUDIT_PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
