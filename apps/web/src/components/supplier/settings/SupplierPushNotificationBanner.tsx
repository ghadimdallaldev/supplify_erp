import { useEffect } from 'react'
import { useAppSelector } from '../../../hooks/redux'
import { useGetEntitlementsQuery } from '../../../services/api'
import { isEntitlementFeatureEnabled } from '../../../lib/planLimits'
import { ensureNamespace } from '../../../i18n'
import { PushEnableBanner } from '../../notifications/PushEnableBanner'

/** Fixed push prompt — self-contained so the settings shell stays slim. */
export function SupplierPushNotificationBanner() {
  const { user } = useAppSelector((state) => state.auth)
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const pushNotificationsEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'push_notifications'
  )

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  return <PushEnableBanner allowed={pushNotificationsEnabled} />
}
