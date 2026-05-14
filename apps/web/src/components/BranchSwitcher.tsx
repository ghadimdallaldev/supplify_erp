import { Building2, Loader2 } from 'lucide-react'
import { useBranchContext } from '../contexts/BranchContext'
import { useAppSelector } from '../hooks/redux'

export function BranchSwitcher() {
  const { user } = useAppSelector((state) => state.auth)
  const { accounts, activeAccountId, activeAccount, isLoading, isSwitching, switchAccount } =
    useBranchContext()

  if (user?.role !== 'RESTAURANT' && user?.role !== 'SUPPLIER') {
    return null
  }

  if (!isLoading && accounts.length <= 1) {
    return null
  }

  return (
    <div className="hidden md:flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm">
      <Building2 className="h-4 w-4 text-gray-500 shrink-0" />
      {(isLoading || isSwitching) && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
      <select
        className="bg-transparent border-none outline-none text-sm max-w-[180px] truncate cursor-pointer"
        value={activeAccountId ?? accounts[0]?.id ?? ''}
        onChange={(event) => {
          const nextId = event.target.value || null
          switchAccount(nextId).catch(() => {})
        }}
        disabled={isLoading || isSwitching}
        aria-label="Active account"
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.isPrimary ? `${account.name} (main)` : account.name}
          </option>
        ))}
      </select>
      <span className="sr-only">{activeAccount?.name ?? 'Main account'}</span>
    </div>
  )
}
