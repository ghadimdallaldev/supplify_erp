import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/button'
import { Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppSelector } from '../../../hooks/redux'
import {
  useGetNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
  useGetEntitlementsQuery,
} from '../../../services/api'
import { usePushNotifications } from '../../../hooks/usePushNotifications'
import { isEntitlementFeatureEnabled } from '../../../lib/planLimits'
import {
  CATEGORY_FIELDS,
  CHANNEL_FIELDS,
  DEFAULT_NOTIFICATION_PREFS,
  OnboardingTabLoading,
  PreferenceToggleRow,
  SettingsSection,
} from './onboardingShared'
import { ensureNamespace } from '../../../i18n'

export function OnboardingNotificationsTab() {
  const { t } = useTranslation(['settings', 'suppliers'])
  const { user } = useAppSelector((state) => state.auth)
  const push = usePushNotifications()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const pushNotificationsEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'push_notifications'
  )
  const [notificationPrefs, setNotificationPrefs] = useState(DEFAULT_NOTIFICATION_PREFS)
  const {
    data: notificationPrefsData,
    isLoading: isLoadingPrefs,
    refetch: refetchNotificationPrefs,
  } = useGetNotificationPreferencesQuery(undefined, { skip: !user?.id })
  const [updateNotificationPreferences, { isLoading: isSavingNotificationPrefs }] =
    useUpdateNotificationPreferencesMutation()

  useEffect(() => {
    void ensureNamespace('settings')
    void ensureNamespace('suppliers')
  }, [])

  useEffect(() => {
    const prefs = notificationPrefsData?.preferences
    if (prefs) {
      setNotificationPrefs((previous) => ({
        ...previous,
        emailEnabled: prefs.emailEnabled ?? previous.emailEnabled,
        whatsappEnabled: prefs.whatsappEnabled ?? prefs.smsEnabled ?? previous.whatsappEnabled,
        inAppEnabled: prefs.inAppEnabled ?? previous.inAppEnabled,
        notifyOrderNew: prefs.notifyOrderNew ?? previous.notifyOrderNew,
        notifyMessageReceived: prefs.notifyMessageReceived ?? previous.notifyMessageReceived,
        notifyInvoiceIssued: prefs.notifyInvoiceIssued ?? previous.notifyInvoiceIssued,
        notifyLowStock: prefs.notifyLowStock ?? previous.notifyLowStock,
        notifyReservationCreated:
          prefs.notifyReservationCreated ?? previous.notifyReservationCreated,
        notifyReservationWaitlist:
          prefs.notifyReservationWaitlist ?? previous.notifyReservationWaitlist,
        notifyStaffPto: prefs.notifyStaffPto ?? previous.notifyStaffPto,
        notifyStaffSwap: prefs.notifyStaffSwap ?? previous.notifyStaffSwap,
        notifyScheduledOrder: prefs.notifyScheduledOrder ?? previous.notifyScheduledOrder,
        notifyReorderCadence: prefs.notifyReorderCadence ?? previous.notifyReorderCadence,
      }))
    }
  }, [notificationPrefsData])

  const handleToggleNotification = (key: keyof typeof DEFAULT_NOTIFICATION_PREFS) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSaveNotifications = async () => {
    try {
      await updateNotificationPreferences(notificationPrefs).unwrap()
      await refetchNotificationPrefs()
      toast.success(t('settings:notifications.saved'))
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('settings:notifications.saveFailed'))
    }
  }

  if (isLoadingPrefs) {
    return <OnboardingTabLoading />
  }

  return (
    <>
      <div className="space-y-4">
        <SettingsSection
          title="Notification preferences"
          description="Choose how and when Supplify alerts you."
          footer={
            <Button onClick={handleSaveNotifications} disabled={isSavingNotificationPrefs}>
              {isSavingNotificationPrefs ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSavingNotificationPrefs ? 'Saving…' : 'Save preferences'}
            </Button>
          }
        >
          <div className="-mx-4 -mt-4 sm:-mx-5">
            <div className="border-b border-[var(--app-border)] px-4 py-3 sm:px-5">
              <p className="text-xs font-semibold text-[var(--text-mid)]">Delivery methods</p>
            </div>
            <div className="divide-y divide-[var(--app-border)]">
              {CHANNEL_FIELDS.map(({ key, label, description, icon }) => (
                <PreferenceToggleRow
                  key={key}
                  label={label}
                  description={description}
                  icon={icon}
                  checked={notificationPrefs[key]}
                  onCheckedChange={() => handleToggleNotification(key)}
                />
              ))}
            </div>

            <div className="border-y border-[var(--app-border)] px-4 py-3 sm:px-5">
              <p className="text-xs font-semibold text-[var(--text-mid)]">Notification types</p>
            </div>
            <div className="divide-y divide-[var(--app-border)]">
              {CATEGORY_FIELDS.map(({ key, label, description, icon }) => (
                <PreferenceToggleRow
                  key={key}
                  label={label}
                  description={description}
                  icon={icon}
                  checked={notificationPrefs[key]}
                  onCheckedChange={() => handleToggleNotification(key)}
                />
              ))}
            </div>

            {pushNotificationsEnabled ? (
              <>
                <div className="border-b border-t border-[var(--app-border)] px-4 py-3 sm:px-5">
                  <p className="text-xs font-semibold text-[var(--text-mid)]">Browser push</p>
                  <p className="mt-0.5 text-xs text-[var(--text-mid)]">
                    Real-time alerts when Supplify is in the background.
                  </p>
                </div>
                <div className="px-4 py-4 sm:px-5">
                  {push.pushAvailable ? (
                    <div className="space-y-3">
                      {push.pushPermissionBlocked ? (
                        <div className="rounded-xl border border-[var(--amber)]/25 bg-[var(--amber-pale)] p-4 text-xs text-[var(--text)]">
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
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--app-border)] px-4 py-3">
                        <span className="text-sm font-medium text-[var(--text)]">
                          Enable push notifications
                        </span>
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
                              toast.error(
                                err?.message || t('suppliers:notifications.toast.pushUpdateFailed')
                              )
                            )
                          }}
                        >
                          {push.subscribed ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-mid)]">
                      {push.pushUnavailableReason ||
                        'Push is not configured on this server. Ask your admin to set VAPID keys on the API.'}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="border-t border-[var(--app-border)] px-4 py-4 text-xs text-[var(--text-mid)] sm:px-5">
                Browser push is not included on your plan. Upgrade to enable real-time alerts.
              </p>
            )}
          </div>
        </SettingsSection>
      </div>

      {pushNotificationsEnabled && push.bannerVisible ? (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4">
          <p className="text-sm font-medium text-[var(--text)]">Enable push notifications?</p>
          <p className="mt-1 text-xs text-[var(--text-mid)]">
            Stay updated on orders and messages.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                push.enablePush().catch(() => toast.error(t('suppliers:pushBanner.enableFailed')))
              }
            >
              Enable
            </Button>
            <Button size="sm" variant="outline" onClick={push.dismissBanner}>
              Not now
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
