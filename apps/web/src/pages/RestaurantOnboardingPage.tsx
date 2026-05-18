import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
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
  Users,
  CreditCard,
  Settings,
  FileText,
  Phone,
  Mail,
  Plus,
  Trash2,
  Package,
  ShoppingCart,
  TrendingUp,
  Globe,
  Save,
  Loader2,
  DollarSign,
  MapPin,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Bell,
  MessageCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAppSelector } from '../hooks/redux'
import { formatCurrency } from '../utils/format'
import { SubscriptionInfo } from '../components/SubscriptionInfo'
import { LogoUpload } from '../components/LogoUpload'
import {
  useGetRestaurantMeQuery,
  useUpdateRestaurantMutation,
  useUploadRestaurantLogoMutation,
  useGetPresignedUrlMutation,
  useGetOrdersQuery,
  useGetDashboardStatsQuery,
  useGetNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
  useGetEntitlementsQuery,
  useGetBranchesQuery,
  useCreateBranchMutation,
  useDeleteBranchMutation,
  useGetRestaurantTeamQuery,
  useAddRestaurantTeamMemberMutation,
  useDeleteRestaurantTeamMemberMutation,
} from '../services/api'
import { BranchAccountsPanel } from '../components/BranchAccountsPanel'
import {
  canUseCustomBranding,
  customBrandingUpgradeMessage,
  formatBranchGateMessage,
  getBranchAddGate,
} from '../lib/planLimits'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { useAppDispatch } from '../hooks/redux'

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
}

interface PreferenceField {
  key: keyof typeof DEFAULT_NOTIFICATION_PREFS
  label: string
  description: string
  icon: LucideIcon
}

const CHANNEL_FIELDS: PreferenceField[] = [
  {
    key: 'emailEnabled',
    label: 'Email',
    description: 'Receive important alerts via email',
    icon: Mail,
  },
  {
    key: 'whatsappEnabled',
    label: 'WhatsApp',
    description: 'Receive alerts on WhatsApp (phone required in profile)',
    icon: MessageCircle,
  },
  { key: 'inAppEnabled', label: 'In-app', description: 'Show alerts inside Supplify', icon: Bell },
]

const CATEGORY_FIELDS: PreferenceField[] = [
  {
    key: 'notifyOrderNew',
    label: 'Order updates',
    description: 'New orders and status changes',
    icon: ShoppingCart,
  },
  {
    key: 'notifyMessageReceived',
    label: 'Supplier messages',
    description: 'Chat and inbox notifications',
    icon: Mail,
  },
  {
    key: 'notifyInvoiceIssued',
    label: 'Invoice reminders',
    description: 'Issued and overdue invoices',
    icon: FileText,
  },
  {
    key: 'notifyLowStock',
    label: 'Low stock alerts',
    description: 'Inventory thresholds reached',
    icon: AlertCircle,
  },
  {
    key: 'notifyReservationCreated',
    label: 'New reservations',
    description: 'Reservations booked by guests or staff',
    icon: Calendar,
  },
  {
    key: 'notifyReservationWaitlist',
    label: 'Waitlist changes',
    description: 'Guests added or moved on waitlist',
    icon: Clock,
  },
  {
    key: 'notifyStaffPto',
    label: 'PTO requests',
    description: 'Team time-off submissions awaiting review',
    icon: Users,
  },
  {
    key: 'notifyStaffSwap',
    label: 'Shift swap requests',
    description: 'Coverage and swap approvals',
    icon: Users,
  },
  {
    key: 'notifyScheduledOrder',
    label: 'Scheduled orders',
    description: 'Recurring orders executing automatically',
    icon: Package,
  },
]

export function RestaurantOnboardingPage() {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const [searchParams] = useSearchParams()
  const {
    data: restaurantData,
    isLoading: isLoadingRestaurant,
    refetch: refetchRestaurant,
  } = useGetRestaurantMeQuery()
  const [updateRestaurant, { isLoading: isUpdating }] = useUpdateRestaurantMutation()
  const [uploadRestaurantLogo] = useUploadRestaurantLogoMutation()
  const [getPresignedUrl] = useGetPresignedUrlMutation()

  // Get statistics for dashboard
  const { data: stats } = useGetDashboardStatsQuery()
  const { data: ordersData } = useGetOrdersQuery(
    { limit: 100 },
    { skip: !restaurantData?.restaurant?.id }
  )

  const [activeTab, setActiveTab] = useState('profile')

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['profile', 'team', 'branches', 'subscription', 'notifications'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const restaurant = restaurantData?.restaurant

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: '',
    business_type: '',
    trade_license_no: '',
    tax_id: '',
    vat_number: '',
    phone: '',
    contact_email: '',
    address: {
      street: '',
      city: '',
      region: '',
      country: '',
    },
    delivery_instructions: '',
    description: '',
    website: '',
  })

  // Load restaurant data into form
  useEffect(() => {
    if (restaurant) {
      setProfileForm({
        name: restaurant.name || '',
        business_type: restaurant.business_type || 'restaurant',
        trade_license_no: restaurant.trade_license_no || '',
        tax_id: restaurant.tax_id || '',
        vat_number: restaurant.vat_number || '',
        phone: restaurant.phone || '',
        contact_email: restaurant.contact_email || '',
        address: restaurant.address_json || {
          street: '',
          city: '',
          region: '',
          country: '',
        },
        delivery_instructions: restaurant.delivery_instructions || '',
        description: restaurant.description || '',
        website: restaurant.website || '',
      })
    }
  }, [restaurant])

  const handleLogoUpload = async (logoUrl: string) => {
    if (!restaurant?.id) {
      toast.error('Restaurant information not loaded')
      return
    }
    try {
      await uploadRestaurantLogo({ id: restaurant.id, logoUrl }).unwrap()
      refetchRestaurant()
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
    if (!restaurant?.id) {
      toast.error('Restaurant information not loaded')
      return
    }

    try {
      await updateRestaurant({
        id: restaurant.id,
        data: {
          name: profileForm.name,
          tradeLicenseNo: profileForm.trade_license_no,
          phone: profileForm.phone,
          contactEmail: profileForm.contact_email,
          address: profileForm.address,
        },
      }).unwrap()

      toast.success('Profile updated successfully!')
      refetchRestaurant()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update profile')
    }
  }

  // Calculate statistics
  const statistics = useMemo(() => {
    const orders = ordersData?.orders || []

    return {
      totalOrders: stats?.totalOrders || orders.length,
      pendingOrders:
        stats?.pendingOrders ||
        orders.filter((o: any) => o.status === 'PENDING' || o.status === 'PLACED').length,
      completedOrders:
        stats?.completedOrders ||
        orders.filter((o: any) => o.status === 'COMPLETED' || o.status === 'DELIVERED').length,
      totalSpent:
        stats?.totalSpent ||
        orders
          .filter((o: any) => o.status === 'COMPLETED' || o.status === 'DELIVERED')
          .reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0),
    }
  }, [ordersData, stats])

  // Team state
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false)
  const [showAddBranchDialog, setShowAddBranchDialog] = useState(false)
  const [newMember, setNewMember] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'manager',
    isPrimary: false,
  })
  const {
    data: teamData,
    isLoading: isLoadingTeam,
    refetch: refetchTeam,
  } = useGetRestaurantTeamQuery(undefined, {
    skip: !user?.id,
  })
  const [addTeamMember, { isLoading: isAddingTeamMember }] = useAddRestaurantTeamMemberMutation()
  const [deleteTeamMember] = useDeleteRestaurantTeamMemberMutation()
  const teamMembers = teamData?.team ?? []
  const [newBranch, setNewBranch] = useState({
    name: '',
    phone: '',
    address: '',
    deliveryInstructions: '',
  })

  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const entitlements = entitlementsData?.entitlements
  const { data: branchesData, refetch: refetchBranches } = useGetBranchesQuery(undefined, {
    skip: !user?.id,
  })
  const [createBranch, { isLoading: isCreatingBranch }] = useCreateBranchMutation()
  const [deleteBranch] = useDeleteBranchMutation()
  const branches = branchesData?.branches ?? []
  const branchGate = getBranchAddGate(entitlements, branches.length + 1)
  const brandingAllowed = canUseCustomBranding(entitlements)
  const canAddBranch = branchGate.canAdd

  // Notification preferences
  const [notificationPrefs, setNotificationPrefs] = useState(DEFAULT_NOTIFICATION_PREFS)
  const {
    data: notificationPrefsData,
    isLoading: isLoadingPrefs,
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

  const handleAddMember = async () => {
    if (!newMember.name || !newMember.email) {
      toast.error('Please fill in name and email')
      return
    }

    try {
      await addTeamMember({
        name: newMember.name,
        email: newMember.email,
        phone: newMember.phone || undefined,
        role: newMember.role,
        isPrimary: newMember.isPrimary,
      }).unwrap()
      setNewMember({ name: '', email: '', phone: '', role: 'manager', isPrimary: false })
      setShowAddMemberDialog(false)
      refetchTeam()
      toast.success('Team member added!')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to add team member')
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    try {
      await deleteTeamMember(memberId).unwrap()
      refetchTeam()
      toast.success('Member removed')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to remove member')
    }
  }

  const handleAddBranch = async () => {
    if (!canAddBranch) {
      toast.error(formatBranchGateMessage(branchGate))
      openBrowseUpgrade(dispatch, {
        currentPlan: entitlements?.plan?.name ?? null,
        upgradeUrl: '/app/settings?tab=subscription',
      })
      return
    }
    if (!newBranch.name) {
      toast.error('Please fill in branch name')
      return
    }

    try {
      await createBranch({
        name: newBranch.name,
        contact_phone: newBranch.phone || null,
        address: newBranch.address ? { street: newBranch.address } : null,
      }).unwrap()
      setNewBranch({ name: '', phone: '', address: '', deliveryInstructions: '' })
      setShowAddBranchDialog(false)
      refetchBranches()
      toast.success('Branch added!')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to add branch')
    }
  }

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

  if (isLoadingRestaurant) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-[21px] font-black text-[var(--text)]">Account Setup</h1>
        <p className="text-[var(--text-muted)] mt-2">
          Complete your business profile and preferences
        </p>
      </div>

      {/* Statistics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-[var(--brand-ultra)] to-[var(--brand-pale)] border-[var(--app-border)]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--brand-mid)]">Total Orders</p>
                <p className="text-2xl font-bold text-[var(--text)]">{statistics.totalOrders}</p>
                <p className="text-xs text-[var(--brand-mid)] mt-1">All orders</p>
              </div>
              <ShoppingCart className="h-10 w-10 text-[var(--brand-mid)]" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[var(--mint-pale)] to-[var(--mint-pale)] border-[var(--mint)]/35">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--mint)]">Completed Orders</p>
                <p className="text-2xl font-bold text-[var(--mint)]">
                  {statistics.completedOrders}
                </p>
                <p className="text-xs text-[var(--mint)] mt-1">Received</p>
              </div>
              <Package className="h-10 w-10 text-[var(--mint)]" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[var(--amber-pale)] to-[var(--amber-pale)] border-[var(--amber-mid)]/35">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--amber)]">Pending Orders</p>
                <p className="text-2xl font-bold text-[var(--amber)]">{statistics.pendingOrders}</p>
                <p className="text-xs text-[var(--amber)] mt-1">In progress</p>
              </div>
              <Clock className="h-10 w-10 text-[var(--amber-mid)]" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[var(--brand-pale)] to-[var(--brand-ultra)] border-[var(--app-border)]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--brand-mid)]">Total Spent</p>
                <p className="text-2xl font-bold text-[var(--text)]">
                  {formatCurrency(statistics.totalSpent)}
                </p>
                <p className="text-xs text-[var(--brand-mid)] mt-1">All-time</p>
              </div>
              <DollarSign className="h-10 w-10 text-[var(--brand-mid)]" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="profile">
            <Building2 className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="h-4 w-4 mr-2" />
            Team
          </TabsTrigger>
          <TabsTrigger value="branches">
            <FileText className="h-4 w-4 mr-2" />
            Branches
          </TabsTrigger>
          <TabsTrigger value="subscription">
            <CreditCard className="h-4 w-4 mr-2" />
            Subscription
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Settings className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Business Logo</CardTitle>
              <CardDescription>
                Upload your business logo. This will be displayed in your profile and to suppliers.
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
                        upgradeUrl: '/app/settings?tab=subscription',
                      })
                    }
                  >
                    Compare plans
                  </Button>
                </div>
              )}
              {restaurant ? (
                brandingAllowed ? (
                  <LogoUpload
                    currentLogo={restaurant.logo_url}
                    onUpload={handleLogoUpload}
                    entityId={restaurant.id}
                    entityName={restaurant.name || 'Restaurant'}
                    getPresignedUrl={handleGetPresignedUrl}
                  />
                ) : restaurant.logo_url ? (
                  <img
                    src={restaurant.logo_url}
                    alt={`${restaurant.name || 'Restaurant'} logo`}
                    className="h-24 w-24 rounded-lg border object-contain bg-white"
                  />
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Upgrade to Gold or Platinum to upload your logo.
                  </p>
                )
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  Loading restaurant information...
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Business Profile</CardTitle>
              <CardDescription>
                Update your business information and contact details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input
                    id="businessName"
                    placeholder="Enter business name"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessType">Business Type *</Label>
                  <select
                    id="businessType"
                    className="w-full px-3 py-2 border border-[var(--app-border-mid)] rounded-md"
                    value={profileForm.business_type}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, business_type: e.target.value })
                    }
                  >
                    <option value="restaurant">Restaurant</option>
                    <option value="cafe">Café</option>
                    <option value="hotel">Hotel</option>
                    <option value="catering">Catering</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">Registration Number</Label>
                  <Input
                    id="registrationNumber"
                    placeholder="Enter registration number"
                    value={profileForm.trade_license_no}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, trade_license_no: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxId">Tax ID</Label>
                  <Input
                    id="taxId"
                    placeholder="Enter tax ID"
                    value={profileForm.tax_id}
                    onChange={(e) => setProfileForm({ ...profileForm, tax_id: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vatNumber">VAT Number</Label>
                <Input
                  id="vatNumber"
                  placeholder="Enter VAT number"
                  value={profileForm.vat_number}
                  onChange={(e) => setProfileForm({ ...profileForm, vat_number: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contact-email">Contact Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                    <Input
                      id="contact-email"
                      type="email"
                      placeholder="contact@restaurant.com"
                      value={profileForm.contact_email}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, contact_email: e.target.value })
                      }
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-phone">Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                    <Input
                      id="contact-phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
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
                    placeholder="https://www.restaurant.com"
                    value={profileForm.website}
                    onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Business Description</Label>
                <Textarea
                  id="description"
                  placeholder="Tell suppliers about your restaurant..."
                  rows={4}
                  value={profileForm.description}
                  onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="street">Street Address</Label>
                  <Input
                    id="street"
                    placeholder="123 Main Street"
                    value={profileForm.address.street}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        address: { ...profileForm.address, street: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="City Name"
                    value={profileForm.address.city}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        address: { ...profileForm.address, city: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region">Region/State</Label>
                  <Input
                    id="region"
                    placeholder="State or Region"
                    value={profileForm.address.region}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        address: { ...profileForm.address, region: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    placeholder="Country"
                    value={profileForm.address.country}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        address: { ...profileForm.address, country: e.target.value },
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deliveryInstructions">Delivery Instructions</Label>
                <Textarea
                  id="deliveryInstructions"
                  placeholder="e.g., Gate A, Floor 2, Landmark: next to gas station"
                  rows={3}
                  value={profileForm.delivery_instructions}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, delivery_instructions: e.target.value })
                  }
                />
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

        {/* Team Tab */}
        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>Manage your team contacts</CardDescription>
                </div>
                <Button onClick={() => setShowAddMemberDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingTeam ? (
                <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading team…
                </div>
              ) : teamMembers.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-[var(--app-border-mid)] rounded-lg">
                  <Users className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
                  <p className="text-[var(--text-muted)]">No team members added yet</p>
                  <p className="text-sm text-[var(--text-muted)] mt-2">
                    Seeded staff appear under Staff; team contacts (owner, manager, etc.) show here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between border rounded-lg p-4 hover:bg-[var(--brand-ultra)] transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-medium">{member.name}</p>
                          {member.is_primary && <Badge variant="default">Primary</Badge>}
                          <Badge variant="outline" className="capitalize">
                            {member.role}
                          </Badge>
                          {member.branch_name && (
                            <Badge variant="secondary">{member.branch_name}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {member.email}
                          </span>
                          {member.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {member.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branches Tab */}
        <TabsContent value="branches" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Branch accounts</CardTitle>
                  <CardDescription>
                    Each branch is a separate account with its own orders, inventory, and settings.
                    Switch between them from the header after creating one.
                  </CardDescription>
                </div>
                <Button
                  disabled={!canAddBranch}
                  onClick={() => {
                    if (!canAddBranch) {
                      openBrowseUpgrade(dispatch, {
                        currentPlan: entitlements?.plan?.name ?? null,
                        upgradeUrl: '/app/settings?tab=subscription',
                      })
                      return
                    }
                    setShowAddBranchDialog(true)
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Branch
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!canAddBranch && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {formatBranchGateMessage(branchGate)}
                </div>
              )}
              {branches.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-[var(--app-border-mid)] rounded-lg">
                  <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
                  <p className="text-[var(--text-muted)]">No branch accounts yet</p>
                  <p className="text-sm text-[var(--text-muted)] mt-2">
                    Add a new account for each additional location (paid plans only)
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {branches.map((branch: any) => (
                    <div
                      key={branch.id}
                      className="flex items-center justify-between border rounded-lg p-4 hover:bg-[var(--brand-ultra)] transition-colors"
                    >
                      <div className="flex-1">
                        <p className="font-medium mb-2">{branch.name}</p>
                        <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                          {branch.contact_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {branch.contact_phone}
                            </span>
                          )}
                          {branch.address && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {typeof branch.address === 'string'
                                ? branch.address
                                : branch.address?.street || JSON.stringify(branch.address)}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await deleteBranch(branch.id).unwrap()
                            refetchBranches()
                            toast.success('Branch removed')
                          } catch (error: any) {
                            toast.error(error?.data?.error?.message || 'Failed to remove branch')
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription">
          <SubscriptionInfo />
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how you want to be notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingPrefs ? (
                <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading notification preferences…
                </div>
              ) : (
                <>
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--text-mid)]">
                      Delivery methods
                    </h4>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      {CHANNEL_FIELDS.map(({ key, label, description, icon: Icon }) => {
                        const checked = notificationPrefs[key]
                        return (
                          <label
                            key={key}
                            className="flex flex-col gap-2 rounded-xl border p-4 hover:bg-[var(--brand-ultra)] cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                                <span className="text-sm font-medium text-[var(--text)]">
                                  {label}
                                </span>
                              </div>
                              {checked && <CheckCircle2 className="h-5 w-5 text-[var(--mint)]" />}
                            </div>
                            <p className="text-xs text-[var(--text-muted)]">{description}</p>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={checked}
                              onChange={() => handleToggleNotification(key)}
                            />
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <h4 className="text-sm font-semibold text-[var(--text-mid)]">
                      Notification types
                    </h4>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {CATEGORY_FIELDS.map(({ key, label, description, icon: Icon }) => {
                        const checked = notificationPrefs[key]
                        return (
                          <label
                            key={key}
                            className="flex flex-col gap-2 rounded-xl border p-4 hover:bg-[var(--brand-ultra)] cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                                <div>
                                  <span className="text-sm font-medium text-[var(--text)]">
                                    {label}
                                  </span>
                                  <p className="text-xs text-[var(--text-muted)]">{description}</p>
                                </div>
                              </div>
                              {checked && <CheckCircle2 className="h-5 w-5 text-[var(--mint)]" />}
                            </div>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={checked}
                              onChange={() => handleToggleNotification(key)}
                            />
                          </label>
                        )
                      })}
                    </div>
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
                    {isSavingNotificationPrefs ? 'Saving preferences…' : 'Save Preferences'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Team Member Dialog */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Add a contact to your restaurant team</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="memberName">Name *</Label>
              <Input
                id="memberName"
                placeholder="Enter name"
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="memberEmail">Email *</Label>
              <Input
                id="memberEmail"
                type="email"
                placeholder="Enter email"
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="memberPhone">Phone</Label>
              <Input
                id="memberPhone"
                placeholder="Enter phone"
                value={newMember.phone}
                onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="memberRole">Role</Label>
              <select
                id="memberRole"
                className="w-full px-3 py-2 border border-[var(--app-border-mid)] rounded-md"
                value={newMember.role}
                onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
              >
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="purchasing">Purchasing</option>
                <option value="finance">Finance</option>
                <option value="kitchen">Kitchen</option>
              </select>
            </div>

            <Label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newMember.isPrimary}
                onChange={(e) => setNewMember({ ...newMember, isPrimary: e.target.checked })}
                className="h-4 w-4"
              />
              <span>Set as primary contact</span>
            </Label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={isAddingTeamMember}>
              {isAddingTeamMember ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding…
                </>
              ) : (
                'Add Member'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Branch Dialog */}
      <Dialog open={showAddBranchDialog} onOpenChange={setShowAddBranchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Branch</DialogTitle>
            <DialogDescription>Add a new branch location</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branchName">Branch Name *</Label>
              <Input
                id="branchName"
                placeholder="e.g., Downtown Branch"
                value={newBranch.name}
                onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branchPhone">Phone</Label>
              <Input
                id="branchPhone"
                placeholder="Enter phone"
                value={newBranch.phone}
                onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branchAddress">Address</Label>
              <Input
                id="branchAddress"
                placeholder="Enter address"
                value={newBranch.address}
                onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branchDeliveryInstructions">Delivery Instructions</Label>
              <Textarea
                id="branchDeliveryInstructions"
                placeholder="Special instructions for deliveries..."
                rows={3}
                value={newBranch.deliveryInstructions}
                onChange={(e) =>
                  setNewBranch({ ...newBranch, deliveryInstructions: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBranchDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddBranch}>Add Branch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
