import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { User, Mail, Shield, Bell, Loader2, Save } from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { SupplierSettingsPage } from './SupplierSettingsPage'
import { RestaurantOnboardingPage } from './RestaurantOnboardingPage'
import {
  useGetNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from '../services/api'
import toast from 'react-hot-toast'

const DEFAULT_NOTIFICATION_PREFS = {
  emailEnabled: true,
  smsEnabled: false,
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
    key: 'smsEnabled',
    label: 'SMS notifications',
    description: 'Get critical alerts by SMS when enabled.',
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

export function SettingsPage() {
  const { user } = useAppSelector((state) => state.auth)
  const [notificationPrefs, setNotificationPrefs] = useState(DEFAULT_NOTIFICATION_PREFS)
  const { data: notificationPrefsData, isLoading: isLoadingNotificationPrefs } = useGetNotificationPreferencesQuery()
  const [updateNotificationPreferences, { isLoading: isSavingNotificationPrefs }] = useUpdateNotificationPreferencesMutation()

  useEffect(() => {
    const prefs = notificationPrefsData?.preferences
    if (prefs) {
      setNotificationPrefs((previous) => ({
        ...previous,
        emailEnabled: prefs.emailEnabled ?? previous.emailEnabled,
        smsEnabled: prefs.smsEnabled ?? previous.smsEnabled,
        inAppEnabled: prefs.inAppEnabled ?? previous.inAppEnabled,
        notifyOrderNew: prefs.notifyOrderNew ?? previous.notifyOrderNew,
        notifyMessageReceived: prefs.notifyMessageReceived ?? previous.notifyMessageReceived,
        notifyInvoiceIssued: prefs.notifyInvoiceIssued ?? previous.notifyInvoiceIssued,
        notifyLowStock: prefs.notifyLowStock ?? previous.notifyLowStock,
        notifyReservationCreated: prefs.notifyReservationCreated ?? previous.notifyReservationCreated,
        notifyReservationWaitlist: prefs.notifyReservationWaitlist ?? previous.notifyReservationWaitlist,
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
      toast.success('Notification preferences saved!')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to save notification preferences')
    }
  }

  // Show supplier-specific settings for suppliers
  if (user?.role === 'SUPPLIER') {
    return <SupplierSettingsPage />
  }

  // Show restaurant onboarding for restaurants
  if (user?.role === 'RESTAURANT') {
    return <RestaurantOnboardingPage />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">
          Manage your account and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Profile Information</span>
            </CardTitle>
            <CardDescription>
              Your account details and role information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-600">Display Name</label>
              <p className="text-sm">{user?.displayName}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-600">Email</label>
              <p className="text-sm">{user?.email}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-600">Role</label>
              <p className="text-sm capitalize">{user?.role?.toLowerCase()}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-600">Member Since</label>
              <p className="text-sm">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Security</span>
            </CardTitle>
            <CardDescription>
              Manage your account security settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Your account is secured through Keycloak authentication.
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080';
                  const realm = import.meta.env.VITE_KEYCLOAK_REALM || 'Supplify';
                  window.open(`${keycloakUrl}/realms/${realm}/account`, '_blank');
                }}
              >
                Change Password
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <span>Notifications</span>
            </CardTitle>
            <CardDescription>
              Configure your notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingNotificationPrefs ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading notification preferences…
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {NOTIFICATION_FIELDS.map(({ key, label, description }) => (
                    <div key={key} className="flex items-start justify-between gap-4 rounded-lg border p-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{description}</p>
                      </div>
                      <Switch
                        checked={notificationPrefs[key]}
                        onCheckedChange={() => handleToggleNotification(key)}
                        aria-label={label}
                      />
                    </div>
                  ))}
                </div>
                <Button
                  onClick={handleSaveNotifications}
                  disabled={isSavingNotificationPrefs}
                  className="inline-flex items-center gap-2"
                >
                  {isSavingNotificationPrefs ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving preferences…
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
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Mail className="h-5 w-5" />
              <span>Support</span>
            </CardTitle>
            <CardDescription>
              Get help and contact support
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Need help? Contact our support team.
              </p>
              <Button variant="outline" size="sm">
                Contact Support
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
