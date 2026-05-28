import { useStopImpersonationMutation } from '../services/api'
import { useImpersonation } from '../hooks/useImpersonation'
import { Button } from './ui/button'
import { UserX } from 'lucide-react'

/**
 * Banner shown when an admin is impersonating a tenant (Restaurant or Supplier).
 * Exit clears the cookie and returns to the admin dashboard.
 */
export function ImpersonationBanner() {
  const { isImpersonating, impersonation, isLoading, tenantName, effectiveTenantType } =
    useImpersonation()
  const [stopImpersonation, { isLoading: stopping }] = useStopImpersonationMutation()

  if (!isImpersonating || isLoading) return null

  const label =
    tenantName ||
    impersonation?.tenantName ||
    `${effectiveTenantType} (${impersonation?.tenantId ?? ''})`

  const handleStop = async () => {
    try {
      await stopImpersonation().unwrap()
      window.location.href = '/app/admin'
    } catch {
      // Error toast could be added here
    }
  }

  return (
    <div
      className="sticky top-0 z-50 px-4 py-2 flex items-center justify-between gap-4 shadow-md border-b border-amber-700/20"
      style={{ background: 'var(--amber-mid)', color: '#000' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <UserX className="h-5 w-5 shrink-0" aria-hidden />
        <span className="font-medium truncate">Impersonating {label}</span>
        {impersonation?.expiresAt && (
          <span className="text-sm opacity-90 hidden sm:inline">
            (expires {new Date(impersonation.expiresAt).toLocaleString()})
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
        {stopping ? 'Exiting…' : 'Exit impersonation'}
      </Button>
    </div>
  )
}
