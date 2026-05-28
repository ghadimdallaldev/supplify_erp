import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Button } from '../ui/button'
import { ChevronDown, Search, X } from 'lucide-react'
import {
  filterAdminTenants,
  type AdminTenantOption,
  type AdminTenantType,
} from '../../lib/adminTenantSearch'
import { formatPlanCodeLabel } from '../../lib/adminLimitLabels'
import { AdminStatusBadge } from './adminUi'

type Props = {
  tenantType: AdminTenantType
  onTenantTypeChange: (type: AdminTenantType) => void
  tenants: AdminTenantOption[]
  selectedId: string
  onSelect: (tenant: AdminTenantOption | null) => void
  loading?: boolean
  orgMainOnly?: boolean
  onOrgMainOnlyChange?: (value: boolean) => void
  showTypeFilter?: boolean
}

export function AdminTenantPicker({
  tenantType,
  onTenantTypeChange,
  tenants,
  selectedId,
  onSelect,
  loading,
  orgMainOnly = false,
  onOrgMainOnlyChange,
  showTypeFilter = true,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const scopedTenants = useMemo(
    () => tenants.filter((t) => t.tenantType === tenantType),
    [tenants, tenantType]
  )

  const filtered = useMemo(
    () => filterAdminTenants(scopedTenants, query, { orgMainOnly }),
    [scopedTenants, query, orgMainOnly]
  )

  const selected = scopedTenants.find((t) => t.id === selectedId) ?? null

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className="space-y-3" ref={rootRef}>
      <div className="grid gap-4 md:grid-cols-3">
        {showTypeFilter && (
          <div>
            <Label>Tenant type</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
              value={tenantType}
              onChange={(e) => {
                onTenantTypeChange(e.target.value as AdminTenantType)
                onSelect(null)
                setQuery('')
              }}
            >
              <option value="RESTAURANT">Restaurant</option>
              <option value="SUPPLIER">Supplier</option>
            </select>
          </div>
        )}
        <div className={showTypeFilter ? 'md:col-span-2' : 'md:col-span-3'}>
          <Label>Search tenant</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              className="pl-9 pr-9"
              placeholder="Name, slug, email, plan, or ID…"
              value={open ? query : selected ? selected.name : query}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              disabled={loading}
            />
            {(query || selected) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-8 w-8 p-0"
                onClick={() => {
                  setQuery('')
                  onSelect(null)
                  setOpen(false)
                }}
                aria-label="Clear tenant"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <ChevronDown className="pointer-events-none absolute right-9 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Pick a tenant by name — no UUID required. Add-ons bill against the org main branch when
            applicable.
          </p>
        </div>
      </div>

      {onOrgMainOnlyChange && (
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={orgMainOnly}
            onChange={(e) => onOrgMainOnlyChange(e.target.checked)}
            className="rounded border-[var(--border)]"
          />
          Show org main branches only
        </label>
      )}

      {open && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg max-h-64 overflow-y-auto">
          {loading ? (
            <p className="px-3 py-4 text-sm text-[var(--text-muted)]">Loading tenants…</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--text-muted)]">
              No tenants match your search.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {filtered.slice(0, 50).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-[var(--brand-ultra)]/40 transition-colors"
                    onClick={() => {
                      onSelect(t)
                      setQuery('')
                      setOpen(false)
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-[var(--text)]">{t.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">{t.tenantType}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)] mt-0.5">
                      {t.slug ? <span>@{t.slug}</span> : null}
                      <span>Plan: {formatPlanCodeLabel(t.planCode)}</span>
                      <AdminStatusBadge status={t.status} />
                      {!t.isMainBranch && t.organizationId ? (
                        <span className="text-amber-700">Branch (org)</span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {filtered.length > 50 && (
            <p className="px-3 py-2 text-xs text-[var(--text-muted)] border-t">
              Showing first 50 matches — refine your search.
            </p>
          )}
        </div>
      )}

      {selected && !open && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--app-bg-subtle)]/50 px-3 py-2 text-sm">
          <span className="font-medium">{selected.name}</span>
          <span className="text-[var(--text-muted)]">
            {' '}
            · {formatPlanCodeLabel(selected.planCode)} · {selected.status}
          </span>
          <span className="block text-xs text-[var(--text-muted)] mt-0.5 font-mono truncate">
            ID: {selected.id}
          </span>
        </div>
      )}
    </div>
  )
}
