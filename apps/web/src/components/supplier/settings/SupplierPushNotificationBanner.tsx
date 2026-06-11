import toast from 'react-hot-toast'
import { Button } from '../../ui/button'
import { useAppSelector } from '../../../hooks/redux'
import { usePushNotifications } from '../../../hooks/usePushNotifications'
import { useGetEntitlementsQuery } from '../../../services/api'
import { isEntitlementFeatureEnabled } from '../../../lib/planLimits'

/** Fixed push prompt — self-contained so the settings shell stays slim. */
export function SupplierPushNotificationBanner() {
  const { user } = useAppSelector((state) => state.auth)
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const pushNotificationsEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'push_notifications'
  )
  const push = usePushNotifications()

  if (!pushNotificationsEnabled || !push.bannerVisible) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-white p-4 shadow-lg">
      <p className="text-sm font-medium">Enable push notifications?</p>
      <p className="text-xs text-[var(--text-muted)] mt-1">Stay updated on orders and messages.</p>
      <div className="flex gap-2 mt-3">
        <Button
          size="sm"
          onClick={() => push.enablePush().catch(() => toast.error('Could not enable push'))}
        >
          Enable
        </Button>
        <Button size="sm" variant="outline" onClick={push.dismissBanner}>
          Not now
        </Button>
      </div>
    </div>
  )
}
