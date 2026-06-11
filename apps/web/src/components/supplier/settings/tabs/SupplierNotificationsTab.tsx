import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card'
import { Button } from '../../../ui/button'
import { Bell, Save, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAppSelector } from '../../../../hooks/redux'
import { usePushNotifications } from '../../../../hooks/usePushNotifications'
import {
  useGetNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
  useGetEntitlementsQuery,
} from '../../../../services/api'
import { isEntitlementFeatureEnabled } from '../../../../lib/planLimits'
import {
  SUPPLIER_NOTIFICATION_DEFAULTS,
  SUPPLIER_NOTIFICATION_FIELDS,
} from '../supplierSettingsShared'

export function SupplierNotificationsTab() {
  const { user } = useAppSelector((state) => state.auth)
  const [notificationPrefs, setNotificationPrefs] = useState(SUPPLIER_NOTIFICATION_DEFAULTS)
  const {
    data: notificationPrefsData,
    isLoading: isLoadingNotificationPrefs,
    refetch: refetchNotificationPrefs,
  } = useGetNotificationPreferencesQuery(undefined, { skip: !user?.id })
  const [updateNotificationPreferences, { isLoading: isSavingNotificationPrefs }] =
    useUpdateNotificationPreferencesMutation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const pushNotificationsEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'push_notifications'
  )
  const push = usePushNotifications()

  useEffect(() => {
    const prefs = notificationPrefsData?.preferences
    if (prefs) {
      setNotificationPrefs((prev) => ({
        ...prev,
        emailEnabled: prefs.emailEnabled ?? prev.emailEnabled,
        whatsappEnabled: prefs.whatsappEnabled ?? prefs.smsEnabled ?? prev.whatsappEnabled,
        inAppEnabled: prefs.inAppEnabled ?? prev.inAppEnabled,
        notifyOrderNew: prefs.notifyOrderNew ?? prev.notifyOrderNew,
        notifyMessageReceived: prefs.notifyMessageReceived ?? prev.notifyMessageReceived,
        notifyInvoiceIssued: prefs.notifyInvoiceIssued ?? prev.notifyInvoiceIssued,
        notifyLowStock: prefs.notifyLowStock ?? prev.notifyLowStock,
      }))
    }
  }, [notificationPrefsData])

  const handleToggleNotification = (key: keyof typeof SUPPLIER_NOTIFICATION_DEFAULTS) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSaveNotifications = async () => {
    try {
      await updateNotificationPreferences(notificationPrefs).unwrap()
      await refetchNotificationPrefs()
      toast.success('Notification preferences saved!')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to save notification preferences')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>Choose how you want to be notified</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoadingNotificationPrefs ? (
            <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading notification preferences…
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {SUPPLIER_NOTIFICATION_FIELDS.map(({ key, label, description }) => (
                  <label
                    key={key}
                    className="flex flex-col gap-2 rounded-xl border p-4 hover:bg-[var(--brand-ultra)] cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--text)]">{label}</span>
                      {notificationPrefs[key] && (
                        <CheckCircle2 className="h-5 w-5 text-[var(--mint)] shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{description}</p>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={notificationPrefs[key]}
                      onChange={() => handleToggleNotification(key)}
                    />
                  </label>
                ))}
              </div>

              {pushNotificationsEnabled ? (
                <div className="border-t pt-6">
                  <h4 className="text-sm font-semibold text-[var(--text-mid)]">Browser push</h4>
                  <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">
                    Get real-time alerts even when Supplify is in the background.
                  </p>
                  {push.pushAvailable ? (
                    <div className="space-y-3">
                      {push.pushPermissionBlocked ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                          <p className="font-medium">Notifications blocked by your browser</p>
                          <p className="mt-1">{push.pushPermissionBlockedReason}</p>
                          <ol className="mt-2 list-decimal space-y-1 pl-4">
                            <li>
                              Click the <strong>lock / tune icon</strong> left of the address bar
                            </li>
                            <li>
                              Open <strong>Permissions</strong> → set <strong>Notifications</strong>{' '}
                              to <strong>Allow</strong>
                            </li>
                            <li>Reload this page, then click Enable below</li>
                          </ol>
                          <p className="mt-2 text-[var(--text-muted)]">
                            In Edge: Settings → Cookies and site permissions → All permissions →
                            Notifications → remove this site if listed as blocked.
                          </p>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between rounded-xl border p-4">
                        <span className="text-sm">Enable push notifications</span>
                        <Button
                          type="button"
                          variant={push.subscribed ? 'outline' : 'default'}
                          size="sm"
                          disabled={
                            push.subscribing ||
                            push.unsubscribing ||
                            (push.pushPermissionBlocked && !push.subscribed)
                          }
                          onClick={() => {
                            const action = push.subscribed ? push.disablePush() : push.enablePush()
                            action.catch((err: Error) =>
                              toast.error(err?.message || 'Could not update push notifications')
                            )
                          }}
                        >
                          {push.subscribed ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      {push.pushUnavailableReason ||
                        'Push is not configured on this server. Ask your admin to set VAPID keys on the API.'}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)] border-t pt-6">
                  Browser push is not included on your plan. Upgrade to enable real-time alerts.
                </p>
              )}

              <Button
                onClick={handleSaveNotifications}
                className="w-full"
                disabled={isSavingNotificationPrefs}
              >
                {isSavingNotificationPrefs ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isSavingNotificationPrefs ? 'Saving…' : 'Save preferences'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
