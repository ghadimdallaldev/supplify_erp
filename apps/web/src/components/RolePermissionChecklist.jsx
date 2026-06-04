import { useMemo } from 'react'
import { Switch } from './ui/switch'
import {
  labelForPermission,
  RESTAURANT_PERMISSION_DOMAINS,
  SUPPLIER_PERMISSION_DOMAINS,
} from '../lib/permissionLabels'

export function RolePermissionChecklist({
  tenantType = 'RESTAURANT',
  selected = [],
  onChange,
  disabled = false,
}) {
  const domains =
    tenantType === 'SUPPLIER' ? SUPPLIER_PERMISSION_DOMAINS : RESTAURANT_PERMISSION_DOMAINS

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const togglePermission = (key, checked) => {
    if (disabled || !onChange) return
    if (checked) {
      onChange([...selectedSet, key])
    } else {
      onChange([...selected].filter((p) => p !== key))
    }
  }

  const toggleDomain = (keys, selectAll) => {
    if (disabled || !onChange) return
    const next = new Set(selected)
    for (const key of keys) {
      if (selectAll) next.add(key)
      else next.delete(key)
    }
    onChange([...next])
  }

  const noneSelected = selected.length === 0

  return (
    <div className="space-y-3">
      {noneSelected && !disabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          Select at least one permission for this role.
        </div>
      )}
      {Object.entries(domains).map(([domain, keys]) => {
        const allOn = keys.every((k) => selectedSet.has(k))
        const someOn = keys.some((k) => selectedSet.has(k))
        return (
          <div
            key={domain}
            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-subtle)] p-3 space-y-2.5 sm:p-4"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold text-sm text-[var(--text)]">{domain}</p>
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)] sm:justify-end">
                <span className="shrink-0">Select all</span>
                <Switch
                  checked={allOn}
                  disabled={disabled}
                  onCheckedChange={(checked) => toggleDomain(keys, checked)}
                  aria-label={`Select all ${domain} permissions`}
                />
                {!allOn && someOn && (
                  <span className="rounded-md bg-[var(--brand-pale)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand)]">
                    Partial
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {keys.map((key) => (
                <label
                  key={key}
                  className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-2 text-sm transition-colors hover:border-[var(--app-border)] hover:bg-[var(--surface)] sm:min-h-0"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-mid)]"
                    checked={selectedSet.has(key)}
                    disabled={disabled}
                    onChange={(e) => togglePermission(key, e.target.checked)}
                  />
                  <span className="leading-snug text-[var(--text-mid)]">
                    {labelForPermission(key)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
