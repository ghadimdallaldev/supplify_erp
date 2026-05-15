import { useAppSelector } from '../hooks/redux'
import { useGetImpersonationStatusQuery, useStopImpersonationMutation } from '../services/api'
import { Button } from './ui/button'
import { UserX } from 'lucide-react'

/**
 * Banner shown when an admin is impersonating a tenant (Restaurant or Supplier).
 * "Stop impersonating" clears the cookie and redirects to admin (full reload so sidebar/state are correct).
 */
export function ImpersonationBanner() {
  const { user } = useAppSelector((state) => state.auth)
  const isAdmin = user?.role === 'ADMIN'
  const { data, isLoading } = useGetImpersonationStatusQuery(undefined, { skip: !isAdmin })
  const [stopImpersonation, { isLoading: stopping }] = useStopImpersonationMutation()

  if (!isAdmin || isLoading || !data?.active) return null

  const label = data.tenantName || `${data.tenantType} (${data.tenantId})`

  const handleStop = async () => {
    try {
      await stopImpersonation().unwrap()
      // Hard redirect so we always land on admin dashboard with fresh state
      window.location.href = '/app/admin'
    } catch {
      // Error toast could be added here
    }
  }

  return (
    <div
      className="px-4 py-2 flex items-center justify-between gap-4 shadow-md"
      style={{ background: 'var(--amber-mid)', color: '#000' }}
    >
      <div className="flex items-center gap-2">
        <UserX className="h-5 w-5 shrink-0" />
        <span className="font-medium">You are impersonating {label}</span>
        {data.expiresAt && (
          <span className="text-sm opacity-90">
            (expires {new Date(data.expiresAt).toLocaleString()})
          </span>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleStop}
        disabled={stopping}
        className="shrink-0 border-black/25 bg-black/10 text-black hover:bg-black/20"
      >
        {stopping ? 'Stopping…' : 'Stop impersonating'}
      </Button>
    </div>
  )
}
