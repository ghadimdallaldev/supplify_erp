import { useEffect, useState, type ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { Badge } from '../components/ui/badge'
import { AppPanel } from '../components/ui/app-panel'
import { User, Mail, Shield, Bell, Loader2, Save, LogIn, ExternalLink } from 'lucide-react'
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
import { PageShell } from '../components/ui/page-shell'
import { AdminLoadingState } from '../components/admin/adminUi'
import { cn } from '../lib/utils'
import type { User as AuthUser } from '../types/auth'

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

type NotificationPrefs = { [K in keyof typeof DEFAULT_NOTIFICATION_PREFS]: boolean }

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

const ADMIN_COMING_SOON_PREFS = [
  { label: 'System alerts', description: 'Critical platform health notifications' },
  { label: 'Billing alerts', description: 'Subscription and invoice notifications' },
  { label: 'Product updates', description: 'New feature announcements' },
]

const ADMIN_PREFS = [
  { label: 'Default admin landing page', description: 'Choose which tab opens first' },
  { label: 'Compact mode', description: 'Denser admin layout' },
  { label: 'Theme preference', description: 'Light or dark admin theme' },
]

function SettingsField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-subtle)]/40 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm text-[var(--text)]">{value}</p>
    </div>
  )
}

function SettingsToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  comingSoon,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange?: () => void
  disabled?: boolean
  comingSoon?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 rounded-lg border p-3',
        comingSoon
          ? 'border-dashed border-[var(--app-border)] opacity-70'
          : 'border-[var(--app-border)]'
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-[var(--text)]">{label}</p>
          {comingSoon && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Coming soon
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        disabled={disabled || comingSoon}
      />
    </div>
  )
}

function AdminSettingsContent({
  user,
  canEditSettings,
  notificationPrefs,
  isLoadingNotificationPrefs,
  isSavingNotificationPrefs,
  onToggleNotification,
  onSaveNotifications,
}: {
  user: AuthUser | null
  canEditSettings: boolean
  notificationPrefs: NotificationPrefs
  isLoadingNotificationPrefs: boolean
  isSavingNotificationPrefs: boolean
  onToggleNotification: (key: keyof typeof DEFAULT_NOTIFICATION_PREFS) => void
  onSaveNotifications: () => void
}) {
  const roleLabel = user?.role?.replace(/_/g, ' ').toLowerCase() ?? 'unknown'

  return (
    <div className="space-y-4" data-testid="admin-settings-content">
      <div className="grid gap-4 lg:grid-cols-2">
        <AppPanel
          title="Profile"
          description="Your platform admin account details."
          testId="admin-settings-profile"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsField label="Display name" value={user?.displayName || '—'} />
            <SettingsField label="Email" value={user?.email || '—'} />
            <SettingsField label="Role" value={<span className="capitalize">{roleLabel}</span>} />
            <SettingsField
              label="Member since"
              value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
            />
          </div>
        </AppPanel>

        <AppPanel
          title="Security"
          description="Authentication is managed through Keycloak."
          testId="admin-settings-security"
        >
          <p className="mb-4 text-sm text-[var(--text-mid)]">
            Password changes and multi-factor settings are handled in your identity provider account
            portal.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="inline-flex items-center gap-2"
            onClick={() => {
              window.open(`${keycloakUrl}/realms/${keycloakRealm}/account`, '_blank')
            }}
          >
            Manage account in Keycloak
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </AppPanel>
      </div>

      <AppPanel
        title="Notifications"
        description="Choose how you receive platform alerts and operational updates."
        testId="admin-settings-notifications"
        footer={
          !isLoadingNotificationPrefs ? (
            <Button
              onClick={onSaveNotifications}
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
                  Save preferences
                </>
              )}
            </Button>
          ) : undefined
        }
      >
        {isLoadingNotificationPrefs ? (
          <AdminLoadingState label="Loading notification preferences…" />
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {NOTIFICATION_FIELDS.map(({ key, label, description }) => (
              <SettingsToggleRow
                key={key}
                label={label}
                description={description}
                checked={notificationPrefs[key]}
                onCheckedChange={() => onToggleNotification(key)}
                disabled={!canEditSettings}
              />
            ))}
            {ADMIN_COMING_SOON_PREFS.map(({ label, description }) => (
              <SettingsToggleRow
                key={label}
                label={label}
                description={description}
                checked={false}
                comingSoon
              />
            ))}
          </div>
        )}
      </AppPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <AppPanel
          title="Admin preferences"
          description="Workspace customization for the platform admin console."
          testId="admin-settings-preferences"
        >
          <div className="space-y-2">
            {ADMIN_PREFS.map(({ label, description }) => (
              <div
                key={label}
                className="rounded-lg border border-dashed border-[var(--app-border)] p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-[var(--text)]">{label}</p>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    Coming soon
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
              </div>
            ))}
          </div>
        </AppPanel>

        <AppPanel
          title="Session"
          description="Current sign-in status and authentication provider."
          testId="admin-settings-session"
        >
          <div className="space-y-3">
            <SettingsField label="Provider" value="Keycloak" />
            <SettingsField label="Role" value={<span className="capitalize">{roleLabel}</span>} />
            <SettingsField
              label="Account status"
              value={
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  Active
                </Badge>
              }
            />
          </div>
        </AppPanel>
      </div>

      <AppPanel
        title="Support"
        description="Reach the Supplify team for platform admin assistance."
        testId="admin-settings-support"
      >
        <p className="mb-4 text-sm text-[var(--text-mid)]">
          Need help with tenants, billing, or platform configuration? Our support team can assist.
        </p>
        <Button variant="outline" size="sm" className="inline-flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Contact support
        </Button>
      </AppPanel>
    </div>
  )
}

export function SettingsPage() {
  const { user } = useAppSelector((state) => state.auth)
  const { isEffectiveSupplier, isEffectiveRestaurant, isPlatformAdmin, isImpersonating } =
    useImpersonation()
  const { can } = usePermissions()
  const canEditSettings = can('SETTINGS_EDIT') || can('SETTINGS_MANAGE')
  const isAdminSettings = isPlatformAdmin && !isImpersonating
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    ...DEFAULT_NOTIFICATION_PREFS,
  })
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

  if (isAdminSettings) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageShell
          maxWidth="focused"
          className="min-h-0 flex-1 px-4 py-4 sm:px-6 sm:py-5"
          data-testid="settings-page"
        >
          <AdminSettingsContent
            user={user}
            canEditSettings={canEditSettings}
            notificationPrefs={notificationPrefs}
            isLoadingNotificationPrefs={isLoadingNotificationPrefs}
            isSavingNotificationPrefs={isSavingNotificationPrefs}
            onToggleNotification={handleToggleNotification}
            onSaveNotifications={handleSaveNotifications}
          />
        </PageShell>
      </div>
    )
  }

  const header = { title: 'Settings', subtitle: 'Manage your account and preferences' }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageShell
        maxWidth="focused"
        className="min-h-0 flex-1 px-4 py-4 sm:px-6 sm:py-5"
        data-testid="settings-page"
      >
        <>
          <h1 className="text-2xl font-semibold text-[var(--text)]">{header.title}</h1>
          <p className="mt-1 mb-4 text-sm text-[var(--text-mid)]">{header.subtitle}</p>
        </>

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
