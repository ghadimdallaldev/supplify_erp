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
  AlertCircle,
  UserPlus,
  Upload,
  Package,
  ShoppingCart,
  TrendingUp,
  Mail,
  Phone,
  Globe,
  Save,
  Loader2,
  Activity,
  Users,
  DollarSign,
  Calendar,
  CheckCircle2,
  XCircle,
  Bell,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Papa from 'papaparse'
import { LogoUpload } from '../components/LogoUpload'
import { BranchAccountsPanel } from '../components/BranchAccountsPanel'
import { SubscriptionInfo } from '../components/SubscriptionInfo'
import { useAppSelector, useAppDispatch } from '../hooks/redux'
import { formatCurrency } from '../utils/format'
import {
  canAddWarehouses,
  canUseCustomBranding,
  customBrandingUpgradeMessage,
} from '../lib/planLimits'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
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
} from '../services/api'

const SUPPLIER_NOTIFICATION_DEFAULTS = {
  emailEnabled: true,
  whatsappEnabled: false,
  inAppEnabled: true,
  notifyOrderNew: true,
  notifyMessageReceived: true,
  notifyInvoiceIssued: true,
  notifyLowStock: true,
} as const

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
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('profile')
  const {
    data: supplierData,
    isLoading: isLoadingSupplier,
    refetch: refetchSupplier,
  } = useGetSupplierMeQuery()
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
  const [showAddZone, setShowAddZone] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [uploadedContacts, setUploadedContacts] = useState<any[]>([])

  const [notificationPrefs, setNotificationPrefs] = useState(SUPPLIER_NOTIFICATION_DEFAULTS)
  const {
    data: notificationPrefsData,
    isLoading: isLoadingNotificationPrefs,
    refetch: refetchNotificationPrefs,
  } = useGetNotificationPreferencesQuery(undefined, { skip: !user?.id })
  const [updateNotificationPreferences, { isLoading: isSavingNotificationPrefs }] =
    useUpdateNotificationPreferencesMutation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const { data: warehousesData, refetch: refetchWarehouses } = useGetWarehousesQuery()
  const [createWarehouse, { isLoading: isCreatingWarehouse }] = useCreateWarehouseMutation()
  const entitlements = entitlementsData?.entitlements
  // Main warehouse placeholder counts as one location under plan limits.
  const canAddWarehouse = canAddWarehouses(entitlements, 1)
  const brandingAllowed = canUseCustomBranding(entitlements)

  const supplier = supplierData?.supplier

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
    if (
      tab &&
      [
        'profile',
        'contacts',
        'business',
        'warehouses',
        'delivery',
        'notifications',
        'plan',
      ].includes(tab)
    ) {
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
        address: supplier.address_json || {
          street: '',
          city: '',
          region: '',
          country: '',
        },
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

  // Delivery zone form state
  const [zoneForm, setZoneForm] = useState({
    name: '',
    deliveryFee: '',
    minOrderAmount: '',
    deliveryTimeDays: '',
  })

  // Contact form state
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    isPrimary: false,
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

  const handleAddZone = () => {
    // TODO: Implement API call to add delivery zone
    console.log('Adding delivery zone:', zoneForm)
    toast.success('Delivery zone added successfully!')
    setShowAddZone(false)
    setZoneForm({
      name: '',
      deliveryFee: '',
      minOrderAmount: '',
      deliveryTimeDays: '',
    })
  }

  const handleAddContact = () => {
    // TODO: Implement API call to add contact
    console.log('Adding contact:', contactForm)
    toast.success('Contact added successfully!')
    setShowAddContact(false)
    setContactForm({
      name: '',
      email: '',
      phone: '',
      role: '',
      isPrimary: false,
    })
  }

  const handleFileUpload = (event: any) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a CSV or Excel file')
      return
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const contacts = results.data
            .map((row: any, index) => ({
              id: index + 1,
              name: row.Name || row.name || '',
              email: row.Email || row.email || '',
              phone: row.Phone || row.phone || '',
              role: row.Role || row.role || row.Title || row.title || '',
              isPrimary: row['Is Primary'] === 'true' || row['is_primary'] === 'true' || false,
            }))
            .filter((contact) => contact.name && contact.email)

          if (contacts.length === 0) {
            toast.error('No valid contacts found in the file')
            return
          }

          setUploadedContacts(contacts)
          toast.success(`Imported ${contacts.length} contacts`)
        } catch (error) {
          toast.error('Error parsing file')
          console.error(error)
        }
      },
      error: (error) => {
        toast.error('Error reading file')
        console.error(error)
      },
    })
  }

  const handleSaveBulkContacts = () => {
    if (uploadedContacts.length === 0) {
      toast.error('No contacts to save')
      return
    }

    // TODO: Implement API call to save bulk contacts
    console.log('Saving contacts:', uploadedContacts)
    toast.success(`${uploadedContacts.length} contacts uploaded successfully!`)
    setShowBulkUpload(false)
    setUploadedContacts([])
  }

  if (isLoadingSupplier) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
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
                <p className="text-2xl font-bold text-[var(--text)]">{statistics.totalProducts}</p>
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
                <p className="text-2xl font-bold text-[var(--amber)]">{statistics.pendingOrders}</p>
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
        <TabsList className="flex h-auto w-full flex-wrap gap-1 p-1">
          <TabsTrigger value="profile" className="flex-1 min-w-[5.5rem] sm:flex-none">
            Profile
          </TabsTrigger>
          <TabsTrigger value="contacts" className="flex-1 min-w-[5.5rem] sm:flex-none">
            Contacts
          </TabsTrigger>
          <TabsTrigger value="business" className="flex-1 min-w-[5.5rem] sm:flex-none">
            Business
          </TabsTrigger>
          <TabsTrigger value="warehouses" className="flex-1 min-w-[5.5rem] sm:flex-none">
            Warehouses
          </TabsTrigger>
          <TabsTrigger value="delivery" className="flex-1 min-w-[5.5rem] sm:flex-none">
            Delivery Zones
          </TabsTrigger>
          <TabsTrigger value="branches" className="flex-1 min-w-[5.5rem] sm:flex-none">
            Branches
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex-1 min-w-[5.5rem] sm:flex-none">
            Notifications
          </TabsTrigger>
          <TabsTrigger value="plan" className="flex-1 min-w-[5.5rem] sm:flex-none">
            Plan & usage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Company Logo
              </CardTitle>
              <CardDescription>
                Upload your company logo. This will be displayed in your profile and to restaurants.
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
                <p className="text-sm text-[var(--text-muted)]">Loading supplier information...</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Information
              </CardTitle>
              <CardDescription>Update your company details and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                    onChange={(e) => setProfileForm({ ...profileForm, legal_name: e.target.value })}
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

              <div className="grid grid-cols-2 gap-4">
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
                  onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
                  placeholder="Tell restaurants about your company..."
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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

              <Button onClick={handleSaveProfile} disabled={isUpdating}>
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

        <TabsContent value="contacts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Business Contacts
                  </CardTitle>
                  <CardDescription>Manage business contact information</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowBulkUpload(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload CSV/Excel
                  </Button>
                  <Button onClick={() => setShowAddContact(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Contact
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-lg p-4 hover:bg-[var(--brand-ultra)] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">John Doe</h4>
                        <Badge variant="secondary">Sales Manager</Badge>
                        <Badge className="bg-[var(--brand)] text-white">Primary</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          john.doe@freshproduce.com
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          +1 (555) 123-4567
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[var(--red)] hover:text-[var(--red)]"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4 hover:bg-[var(--brand-ultra)] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">Jane Smith</h4>
                        <Badge variant="secondary">Operations Lead</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          jane.smith@freshproduce.com
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          +1 (555) 987-6543
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[var(--red)] hover:text-[var(--red)]"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="text-center py-8 border-2 border-dashed border-[var(--app-border-mid)] rounded-lg">
                  <UserPlus className="h-12 w-12 mx-auto text-[var(--text-muted)] mb-2" />
                  <p className="text-[var(--text-muted)]">No additional contacts</p>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Add contacts to manage your team
                  </p>
                </div>
              </div>
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
                      className="flex items-center gap-4 p-3 border rounded-lg hover:bg-[var(--brand-ultra)]"
                    >
                      <div className="w-28 font-medium">{day}</div>
                      <Input type="time" className="w-32" placeholder="09:00" />
                      <span className="text-[var(--text-muted)]">to</span>
                      <Input type="time" className="w-32" placeholder="17:00" />
                      <Button variant="outline" size="sm" className="ml-auto">
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
                <div className="grid grid-cols-2 gap-4">
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
                  <div className="space-y-2 col-span-2">
                    <Label>Return Policy</Label>
                    <Textarea placeholder="7 days return window for damaged goods..." rows={3} />
                  </div>
                  <div className="space-y-2 col-span-2">
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

        <TabsContent value="warehouses" className="space-y-4">
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
                  disabled={!canAddWarehouse}
                  onClick={() => {
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
                  Additional warehouses are not available on the Free plan. Upgrade to Bronze or
                  higher to add warehouse locations.
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
                          </div>
                          {wh.address && (
                            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                              <MapPin className="h-4 w-4" />
                              <span>{wh.address}</span>
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
        </TabsContent>

        <TabsContent value="plan" className="space-y-4">
          <SubscriptionInfo />
        </TabsContent>
        <TabsContent value="branches" className="space-y-4">
          <BranchAccountsPanel entityLabel="supplier location" />
        </TabsContent>

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

        <TabsContent value="delivery" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Delivery Zones
                  </CardTitle>
                  <CardDescription>Manage delivery coverage areas and pricing</CardDescription>
                </div>
                <Button onClick={() => setShowAddZone(true)}>
                  <MapPin className="h-4 w-4 mr-2" />
                  Add Zone
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-lg p-4 hover:bg-[var(--brand-ultra)] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Downtown Zone</h4>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-[var(--text-muted)]">Fee:</span>
                          <span className="ml-2 font-medium">$10.00</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)]">Min Order:</span>
                          <span className="ml-2 font-medium">$50.00</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)]">Delivery:</span>
                          <span className="ml-2 font-medium">2 days</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </div>
                </div>

                <div className="text-center py-12 border-2 border-dashed border-[var(--app-border-mid)] rounded-lg">
                  <MapPin className="h-12 w-12 mx-auto text-[var(--text-muted)] mb-2" />
                  <p className="text-[var(--text-muted)]">No additional delivery zones</p>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Add zones to define delivery areas and pricing
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Warehouse Dialog */}
      <Dialog open={showAddWarehouse} onOpenChange={setShowAddWarehouse}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Warehouse</DialogTitle>
            <DialogDescription>Create a new warehouse location for your business</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-2 col-span-2">
                <Label htmlFor="warehouse-address">Street Address</Label>
                <Input
                  id="warehouse-address"
                  placeholder="123 Farm Road"
                  value={warehouseForm.address}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })}
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
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, country: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2 col-span-2">
                <input
                  type="checkbox"
                  id="isMain"
                  checked={warehouseForm.isMain}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, isMain: e.target.checked })}
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

      {/* Add Delivery Zone Dialog */}
      <Dialog open={showAddZone} onOpenChange={setShowAddZone}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Delivery Zone</DialogTitle>
            <DialogDescription>Create a new delivery coverage zone</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="zone-name">Zone Name *</Label>
              <Input
                id="zone-name"
                placeholder="Downtown Zone"
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="delivery-fee">Delivery Fee ($)</Label>
                <Input
                  id="delivery-fee"
                  type="number"
                  placeholder="10.00"
                  value={zoneForm.deliveryFee}
                  onChange={(e) => setZoneForm({ ...zoneForm, deliveryFee: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min-order">Min Order Amount ($)</Label>
                <Input
                  id="min-order"
                  type="number"
                  placeholder="50.00"
                  value={zoneForm.minOrderAmount}
                  onChange={(e) => setZoneForm({ ...zoneForm, minOrderAmount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery-time">Delivery Time (days)</Label>
                <Input
                  id="delivery-time"
                  type="number"
                  placeholder="2"
                  value={zoneForm.deliveryTimeDays}
                  onChange={(e) => setZoneForm({ ...zoneForm, deliveryTimeDays: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Coverage Area (Map Integration)</Label>
              <div className="border-2 border-dashed border-[var(--app-border-mid)] rounded-lg p-8 text-center">
                <MapPin className="h-12 w-12 mx-auto text-[var(--text-muted)] mb-2" />
                <p className="text-sm text-[var(--text-muted)]">
                  Map picker will be integrated here
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Draw polygon or select area</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddZone(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddZone}>Add Zone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
            <DialogDescription>Add a business contact person</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="contact-name">Name *</Label>
              <Input
                id="contact-name"
                placeholder="John Doe"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email *</Label>
                <Input
                  id="contact-email"
                  type="email"
                  placeholder="john.doe@example.com"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-phone">Phone *</Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-role">Role/Title</Label>
              <Input
                id="contact-role"
                placeholder="Sales Manager"
                value={contactForm.role}
                onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isPrimary"
                checked={contactForm.isPrimary}
                onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="isPrimary" className="text-sm font-medium">
                Set as primary contact
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddContact(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddContact}>Add Contact</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Upload Feature */}
      <Dialog open={showBulkUpload} onOpenChange={setShowBulkUpload}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Upload Contacts from CSV/Excel</DialogTitle>
            <DialogDescription>Upload a spreadsheet file to bulk add contacts</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-[var(--app-border-mid)] rounded-lg p-8 text-center hover:border-[var(--brand-mid)] cursor-pointer transition-colors">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="h-12 w-12 mx-auto text-[var(--text-muted)] mb-2" />
                <p className="text-sm text-[var(--text-muted)]">Drop your CSV/Excel file here</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">or click to browse</p>
              </label>
            </div>
            <div className="text-sm text-[var(--text-muted)] bg-[var(--brand-ultra)] p-4 rounded-lg">
              <p className="font-medium mb-2">Expected columns:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Name (required)</li>
                <li>Email (required)</li>
                <li>Phone</li>
                <li>Role or Title</li>
                <li>Is Primary (true/false, optional)</li>
              </ul>
            </div>

            {uploadedContacts.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium text-sm">Preview ({uploadedContacts.length} contacts):</p>
                <div className="max-h-48 overflow-y-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--brand-ultra)]">
                      <tr>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-left">Phone</th>
                        <th className="px-3 py-2 text-left">Role</th>
                        <th className="px-3 py-2 text-center">Primary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadedContacts.map((contact) => (
                        <tr key={contact.id} className="border-t">
                          <td className="px-3 py-2">{contact.name}</td>
                          <td className="px-3 py-2">{contact.email}</td>
                          <td className="px-3 py-2">{contact.phone}</td>
                          <td className="px-3 py-2">{contact.role}</td>
                          <td className="px-3 py-2 text-center">
                            {contact.isPrimary ? (
                              <CheckCircle2 className="h-4 w-4 text-[var(--mint)] mx-auto" />
                            ) : (
                              <XCircle className="h-4 w-4 text-[var(--text-muted)] mx-auto" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowBulkUpload(false)
                setUploadedContacts([])
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveBulkContacts} disabled={uploadedContacts.length === 0}>
              Upload {uploadedContacts.length > 0 ? `(${uploadedContacts.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
