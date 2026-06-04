import { Building2, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBranchContext } from '../contexts/BranchContext'
import { useImpersonation } from '../hooks/useImpersonation'

export function BranchSwitcher() {
  const { isEffectiveTenant, isEffectiveSupplier, isEffectiveRestaurant } = useImpersonation()
  const {
    accounts,
    activeAccountId,
    activeAccount,
    isLoading,
    isSwitching,
    switchAccount,
    isOrgScope,
  } = useBranchContext()

  if (!isEffectiveTenant) {
    return null
  }

  if (!isLoading && accounts.length <= 1 && activeAccount) {
    return (
      <div className="flex max-w-[min(42vw,180px)] items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-1.5 py-1 text-sm sm:max-w-[180px] sm:gap-2 sm:px-2">
        <Building2 className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        <span className="truncate">{activeAccount.name}</span>
      </div>
    )
  }

  if (!isLoading && accounts.length <= 1) {
    return null
  }

  return (
    <div className="flex max-w-[min(48vw,220px)] items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-1.5 py-1 text-sm sm:max-w-none sm:gap-2 sm:px-2">
      <Building2 className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
      {(isLoading || isSwitching) && (
        <Loader2 className="h-3 w-3 animate-spin text-[var(--text-muted)]" />
      )}
      <select
        className="min-w-0 max-w-[min(36vw,140px)] cursor-pointer truncate border-none bg-transparent text-sm outline-none sm:max-w-[180px]"
        value={activeAccountId ?? ''}
        onChange={(event) => {
          const nextId = event.target.value || null
          switchAccount(nextId).catch(() => {})
        }}
        disabled={isLoading || isSwitching}
        aria-label="Active account"
      >
        {isOrgScope && <option value="">All branches</option>}
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.isPrimary ? `${account.name} (main)` : account.name}
          </option>
        ))}
      </select>
      {(isEffectiveSupplier || isEffectiveRestaurant) && isOrgScope && accounts.length > 1 && (
        <Link
          to="/app/org"
          className="hidden text-xs text-[var(--brand)] whitespace-nowrap hover:underline sm:inline"
          title="Organization overview"
        >
          Manage
        </Link>
      )}
      <span className="sr-only">{activeAccount?.name ?? 'Main account'}</span>
    </div>
  )
}
