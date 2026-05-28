import { Building2, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBranchContext } from '../contexts/BranchContext'
import { useAppSelector } from '../hooks/redux'
import { useEntitlements } from '../hooks/useEntitlements'
import { multiBranchEnabled } from '../lib/planLimits'

export function BranchSwitcher() {
  const { user } = useAppSelector((state) => state.auth)
  const { entitlements } = useEntitlements()
  const multiBranch = multiBranchEnabled(entitlements)
  const {
    accounts,
    activeAccountId,
    activeAccount,
    isLoading,
    isSwitching,
    switchAccount,
    isOrgScope,
  } = useBranchContext()

  if (user?.role !== 'RESTAURANT' && user?.role !== 'SUPPLIER') {
    return null
  }

  if (!isLoading && accounts.length <= 1 && activeAccount) {
    return (
      <div className="hidden md:flex items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-2 py-1 text-sm">
        <Building2 className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
        <span className="max-w-[180px] truncate">{activeAccount.name}</span>
      </div>
    )
  }

  if (!isLoading && accounts.length <= 1) {
    return null
  }

  return (
    <div className="hidden md:flex items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-2 py-1 text-sm">
      <Building2 className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
      {(isLoading || isSwitching) && (
        <Loader2 className="h-3 w-3 animate-spin text-[var(--text-muted)]" />
      )}
      <select
        className="bg-transparent border-none outline-none text-sm max-w-[180px] truncate cursor-pointer"
        value={activeAccountId ?? ''}
        onChange={(event) => {
          const nextId = event.target.value || null
          switchAccount(nextId).catch(() => {})
        }}
        disabled={isLoading || isSwitching}
        aria-label="Active account"
      >
        {isOrgScope && multiBranch && <option value="">All branches</option>}
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.isPrimary ? `${account.name} (main)` : account.name}
          </option>
        ))}
      </select>
      {(user?.role === 'SUPPLIER' || user?.role === 'RESTAURANT') &&
        multiBranch &&
        isOrgScope &&
        accounts.length > 1 && (
          <Link
            to="/app/org"
            className="text-xs text-[var(--brand)] whitespace-nowrap hover:underline"
            title="Organization overview"
          >
            Manage
          </Link>
        )}
      <span className="sr-only">{activeAccount?.name ?? 'Main account'}</span>
    </div>
  )
}
