import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import {
  Building2,
  Warehouse,
  MapPin,
  FileText,
  Clock,
  Package,
  ShoppingCart,
  Mail,
  Phone,
  Globe,
  Save,
  Loader2,
  DollarSign,
  CheckCircle2,
  Bell,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { LogoUpload } from '../components/LogoUpload'
import { BranchAccountsPanel } from '../components/BranchAccountsPanel'
import { SubscriptionInfo } from '../components/SubscriptionInfo'
import { useAppSelector, useAppDispatch } from '../hooks/redux'
import { formatCurrency } from '../utils/format'
import {
  getWarehouseAddGate,
  formatWarehouseGateMessage,
  canUseCustomBranding,
  customBrandingUpgradeMessage,
  warehousesFeatureEnabled,
  multiWarehousePlanEnabled,
  isEntitlementFeatureEnabled,
} from '../lib/planLimits'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { formatAddressLine, normalizeAddress } from '../lib/address'
import { ActivityLogTab } from '../components/ActivityLogTab'
import { DriversSettingsPanel } from '../components/fulfillment/DriversSettingsPanel'
import { TeamRolesPanel } from '../components/TeamRolesPanel'
import { BranchInvitationsPanel } from '../components/org/BranchInvitationsPanel'
import { usePermissions } from '../hooks/usePermissions'
import { usePushNotifications } from '../hooks/usePushNotifications'
import {
  useGetSupplierMeQuery,
  useUpdateSupplierMutation,
  useUploadSupplierLogoMutation,
  useGetPresignedUrlMutation,
  useGetProductsQuery,
  useGetOrdersQuery,
  useGetDashboardStatsQuery,
  useGetNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
  useGetEntitlementsQuery,
  useGetWarehousesQuery,
  useCreateWarehouseMutation,
  useGetSupplierFulfillmentQuery,
} from '../services/api'
import { RequirePermission } from '../components/RequirePermission'

const SUPPLIER_NOTIFICATION_DEFAULTS = {
  emailEnabled: true,
  whatsappEnabled: false,
  inAppEnabled: true,
  notifyOrderNew: true,
  notifyMessageReceived: true,
  notifyInvoiceIssued: true,
  notifyLowStock: true,
} as const

/** Unwired tabs hidden for demo — re-enable when backend exists. */
const CONTACTS_TAB_ENABLED = false
const DELIVERY_ZONES_ENABLED = false

const SUPPLIER_SETTINGS_URL_TABS = [
  'profile',
  'business',
  'warehouses',
  'notifications',
  'plan',
  'team',
  'drivers',
  'branches',
  'activity',
] as const

const SUPPLIER_NOTIFICATION_FIELDS: Array<{
  key: keyof typeof SUPPLIER_NOTIFICATION_DEFAULTS
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
    description: 'Get alerts on WhatsApp when your phone is on file.',
  },
  {
    key: 'inAppEnabled',
    label: 'In-app notifications',
    description: 'Show alerts inside Supplify.',
  },
  {
    key: 'notifyOrderNew',
    label: 'New orders',
    description: 'Be notified when restaurants place orders.',
  },
  {
    key: 'notifyMessageReceived',
    label: 'Chat messages',
    description: 'Receive pings for new chat messages.',
  },
  { key: 'notifyInvoiceIssued', label: 'Invoices', description: 'Invoice and payment reminders.' },
  { key: 'notifyLowStock', label: 'Low stock', description: 'Warehouse low stock warnings.' },
]

export function SupplierSettingsPage() {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { can, canAny } = usePermissions()
  const canWriteWarehouses = canAny('WAREHOUSES_EDIT', 'WAREHOUSES_MANAGE')
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('profile')
  const canViewSettings = can('SETTINGS_VIEW')
  const {
    data: supplierData,
    isLoading: isLoadingSupplier,
    refetch: refetchSupplier,
  } = useGetSupplierMeQuery(undefined, { skip: !canViewSettings })
  const [updateSupplier, { isLoading: isUpdating }] = useUpdateSupplierMutation()
  const [uploadSupplierLogo] = useUploadSupplierLogoMutation()
  const [getPresignedUrl] = useGetPresignedUrlMutation()

  // Get statistics for dashboard
  const { data: stats } = useGetDashboardStatsQuery()
  const { data: productsData } = useGetProductsQuery(
    { limit: 1000 },
    { skip: !supplierData?.supplier?.id }
  )
  const { data: ordersData } = useGetOrdersQuery(
    { limit: 100 },
    { skip: !supplierData?.supplier?.id }
  )

  const [showAddWarehouse, setShowAddWarehouse] = useState(false)

  const [notificationPrefs, setNotificationPrefs] = useState(SUPPLIER_NOTIFICATION_DEFAULTS)
  const {
    data: notificationPrefsData,
    isLoading: isLoadingNotificationPrefs,
    refetch: refetchNotificationPrefs,
  } = useGetNotificationPreferencesQuery(undefined, { skip: !user?.id })
  const [updateNotificationPreferences, { isLoading: isSavingNotificationPrefs }] =
    useUpdateNotificationPreferencesMutation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const entitlements = entitlementsData?.entitlements
  const tenantAuditEnabled = isEntitlementFeatureEnabled(entitlements, 'tenant_audit_log')
  const pushNotificationsEnabled = isEntitlementFeatureEnabled(entitlements, 'push_notifications')
  const push = usePushNotifications()
  const supplier = supplierData?.supplier
  const warehousesEnabled = warehousesFeatureEnabled(entitlements)
  const multiWarehousePlan = multiWarehousePlanEnabled(entitlements)
  const { data: warehousesData, refetch: refetchWarehouses } = useGetWarehousesQuery(undefined, {
    skip: !warehousesEnabled,
  })
  useGetSupplierFulfillmentQuery(undefined, { skip: !multiWarehousePlan })
  const [createWarehouse, { isLoading: isCreatingWarehouse }] = useCreateWarehouseMutation()
  const warehouseCount = warehousesData?.warehouses?.length ?? 0
  const warehouseGate = getWarehouseAddGate(entitlements, warehouseCount)
  const canAddWarehouse = warehouseGate.canAdd
  const brandingAllowed = canUseCustomBranding(entitlements)

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: '',
    legal_name: '',
    vat_no: '',
    trade_license_no: '',
    phone: '',
    contact_email: '',
    address: {
      street: '',
      city: '',
      region: '',
      country: '',
    },
    description: '',
    website: '',
  })

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

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (!tab) return
    if (tab === 'contacts' || tab === 'delivery') {
      setActiveTab('profile')
      return
    }
    if ((SUPPLIER_SETTINGS_URL_TABS as readonly string[]).includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  // Load supplier data into form
  useEffect(() => {
    if (supplier) {
      setProfileForm({
        name: supplier.name || '',
        legal_name: supplier.legal_name || '',
        vat_no: supplier.vat_no || '',
        trade_license_no: supplier.trade_license_no || '',
        phone: supplier.phone || '',
        contact_email: supplier.contact_email || '',
        address: normalizeAddress(supplier.address_json),
        description: supplier.description || '',
        website: supplier.website || '',
      })
    }
  }, [supplier])

  const handleLogoUpload = async (logoUrl: string) => {
    if (!supplier?.id) {
      toast.error('Supplier information not loaded')
      return
    }
    try {
      await uploadSupplierLogo({ id: supplier.id, logoUrl }).unwrap()
      refetchSupplier()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to upload logo')
    }
  }

  const handleGetPresignedUrl = async (params: {
    fileName: string
    fileType: string
    fileSize?: number
  }) => {
    const result = await getPresignedUrl(params).unwrap()
    return result
  }

  const handleSaveProfile = async () => {
    if (!supplier?.id) {
      toast.error('Supplier information not loaded')
      return
    }

    try {
      await updateSupplier({
        id: supplier.id,
        data: {
          name: profileForm.name,
          vatNo: profileForm.vat_no,
          phone: profileForm.phone,
          contactEmail: profileForm.contact_email,
          address: profileForm.address,
        },
      }).unwrap()

      // Also update fields that might not be in the standard schema
      // These would need to be added to the API schema if needed
      toast.success('Profile updated successfully!')
      refetchSupplier()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update profile')
    }
  }

  // Calculate statistics
  const statistics = useMemo(() => {
    const products = productsData?.products || []
    const orders = ordersData?.orders || []

    return {
      totalProducts: products.length,
      activeProducts: products.filter((p: any) => p.status === 'ACTIVE').length,
      totalOrders: stats?.totalOrders || orders.length,
      pendingOrders:
        stats?.pendingOrders ||
        orders.filter((o: any) => o.status === 'PENDING' || o.status === 'PLACED').length,
      completedOrders:
        stats?.completedOrders ||
        orders.filter((o: any) => o.status === 'COMPLETED' || o.status === 'DELIVERED').length,
      totalRevenue:
        stats?.totalRevenue ||
        orders
          .filter((o: any) => o.status === 'COMPLETED' || o.status === 'DELIVERED')
          .reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0),
    }
  }, [productsData, ordersData, stats])

  // Warehouse form state
  const [warehouseForm, setWarehouseForm] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    country: '',
    isMain: false,
  })

  const handleAddWarehouse = async () => {
    if (!canAddWarehouse) {
      toast.error(
        'Additional warehouses are not included on your current plan. Upgrade to add more.'
      )
      openBrowseUpgrade(dispatch, {
        currentPlan: entitlements?.plan?.name ?? null,
        upgradeUrl: '/app/settings?tab=plan',
      })
      return
    }
    if (!warehouseForm.name.trim()) {
      toast.error('Warehouse name is required')
      return
    }
    try {
      const address = [warehouseForm.address, warehouseForm.city, warehouseForm.country]
        .filter(Boolean)
        .join(', ')
      await createWarehouse({
        name: warehouseForm.name,
        code: warehouseForm.code || undefined,
        address: address || undefined,
      }).unwrap()
      toast.success('Warehouse added successfully!')
      await refetchWarehouses()
      setShowAddWarehouse(false)
      setWarehouseForm({ name: '', code: '', address: '', city: '', country: '', isMain: false })
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to add warehouse')
    }
  }

  if (isLoadingSupplier) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
      </div>
    )
  }

  return (
    <RequirePermission permission="SETTINGS_VIEW" title="supplier settings">
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">Supplier Settings</h1>
          <p className="text-[var(--text-muted)] mt-2">Manage your business profile and settings</p>
        </div>

        {/* Statistics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-[var(--brand-ultra)] to-[var(--brand-pale)] border-[var(--app-border)]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--brand-mid)]">Total Products</p>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {statistics.totalProducts}
                  </p>
                  <p className="text-xs text-[var(--brand-mid)] mt-1">
                    {statistics.activeProducts} active
                  </p>
                </div>
                <Package className="h-10 w-10 text-[var(--brand-mid)]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[var(--mint-pale)] to-[var(--mint-pale)] border-[var(--mint)]/35">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--mint)]">Total Orders</p>
                  <p className="text-2xl font-bold text-[var(--mint)]">{statistics.totalOrders}</p>
                  <p className="text-xs text-[var(--mint)] mt-1">
                    {statistics.completedOrders} completed
                  </p>
                </div>
                <ShoppingCart className="h-10 w-10 text-[var(--mint)]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[var(--amber-pale)] to-[var(--amber-pale)] border-[var(--amber-mid)]/35">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--amber)]">Pending Orders</p>
                  <p className="text-2xl font-bold text-[var(--amber)]">
                    {statistics.pendingOrders}
                  </p>
                  <p className="text-xs text-[var(--amber)] mt-1">Awaiting fulfillment</p>
                </div>
                <Clock className="h-10 w-10 text-[var(--amber-mid)]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[var(--brand-pale)] to-[var(--brand-ultra)] border-[var(--app-border)]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--brand-mid)]">Total Revenue</p>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {formatCurrency(statistics.totalRevenue)}
                  </p>
                  <p className="text-xs text-[var(--brand-mid)] mt-1">All-time</p>
                </div>
                <DollarSign className="h-10 w-10 text-[var(--brand-mid)]" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="justify-start">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            {CONTACTS_TAB_ENABLED && <TabsTrigger value="contacts">Contacts</TabsTrigger>}
            {(can('STAFF_VIEW') || can('SETTINGS_VIEW')) && (
              <TabsTrigger value="team">Team & roles</TabsTrigger>
            )}
            <TabsTrigger value="business">Business</TabsTrigger>
            {can('WAREHOUSES_VIEW') && <TabsTrigger value="warehouses">Warehouses</TabsTrigger>}
            {DELIVERY_ZONES_ENABLED && <TabsTrigger value="delivery">Delivery Zones</TabsTrigger>}
            <TabsTrigger value="drivers">Drivers</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="plan">Plan & usage</TabsTrigger>
            {can('SETTINGS_VIEW') && tenantAuditEnabled && (
              <TabsTrigger value="activity">Activity</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Company Logo
                </CardTitle>
                <CardDescription>
                  Upload your company logo. This will be displayed in your profile and to
                  restaurants.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!brandingAllowed && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span>{customBrandingUpgradeMessage(entitlements?.plan?.name)}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        openBrowseUpgrade(dispatch, {
                          currentPlan: entitlements?.plan?.name ?? null,
                          upgradeUrl: '/app/settings?tab=plan',
                        })
                      }
                    >
                      Compare plans
                    </Button>
                  </div>
                )}
                {supplier ? (
                  brandingAllowed ? (
                    <LogoUpload
                      currentLogo={supplier.logo_url}
                      onUpload={handleLogoUpload}
                      entityId={supplier.id}
                      entityName={supplier.name || 'Supplier'}
                      getPresignedUrl={handleGetPresignedUrl}
                    />
                  ) : supplier.logo_url ? (
                    <img
                      src={supplier.logo_url}
                      alt={`${supplier.name || 'Supplier'} logo`}
                      className="h-24 w-24 rounded-lg border object-contain bg-white"
                    />
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">
                      Upgrade to Gold or Platinum to upload your logo.
                    </p>
                  )
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Loading supplier information...
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Company Information
                </CardTitle>
                <CardDescription>
                  Update your company details and contact information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Company Name *</Label>
                    <Input
                      id="name"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      placeholder="Fresh Produce Co"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legal_name">Legal Name</Label>
                    <Input
                      id="legal_name"
                      value={profileForm.legal_name}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, legal_name: e.target.value })
                      }
                      placeholder="Fresh Produce Co LLC"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vat_no">VAT Number</Label>
                    <Input
                      id="vat_no"
                      value={profileForm.vat_no}
                      onChange={(e) => setProfileForm({ ...profileForm, vat_no: e.target.value })}
                      placeholder="VAT-123456"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trade_license_no">Trade License</Label>
                    <Input
                      id="trade_license_no"
                      value={profileForm.trade_license_no}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, trade_license_no: e.target.value })
                      }
                      placeholder="TL-456789"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact_email">Contact Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                      <Input
                        id="contact_email"
                        type="email"
                        value={profileForm.contact_email}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, contact_email: e.target.value })
                        }
                        placeholder="contact@example.com"
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                      <Input
                        id="phone"
                        type="tel"
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        placeholder="+1 (555) 123-4567"
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                    <Input
                      id="website"
                      type="url"
                      value={profileForm.website}
                      onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })}
                      placeholder="https://www.example.com"
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Company Description</Label>
                  <Textarea
                    id="description"
                    value={profileForm.description}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, description: e.target.value })
                    }
                    placeholder="Tell restaurants about your company..."
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="street">Street Address</Label>
                    <Input
                      id="street"
                      value={profileForm.address.street}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          address: { ...profileForm.address, street: e.target.value },
                        })
                      }
                      placeholder="123 Main Street"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={profileForm.address.city}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          address: { ...profileForm.address, city: e.target.value },
                        })
                      }
                      placeholder="City Name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">Region/State</Label>
                    <Input
                      id="region"
                      value={profileForm.address.region}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          address: { ...profileForm.address, region: e.target.value },
                        })
                      }
                      placeholder="State or Region"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={profileForm.address.country}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          address: { ...profileForm.address, country: e.target.value },
                        })
                      }
                      placeholder="Country"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleSaveProfile}
                  disabled={isUpdating}
                  className="w-full sm:w-auto"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="business" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Business Hours & Policies
                </CardTitle>
                <CardDescription>Set your operating hours and business policies</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">Operating Hours</h3>
                    <Badge variant="outline">Configure your weekly schedule</Badge>
                  </div>
                  <div className="space-y-3">
                    {[
                      'Monday',
                      'Tuesday',
                      'Wednesday',
                      'Thursday',
                      'Friday',
                      'Saturday',
                      'Sunday',
                    ].map((day) => (
                      <div
                        key={day}
                        className="flex flex-col gap-3 p-3 border rounded-lg hover:bg-[var(--brand-ultra)] sm:flex-row sm:items-center sm:gap-4"
                      >
                        <div className="w-full font-medium sm:w-28">{day}</div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                          <Input
                            type="time"
                            className="w-full min-w-[7rem] flex-1 sm:w-32 sm:flex-none"
                            placeholder="09:00"
                          />
                          <span className="text-[var(--text-muted)]">to</span>
                          <Input
                            type="time"
                            className="w-full min-w-[7rem] flex-1 sm:w-32 sm:flex-none"
                            placeholder="17:00"
                          />
                        </div>
                        <Button variant="outline" size="sm" className="w-full sm:ml-auto sm:w-auto">
                          Closed
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">Business Policies</h3>
                    <Badge variant="outline">Terms & Conditions</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Minimum Order Value ($)</Label>
                      <Input type="number" placeholder="100.00" />
                      <p className="text-xs text-[var(--text-muted)]">
                        Restaurants must order at least this amount
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Terms</Label>
                      <Input placeholder="Net 30" />
                      <p className="text-xs text-[var(--text-muted)]">
                        e.g., Net 30, Cash on Delivery
                      </p>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Return Policy</Label>
                      <Textarea placeholder="7 days return window for damaged goods..." rows={3} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Terms & Conditions</Label>
                      <Textarea placeholder="Your terms and conditions for orders..." rows={4} />
                    </div>
                  </div>
                </div>

                <Button>
                  <Save className="h-4 w-4 mr-2" />
                  Save Business Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {can('WAREHOUSES_VIEW') && (
            <TabsContent value="warehouses" className="space-y-4">
              {!warehousesEnabled ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-[var(--text-muted)] mb-3">
                      Warehouse management requires Silver or higher. Free accounts do not include
                      warehouse locations; any legacy default warehouse from older data is not
                      usable until you upgrade.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() =>
                        openBrowseUpgrade(dispatch, {
                          currentPlan: entitlements?.plan?.name ?? null,
                          upgradeUrl: '/app/settings?tab=plan',
                        })
                      }
                    >
                      View plans
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Warehouse className="h-5 w-5" />
                            Warehouses
                          </CardTitle>
                          <CardDescription>Manage your warehouse locations</CardDescription>
                        </div>
                        <Button
                          disabled={!canAddWarehouse || !canWriteWarehouses}
                          onClick={() => {
                            if (!canWriteWarehouses) {
                              toast.error('You do not have permission to manage warehouses')
                              return
                            }
                            if (!canAddWarehouse) {
                              openBrowseUpgrade(dispatch, {
                                currentPlan: entitlements?.plan?.name ?? null,
                                upgradeUrl: '/app/settings?tab=plan',
                              })
                              return
                            }
                            setShowAddWarehouse(true)
                          }}
                        >
                          <Warehouse className="h-4 w-4 mr-2" />
                          Add Warehouse
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!canAddWarehouse && (
                        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          {formatWarehouseGateMessage(warehouseGate)}
                        </div>
                      )}
                      <div className="space-y-3">
                        {(warehousesData?.warehouses ?? []).length === 0 ? (
                          <div className="text-center py-12 border-2 border-dashed border-[var(--app-border-mid)] rounded-lg">
                            <Warehouse className="h-12 w-12 mx-auto text-[var(--text-muted)] mb-2" />
                            <p className="text-[var(--text-muted)]">No warehouses yet</p>
                            <p className="text-sm text-[var(--text-muted)] mt-1">
                              Add a warehouse to manage multiple locations
                            </p>
                          </div>
                        ) : (
                          (warehousesData?.warehouses ?? []).map((wh: any) => (
                            <div
                              key={wh.id}
                              className="border rounded-lg p-4 hover:bg-[var(--brand-ultra)] transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-semibold">{wh.name}</h4>
                                    {wh.code && <Badge variant="outline">{wh.code}</Badge>}
                                    {(wh.is_default || wh.is_main) && (
                                      <Badge variant="secondary">Default</Badge>
                                    )}
                                  </div>
                                  {formatAddressLine(wh.address) && (
                                    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                                      <MapPin className="h-4 w-4" />
                                      <span>{formatAddressLine(wh.address)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          )}

          <TabsContent value="plan" className="space-y-4">
            <SubscriptionInfo />
          </TabsContent>
          <TabsContent value="branches" className="space-y-4">
            <BranchAccountsPanel entityLabel="supplier location" />
          </TabsContent>

          {(can('STAFF_VIEW') || can('SETTINGS_VIEW')) && (
            <TabsContent value="team" className="space-y-4">
              <TeamRolesPanel
                tenantType="SUPPLIER"
                renderInviteForm={
                  can('STAFF_INVITE') && supplier?.id
                    ? () => (
                        <p className="text-sm text-[var(--text-muted)] mt-2">
                          Use branch invitations below to invite staff with a role. Each person can
                          only belong to one supplier account.
                        </p>
                      )
                    : undefined
                }
              />
              {can('STAFF_INVITE') && supplier?.id && (
                <BranchInvitationsPanel supplierId={supplier.id} branchName={supplier.name} />
              )}
            </TabsContent>
          )}

          <TabsContent value="notifications" className="space-y-4">
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
                        <h4 className="text-sm font-semibold text-[var(--text-mid)]">
                          Browser push
                        </h4>
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
                                    Click the <strong>lock / tune icon</strong> left of the address
                                    bar
                                  </li>
                                  <li>
                                    Open <strong>Permissions</strong> → set{' '}
                                    <strong>Notifications</strong> to <strong>Allow</strong>
                                  </li>
                                  <li>Reload this page, then click Enable below</li>
                                </ol>
                                <p className="mt-2 text-[var(--text-muted)]">
                                  In Edge: Settings → Cookies and site permissions → All permissions
                                  → Notifications → remove this site if listed as blocked.
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
                                  const action = push.subscribed
                                    ? push.disablePush()
                                    : push.enablePush()
                                  action.catch((err: Error) =>
                                    toast.error(
                                      err?.message || 'Could not update push notifications'
                                    )
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
                        Browser push is not included on your plan. Upgrade to enable real-time
                        alerts.
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
          </TabsContent>

          <TabsContent value="drivers" className="space-y-4">
            <DriversSettingsPanel />
          </TabsContent>

          {can('SETTINGS_VIEW') && tenantAuditEnabled && (
            <TabsContent value="activity" className="space-y-4">
              <ActivityLogTab canExport={can('SETTINGS_MANAGE')} />
            </TabsContent>
          )}
        </Tabs>

        {pushNotificationsEnabled && push.bannerVisible && (
          <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-white p-4 shadow-lg">
            <p className="text-sm font-medium">Enable push notifications?</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Stay updated on orders and messages.
            </p>
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
        )}

        {/* Add Warehouse Dialog */}
        <Dialog open={showAddWarehouse} onOpenChange={setShowAddWarehouse}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Warehouse</DialogTitle>
              <DialogDescription>
                Create a new warehouse location for your business
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="warehouse-name">Warehouse Name *</Label>
                  <Input
                    id="warehouse-name"
                    placeholder="Main Warehouse"
                    value={warehouseForm.name}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warehouse-code">Warehouse Code *</Label>
                  <Input
                    id="warehouse-code"
                    placeholder="WH-001"
                    value={warehouseForm.code}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="warehouse-address">Street Address</Label>
                  <Input
                    id="warehouse-address"
                    placeholder="123 Farm Road"
                    value={warehouseForm.address}
                    onChange={(e) =>
                      setWarehouseForm({ ...warehouseForm, address: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warehouse-city">City</Label>
                  <Input
                    id="warehouse-city"
                    placeholder="Agricultural City"
                    value={warehouseForm.city}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warehouse-country">Country</Label>
                  <Input
                    id="warehouse-country"
                    placeholder="USA"
                    value={warehouseForm.country}
                    onChange={(e) =>
                      setWarehouseForm({ ...warehouseForm, country: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-center space-x-2 md:col-span-2">
                  <input
                    type="checkbox"
                    id="isMain"
                    checked={warehouseForm.isMain}
                    onChange={(e) =>
                      setWarehouseForm({ ...warehouseForm, isMain: e.target.checked })
                    }
                    className="rounded"
                  />
                  <Label htmlFor="isMain" className="text-sm font-medium">
                    Set as main warehouse
                  </Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddWarehouse(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddWarehouse} disabled={isCreatingWarehouse}>
                {isCreatingWarehouse ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add Warehouse
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequirePermission>
  )
}
