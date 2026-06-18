import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { Badge } from '../components/ui/badge'
import { AppPanel } from '../components/ui/app-panel'
import {
  User,
  Mail,
  Shield,
  Bell,
  Loader2,
  Save,
  LogIn,
  ExternalLink,
  Languages,
} from 'lucide-react'
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
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { ensureNamespace } from '../i18n'

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

const NOTIFICATION_FIELD_KEYS: Array<keyof typeof DEFAULT_NOTIFICATION_PREFS> = [
  'emailEnabled',
  'whatsappEnabled',
  'inAppEnabled',
  'notifyOrderNew',
  'notifyMessageReceived',
  'notifyLowStock',
]

const ADMIN_COMING_SOON_PREF_KEYS = [
  'notifications.comingSoon.systemAlerts',
  'notifications.comingSoon.billingAlerts',
  'notifications.comingSoon.productUpdates',
] as const

const ADMIN_PREF_KEYS = [
  'admin.preferences.landingPage',
  'admin.preferences.compactMode',
  'admin.preferences.theme',
] as const

function LanguageSettingsCard() {
  const { t } = useTranslation('settings')

  return (
    <Card className="md:col-span-2 xl:col-span-3">
      <CardHeader className="px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Languages className="h-4 w-4" />
          {t('language.title')}
        </CardTitle>
        <CardDescription className="text-xs">{t('language.description')}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <LanguageSwitcher />
      </CardContent>
    </Card>
  )
}

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
  const { t } = useTranslation('settings')

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
              {t('comingSoon')}
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
  const { t } = useTranslation('settings')
  const roleLabel = user?.role?.replace(/_/g, ' ').toLowerCase() ?? t('roleUnknown')

  return (
    <div className="space-y-4" data-testid="admin-settings-content">
      <LanguageSettingsCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <AppPanel
          title={t('admin.profile.title')}
          description={t('admin.profile.description')}
          testId="admin-settings-profile"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsField
              label={t('admin.profile.displayName')}
              value={user?.displayName || t('profile.empty')}
            />
            <SettingsField
              label={t('admin.profile.email')}
              value={user?.email || t('profile.empty')}
            />
            <SettingsField
              label={t('admin.profile.role')}
              value={<span className="capitalize">{roleLabel}</span>}
            />
            <SettingsField
              label={t('admin.profile.memberSince')}
              value={
                user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : t('profile.empty')
              }
            />
          </div>
        </AppPanel>

        <AppPanel
          title={t('security.title')}
          description={t('security.adminDescription')}
          testId="admin-settings-security"
        >
          <p className="mb-4 text-sm text-[var(--text-mid)]">{t('security.portalHint')}</p>
          <Button
            variant="outline"
            size="sm"
            className="inline-flex items-center gap-2"
            onClick={() => {
              window.open(`${keycloakUrl}/realms/${keycloakRealm}/account`, '_blank')
            }}
          >
            {t('security.manageInKeycloak')}
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </AppPanel>
      </div>

      <AppPanel
        title={t('notifications.title')}
        description={t('notifications.adminDescription')}
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
                  {t('notifications.saving')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t('notifications.saveAdmin')}
                </>
              )}
            </Button>
          ) : undefined
        }
      >
        {isLoadingNotificationPrefs ? (
          <AdminLoadingState label={t('notifications.loading')} />
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {NOTIFICATION_FIELD_KEYS.map((key) => (
              <SettingsToggleRow
                key={key}
                label={t(`notifications.fields.${key}.label`)}
                description={t(`notifications.fields.${key}.description`)}
                checked={notificationPrefs[key]}
                onCheckedChange={() => onToggleNotification(key)}
                disabled={!canEditSettings}
              />
            ))}
            {ADMIN_COMING_SOON_PREF_KEYS.map((prefKey) => (
              <SettingsToggleRow
                key={prefKey}
                label={t(`${prefKey}.label`)}
                description={t(`${prefKey}.description`)}
                checked={false}
                comingSoon
              />
            ))}
          </div>
        )}
      </AppPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <AppPanel
          title={t('admin.preferences.title')}
          description={t('admin.preferences.description')}
          testId="admin-settings-preferences"
        >
          <div className="space-y-2">
            {ADMIN_PREF_KEYS.map((prefKey) => (
              <div
                key={prefKey}
                className="rounded-lg border border-dashed border-[var(--app-border)] p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-[var(--text)]">{t(`${prefKey}.label`)}</p>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {t('comingSoon')}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {t(`${prefKey}.description`)}
                </p>
              </div>
            ))}
          </div>
        </AppPanel>

        <AppPanel
          title={t('admin.session.title')}
          description={t('admin.session.description')}
          testId="admin-settings-session"
        >
          <div className="space-y-3">
            <SettingsField label={t('admin.session.provider')} value="Keycloak" />
            <SettingsField
              label={t('admin.session.role')}
              value={<span className="capitalize">{roleLabel}</span>}
            />
            <SettingsField
              label={t('admin.session.accountStatus')}
              value={
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  {t('admin.session.active')}
                </Badge>
              }
            />
          </div>
        </AppPanel>
      </div>

      <AppPanel
        title={t('admin.support.title')}
        description={t('admin.support.description')}
        testId="admin-settings-support"
      >
        <p className="mb-4 text-sm text-[var(--text-mid)]">{t('admin.support.hint')}</p>
        <Button variant="outline" size="sm" className="inline-flex items-center gap-2">
          <Mail className="h-4 w-4" />
          {t('admin.support.contact')}
        </Button>
      </AppPanel>
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation('settings')
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
    void ensureNamespace('settings')
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
      toast.success(t('notifications.saved'))
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('notifications.saveFailed'))
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

  const header = { title: t('page.title'), subtitle: t('page.subtitle') }

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
          <LanguageSettingsCard />

          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                {t('profile.title')}
              </CardTitle>
              <CardDescription className="text-xs">{t('profile.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-0 text-sm">
              <div>
                <p className="text-xs font-medium text-[var(--text-mid)]">
                  {t('profile.displayName')}
                </p>
                <p>{user?.displayName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--text-mid)]">{t('profile.email')}</p>
                <p>{user?.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--text-mid)]">{t('profile.role')}</p>
                <p className="capitalize">{user?.role?.toLowerCase()}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--text-mid)]">
                  {t('profile.memberSince')}
                </p>
                <p>
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString()
                    : t('profile.notAvailable')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                {t('security.title')}
              </CardTitle>
              <CardDescription className="text-xs">{t('security.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-0">
              <p className="text-sm text-[var(--text-muted)]">{t('security.keycloakManaged')}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(`${keycloakUrl}/realms/${keycloakRealm}/account`, '_blank')
                }}
              >
                {t('security.changePassword')}
              </Button>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 xl:col-span-1">
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4" />
                {t('notifications.title')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t('notifications.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4 pt-0">
              {isLoadingNotificationPrefs ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('notifications.loading')}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {NOTIFICATION_FIELD_KEYS.map((key) => (
                      <div
                        key={key}
                        className="flex items-start justify-between gap-3 rounded-lg border border-[var(--app-border)] p-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--text)]">
                            {t(`notifications.fields.${key}.label`)}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                            {t(`notifications.fields.${key}.description`)}
                          </p>
                        </div>
                        <Switch
                          checked={notificationPrefs[key]}
                          onCheckedChange={() => handleToggleNotification(key)}
                          aria-label={t(`notifications.fields.${key}.label`)}
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
                        {t('notifications.saving')}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {t('notifications.save')}
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
                {t('session.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 pt-0 text-sm">
              <p className="text-[var(--text-muted)]">{t('session.authenticatedVia')}</p>
              <p>
                <span className="text-xs font-medium text-[var(--text-mid)]">
                  {t('session.role')}:{' '}
                </span>
                <span className="capitalize">{user?.role?.toLowerCase()}</span>
              </p>
              <p>
                <span className="text-xs font-medium text-[var(--text-mid)]">
                  {t('session.account')}:{' '}
                </span>
                {t('session.active')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4" />
                {t('support.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <p className="mb-3 text-sm text-[var(--text-muted)]">{t('support.hint')}</p>
              <Button variant="outline" size="sm">
                {t('support.contact')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    </div>
  )
}
