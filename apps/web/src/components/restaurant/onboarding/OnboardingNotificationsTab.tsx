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
import { PushEnableBanner } from '../../notifications/PushEnableBanner'

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
          title={t('settings:notifications.restaurantPanel.title')}
          description={t('settings:notifications.restaurantPanel.description')}
          footer={
            <Button onClick={handleSaveNotifications} disabled={isSavingNotificationPrefs}>
              {isSavingNotificationPrefs ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSavingNotificationPrefs
                ? t('settings:notifications.saving')
                : t('settings:notifications.restaurantPanel.save')}
            </Button>
          }
        >
          <div className="-mx-4 -mt-4 sm:-mx-5">
            <div className="border-b border-[var(--app-border)] px-4 py-3 sm:px-5">
              <p className="text-xs font-semibold text-[var(--text-mid)]">
                {t('settings:notifications.restaurantPanel.channels')}
              </p>
            </div>
            <div className="divide-y divide-[var(--app-border)]">
              {CHANNEL_FIELDS.map(({ key, icon }) => (
                <PreferenceToggleRow
                  key={key}
                  label={t(`settings:notifications.fields.${key}.label`)}
                  description={t(`settings:notifications.fields.${key}.description`)}
                  icon={icon}
                  checked={notificationPrefs[key]}
                  onCheckedChange={() => handleToggleNotification(key)}
                />
              ))}
            </div>

            <div className="border-y border-[var(--app-border)] px-4 py-3 sm:px-5">
              <p className="text-xs font-semibold text-[var(--text-mid)]">
                {t('settings:notifications.restaurantPanel.types')}
              </p>
            </div>
            <div className="divide-y divide-[var(--app-border)]">
              {CATEGORY_FIELDS.map(({ key, icon }) => (
                <PreferenceToggleRow
                  key={key}
                  label={t(`settings:notifications.fields.${key}.label`)}
                  description={t(`settings:notifications.fields.${key}.description`)}
                  icon={icon}
                  checked={notificationPrefs[key]}
                  onCheckedChange={() => handleToggleNotification(key)}
                />
              ))}
            </div>

            {pushNotificationsEnabled ? (
              <>
                <div className="border-b border-t border-[var(--app-border)] px-4 py-3 sm:px-5">
                  <p className="text-xs font-semibold text-[var(--text-mid)]">
                    {t('settings:notifications.restaurantPanel.pushTitle')}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-mid)]">
                    {t('settings:notifications.restaurantPanel.pushHint')}
                  </p>
                </div>
                <div className="px-4 py-4 sm:px-5">
                  {push.pushAvailable ? (
                    <div className="space-y-3">
                      {push.pushPermissionBlocked ? (
                        <div className="rounded-xl border border-[var(--amber)]/25 bg-[var(--amber-pale)] p-4 text-xs text-[var(--text)]">
                          <p className="font-medium">
                            {t('settings:notifications.restaurantPanel.blockedTitle')}
                          </p>
                          <p className="mt-1">{push.pushPermissionBlockedReason}</p>
                          <ol className="mt-2 list-decimal space-y-1 pl-4">
                            <li>{t('settings:notifications.restaurantPanel.blockedStep1')}</li>
                            <li>{t('settings:notifications.restaurantPanel.blockedStep2')}</li>
                            <li>{t('settings:notifications.restaurantPanel.blockedStep3')}</li>
                          </ol>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--app-border)] px-4 py-3">
                        <span className="text-sm font-medium text-[var(--text)]">
                          {t('settings:notifications.restaurantPanel.enable')}
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
                          {push.subscribing || push.unsubscribing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : push.subscribed ? (
                            t('settings:notifications.restaurantPanel.disableAction')
                          ) : (
                            t('settings:notifications.restaurantPanel.enableAction')
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-mid)]">
                      {push.pushUnavailableReason ||
                        t('settings:notifications.restaurantPanel.unavailable')}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="border-t border-[var(--app-border)] px-4 py-4 text-xs text-[var(--text-mid)] sm:px-5">
                {t('settings:notifications.restaurantPanel.notOnPlan')}
              </p>
            )}
          </div>
        </SettingsSection>
      </div>

      {pushNotificationsEnabled ? <PushEnableBanner allowed={pushNotificationsEnabled} /> : null}
    </>
  )
}
