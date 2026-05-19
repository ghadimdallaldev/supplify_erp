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
    <div className="space-y-4">
      {noneSelected && !disabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Select at least one permission for this role.
        </div>
      )}
      {Object.entries(domains).map(([domain, keys]) => {
        const allOn = keys.every((k) => selectedSet.has(k))
        const someOn = keys.some((k) => selectedSet.has(k))
        return (
          <div key={domain} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">{domain}</p>
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>Select all</span>
                <Switch
                  checked={allOn}
                  disabled={disabled}
                  onCheckedChange={(checked) => toggleDomain(keys, checked)}
                  aria-label={`Select all ${domain} permissions`}
                />
                {!allOn && someOn && <span className="text-[var(--brand)]">Partial</span>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {keys.map((key) => (
                <label key={key} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={selectedSet.has(key)}
                    disabled={disabled}
                    onChange={(e) => togglePermission(key, e.target.checked)}
                  />
                  <span>{labelForPermission(key)}</span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
