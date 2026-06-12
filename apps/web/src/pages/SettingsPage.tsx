import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { User, Mail, Shield, Bell, Loader2, Save, Settings2, LogIn } from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import { useImpersonation } from '../hooks/useImpersonation'
import { RequirePermission } from '../components/RequirePermission'
import { SupplierSettingsPage } from './SupplierSettingsPage'
import { RestaurantOnboardingPage } from './RestaurantOnboardingPage'
import {
  useGetNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from '../services/api'
import { toast } from 'sonner'
import { keycloakRealm, keycloakUrl } from '../lib/env'
import { AdminPortalNav } from '../components/admin/AdminPortalNav'
import { AdminPageHeader } from '../components/admin/AdminPageHeader'
import { PageShell } from '../components/ui/page-shell'
import { getAdminPageHeader } from '../lib/adminPageHeaders'

const DEFAULT_NOTIFICATION_PREFS = {
  emailEnabled: true,
  whatsappEnabled: false,
  inAppEnabled: true,
  notifyOrderNew: true,
  notifyMessageReceived: true,
  notifyInvoiceIssued: true,
  notifyLowStock: true,
  notifyReservationCreated: true,
  notifyReservationWaitlist: true,
  notifyStaffPto: true,
  notifyStaffSwap: true,
  notifyScheduledOrder: true,
} as const

const NOTIFICATION_FIELDS: Array<{
  key: keyof typeof DEFAULT_NOTIFICATION_PREFS
  label: string
  description: string
}> = [
  {
    key: 'emailEnabled',
    label: 'Email notifications',
    description: 'Receive important updates via email.',
  },
  {
    key: 'whatsappEnabled',
    label: 'WhatsApp notifications',
    description: 'Get important alerts on WhatsApp when your phone is on file.',
  },
  {
    key: 'inAppEnabled',
    label: 'In-app notifications',
    description: 'Show alerts inside Supplify.',
  },
  {
    key: 'notifyOrderNew',
    label: 'Order updates',
    description: 'Be notified when new orders arrive.',
  },
  {
    key: 'notifyMessageReceived',
    label: 'Message alerts',
    description: 'Receive pings when you get new chat messages.',
  },
  {
    key: 'notifyLowStock',
    label: 'Low stock warnings',
    description: 'Stay informed about items running low.',
  },
]

const COMING_SOON_PREFS = [
  { label: 'System alerts', description: 'Critical platform health notifications' },
  { label: 'Billing alerts', description: 'Subscription and invoice notifications' },
  { label: 'Product updates', description: 'New feature announcements' },
]

const ADMIN_PREFS = [
  { label: 'Default admin landing page', description: 'Choose which tab opens first' },
  { label: 'Compact mode', description: 'Denser admin layout' },
  { label: 'Theme preference', description: 'Light or dark admin theme' },
]

export function SettingsPage() {
  const { user } = useAppSelector((state) => state.auth)
  const { isEffectiveSupplier, isEffectiveRestaurant, isPlatformAdmin, isImpersonating } =
    useImpersonation()
  const { can } = usePermissions()
  const canEditSettings = can('SETTINGS_EDIT') || can('SETTINGS_MANAGE')
  const isAdminSettings = isPlatformAdmin && !isImpersonating
  const [notificationPrefs, setNotificationPrefs] = useState(DEFAULT_NOTIFICATION_PREFS)
  const {
    data: notificationPrefsData,
    isLoading: isLoadingNotificationPrefs,
    refetch: refetchNotificationPrefs,
  } = useGetNotificationPreferencesQuery(undefined, { skip: !user?.id })
  const [updateNotificationPreferences, { isLoading: isSavingNotificationPrefs }] =
    useUpdateNotificationPreferencesMutation()

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
      toast.success('Notification preferences saved!')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to save notification preferences')
    }
  }

  if (isEffectiveSupplier) {
    return (
      <RequirePermission permission="SETTINGS_VIEW" title="settings">
        <SupplierSettingsPage />
      </RequirePermission>
    )
  }

  if (isEffectiveRestaurant) {
    return (
      <RequirePermission permission="SETTINGS_VIEW" title="settings">
        <RestaurantOnboardingPage />
      </RequirePermission>
    )
  }

  const header = isAdminSettings
    ? getAdminPageHeader('settings')
    : { title: 'Settings', subtitle: 'Manage your account and preferences' }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isAdminSettings && <AdminPortalNav />}
      <PageShell className="min-h-0 flex-1 p-4 sm:p-6">
        <AdminPageHeader title={header.title} subtitle={header.subtitle} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Profile Information
              </CardTitle>
              <CardDescription className="text-xs">Your account details and role</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-0 text-sm">
              <div>
                <p className="text-xs font-medium text-[var(--text-mid)]">Display Name</p>
                <p>{user?.displayName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--text-mid)]">Email</p>
                <p>{user?.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--text-mid)]">Role</p>
                <p className="capitalize">{user?.role?.toLowerCase()}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--text-mid)]">Member Since</p>
                <p>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                Security
              </CardTitle>
              <CardDescription className="text-xs">Account security settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-0">
              <p className="text-sm text-[var(--text-muted)]">
                Your account is secured through Keycloak authentication.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(`${keycloakUrl}/realms/${keycloakRealm}/account`, '_blank')
                }}
              >
                Change Password
              </Button>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 xl:col-span-1">
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4" />
                Notifications
              </CardTitle>
              <CardDescription className="text-xs">
                Configure notification preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4 pt-0">
              {isLoadingNotificationPrefs ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading notification preferences…
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {NOTIFICATION_FIELDS.map(({ key, label, description }) => (
                      <div
                        key={key}
                        className="flex items-start justify-between gap-3 rounded-lg border border-[var(--app-border)] p-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--text)]">{label}</p>
                          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
                        </div>
                        <Switch
                          checked={notificationPrefs[key]}
                          onCheckedChange={() => handleToggleNotification(key)}
                          aria-label={label}
                          disabled={!canEditSettings}
                        />
                      </div>
                    ))}
                    {isAdminSettings &&
                      COMING_SOON_PREFS.map(({ label, description }) => (
                        <div
                          key={label}
                          className="flex items-start justify-between gap-3 rounded-lg border border-dashed border-[var(--app-border)] p-3 opacity-60"
                        >
                          <div>
                            <p className="text-sm font-medium text-[var(--text)]">{label}</p>
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
                          </div>
                          <Switch checked={false} disabled aria-label={label} />
                        </div>
                      ))}
                  </div>
                  <Button
                    onClick={handleSaveNotifications}
                    disabled={isSavingNotificationPrefs || !canEditSettings}
                    size="sm"
                    className="inline-flex items-center gap-2"
                  >
                    {isSavingNotificationPrefs ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save Preferences
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {isAdminSettings && (
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="h-4 w-4" />
                  Admin Preferences
                </CardTitle>
                <CardDescription className="text-xs">Coming soon</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-4 pt-0">
                {ADMIN_PREFS.map(({ label, description }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-dashed border-[var(--app-border)] p-3 opacity-60"
                  >
                    <p className="text-sm font-medium text-[var(--text)]">{label}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <LogIn className="h-4 w-4" />
                Session / Login Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 pt-0 text-sm">
              <p className="text-[var(--text-muted)]">Authenticated through Keycloak</p>
              <p>
                <span className="text-xs font-medium text-[var(--text-mid)]">Role: </span>
                <span className="capitalize">{user?.role?.toLowerCase()}</span>
              </p>
              <p>
                <span className="text-xs font-medium text-[var(--text-mid)]">Account: </span>
                Active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4" />
                Support
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <p className="mb-3 text-sm text-[var(--text-muted)]">
                Need help? Contact our support team.
              </p>
              <Button variant="outline" size="sm">
                Contact Support
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    </div>
  )
}
