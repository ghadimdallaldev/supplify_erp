import { useAppSelector } from '../hooks/redux'
import { useGetImpersonationStatusQuery, useStopImpersonationMutation } from '../services/api'
import { Button } from './ui/button'
import { UserX } from 'lucide-react'

/**
 * Banner shown when an admin is impersonating a tenant (Restaurant or Supplier).
 * Renders above main content; "Stop impersonating" clears the session and refetches.
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
      window.location.reload()
    } catch {
      // Error toast could be added here
    }
  }

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between gap-4 shadow">
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
        variant="secondary"
        size="sm"
        onClick={handleStop}
        disabled={stopping}
        className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
      >
        {stopping ? 'Stopping…' : 'Stop impersonating'}
      </Button>
    </div>
  )
}
