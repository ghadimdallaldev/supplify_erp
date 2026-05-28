import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      className="sticky top-0 z-40 border-b border-amber-700/20 bg-amber-100 px-3 py-2 text-center text-sm font-medium text-amber-950 sm:px-4"
    >
      <span className="inline-flex items-center justify-center gap-2">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        You&apos;re offline. Live data may be unavailable until your connection returns.
      </span>
    </div>
  )
}
