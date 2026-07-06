import { useStopImpersonationMutation } from '../services/api'
import { useImpersonation } from '../hooks/useImpersonation'
import { Button } from './ui/button'
import { InfoBanner } from './ui/info-banner'
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
      className="sticky top-0 z-50 border-b border-[var(--amber-mid)]/35"
      role="status"
      aria-live="polite"
    >
      <InfoBanner
        tone="amber"
        icon={UserX}
        className="rounded-none border-x-0 border-t-0"
        title={`Impersonating ${label}`}
        description={
          impersonation?.expiresAt ? (
            <span className="hidden sm:inline">
              Session expires {new Date(impersonation.expiresAt).toLocaleString()}
            </span>
          ) : undefined
        }
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={handleStop}
            disabled={stopping}
            className="shrink-0 border-amber-800/25 bg-amber-900/5 text-amber-950 hover:bg-amber-900/10"
          >
            {stopping ? 'Exiting…' : 'Exit impersonation'}
          </Button>
        }
      />
    </div>
  )
}
