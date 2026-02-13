import { useState } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useGetAdminOverviewQuery,
  useGetAdminPlansQuery,
  useGetAdminSubscriptionsQuery,
  useGetAdminAuditLogsQuery,
  useUpdateAdminPlanMutation,
  useUpdateAdminSubscriptionMutation,
  useCreateAdminPlanMutation,
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
  useStartImpersonationMutation,
} from '@/services/api'
import {
  Loader2,
  Plus,
  Edit,
  Trash2,
  Users,
  Building2,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Package,
  UserCog,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface AdminDashboardPageProps {
  initialTab?: string
}

export function AdminDashboardPage({ initialTab = 'overview' }: AdminDashboardPageProps) {
  // Default to 'tenants' tab for supplier/restaurant admin views, otherwise use initialTab
  const defaultTab =
    initialTab === 'suppliers' || initialTab === 'restaurants' ? 'tenants' : initialTab
  const [selectedTab, setSelectedTab] = useState(defaultTab)
  const { data: overview, isLoading: overviewLoading } = useGetAdminOverviewQuery()
  const { data: plansData, isLoading: plansLoading } = useGetAdminPlansQuery()
  const { data: subscriptionsData, isLoading: subscriptionsLoading } =
    useGetAdminSubscriptionsQuery({})
  const { data: auditLogsData, isLoading: auditLoading } = useGetAdminAuditLogsQuery({})

  // Load tenant data
  const {
    data: suppliersData,
    isLoading: suppliersLoading,
    error: suppliersError,
  } = useGetAdminSuppliersQuery()
  const {
    data: restaurantsData,
    isLoading: restaurantsLoading,
    error: restaurantsError,
  } = useGetAdminRestaurantsQuery()

  // Debug: Log data to console
  console.log('AdminDashboard Debug:', {
    initialTab,
    suppliersData,
    restaurantsData,
    suppliersLoading,
    restaurantsLoading,
    suppliersError,
    restaurantsError,
  })

  const [createPlan] = useCreateAdminPlanMutation()
  const [updatePlan] = useUpdateAdminPlanMutation()
  const [updateSubscription] = useUpdateAdminSubscriptionMutation()
  const [startImpersonation] = useStartImpersonationMutation()

  const handleUpdatePlan = async (id: string, data: any) => {
    try {
      await updatePlan({ id, data }).unwrap()
    } catch (error) {
      console.error('Failed to update plan:', error)
    }
  }

  const handleUpdateSubscription = async (id: string, data: any) => {
    try {
      await updateSubscription({ id, data }).unwrap()
    } catch (error) {
      console.error('Failed to update subscription:', error)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage subscriptions, plans, and tenant quotas</p>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList
          className={
            initialTab === 'suppliers' || initialTab === 'restaurants'
              ? 'grid w-full grid-cols-3'
              : 'grid w-full grid-cols-6'
          }
        >
          {initialTab !== 'suppliers' && initialTab !== 'restaurants' && (
            <>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="plans">Plans</TabsTrigger>
              <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
              <TabsTrigger value="tenants">Tenants</TabsTrigger>
              <TabsTrigger value="usage">Usage</TabsTrigger>
              <TabsTrigger value="audit">Audit Logs</TabsTrigger>
            </>
          )}

          {(initialTab === 'suppliers' || initialTab === 'restaurants') && (
            <>
              <TabsTrigger value={initialTab === 'suppliers' ? 'tenants' : 'tenants'}>
                Directory
              </TabsTrigger>
              <TabsTrigger value="usage">Usage & Quotas</TabsTrigger>
              <TabsTrigger value="audit">Audit Logs</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {overviewLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Tenants</h3>
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Suppliers:</span>
                      <span className="font-semibold">{overview?.tenantCounts?.SUPPLIER || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Restaurants:</span>
                      <span className="font-semibold">
                        {overview?.tenantCounts?.RESTAURANT || 0}
                      </span>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Revenue</h3>
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">MRR:</span>
                      <span className="font-semibold">
                        ${overview?.revenue?.mrr?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">ARR:</span>
                      <span className="font-semibold">
                        ${overview?.revenue?.arr?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Activity (24h)</h3>
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Orders:</span>
                      <span className="font-semibold">
                        {overview?.activity?.ordersLast24h || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Chats:</span>
                      <span className="font-semibold">{overview?.activity?.chatsLast24h || 0}</span>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscription Status</h3>
                  <div className="space-y-3">
                    {Object.entries(overview?.subscriptionStats || {}).map(([status, count]) => (
                      <div key={status} className="flex justify-between items-center">
                        <Badge variant={status === 'ACTIVE' ? 'default' : 'secondary'}>
                          {status}
                        </Badge>
                        <span className="font-semibold">{count}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Alerts</h3>
                  <div className="space-y-2">
                    {overview?.alerts?.pastDueInvoices ? (
                      <Badge variant="destructive" className="w-full justify-center py-2">
                        {overview.alerts.pastDueInvoices} Past Due Invoices
                      </Badge>
                    ) : (
                      <p className="text-gray-500 text-sm">No alerts</p>
                    )}
                  </div>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="plans" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Subscription Plans</h2>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Plan
            </Button>
          </div>

          {plansLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plansData?.plans?.map((plan) => (
                <Card key={plan.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="mb-4">
                    <p className="text-3xl font-bold text-gray-900">
                      ${plan.price_per_month}
                      <span className="text-sm text-gray-600 font-normal">/mo</span>
                    </p>
                    {plan.price_per_year && (
                      <p className="text-sm text-gray-600">${plan.price_per_year}/yr</p>
                    )}
                  </div>
                  {plan.description && (
                    <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
                  )}
                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-semibold text-gray-700">Limits:</p>
                    {plan.limits &&
                      Object.entries(plan.limits).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-gray-600">{key}:</span>
                          <span className="font-semibold">
                            {value === -1 ? 'Unlimited' : value}
                          </span>
                        </div>
                      ))}
                  </div>
                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-semibold text-gray-700">Features:</p>
                    <div className="flex flex-wrap gap-1">
                      {plan.features && typeof plan.features === 'object' ? (
                        Object.entries(plan.features)
                          .map(([key, value]) => {
                            // Skip if value is false or empty
                            if (!value || value === false) return null
                            return (
                              <Badge key={key} variant={value ? 'default' : 'secondary'}>
                                {key.replace(/_/g, ' ')}
                              </Badge>
                            )
                          })
                          .filter(Boolean)
                      ) : (
                        <span className="text-sm text-gray-500">No features defined</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" variant="outline" className="flex-1">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Subscriptions</h2>
          </div>

          {subscriptionsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Tenant</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Plan</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Created</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptionsData?.subscriptions?.map((sub) => (
                    <tr key={sub.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-gray-900">
                            {sub.tenant_name || 'Unknown'}
                          </p>
                          <p className="text-sm text-gray-500">{sub.tenant_email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{sub.plan_name}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            sub.status === 'ACTIVE'
                              ? 'default'
                              : sub.status === 'TRIALING'
                                ? 'secondary'
                                : sub.status === 'CANCELLED'
                                  ? 'destructive'
                                  : 'secondary'
                          }
                        >
                          {sub.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{sub.tenant_type}</Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tenants" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">
              {initialTab === 'suppliers'
                ? 'Supplier Management'
                : initialTab === 'restaurants'
                  ? 'Restaurant Management'
                  : 'Tenant Management'}
            </h2>
          </div>

          {(() => {
            // Show only suppliers or restaurants based on initialTab
            const showSuppliersOnly = initialTab === 'suppliers'
            const showRestaurantsOnly = initialTab === 'restaurants'

            return (
              <div className="space-y-6">
                {/* Suppliers Section - Show if not restaurant-only view */}
                {!showRestaurantsOnly && (
                  <Card>
                    <CardHeader>
                      <h3 className="text-xl font-bold text-gray-900">Suppliers</h3>
                      <p className="text-sm text-gray-600">
                        Manage supplier tenants and subscriptions
                      </p>
                    </CardHeader>
                    <CardContent>
                      {suppliersError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded">
                          <p className="text-red-800">
                            Error loading suppliers. Check console for details.
                          </p>
                        </div>
                      ) : suppliersLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : !suppliersData?.suppliers || suppliersData.suppliers.length === 0 ? (
                        <p className="text-center py-8 text-gray-500">No suppliers found</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Supplier
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Plan
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Status
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Products
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Warehouses
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Revenue
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {suppliersData.suppliers.map((supplier: any) => (
                                <tr
                                  key={supplier.id}
                                  className="border-b border-gray-100 hover:bg-gray-50"
                                >
                                  <td className="py-3 px-4">
                                    <div>
                                      <p className="font-medium text-gray-900">{supplier.name}</p>
                                      <p className="text-sm text-gray-500">
                                        {supplier.contact_email}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge variant="outline">{supplier.plan_name || 'Free'}</Badge>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge
                                      variant={
                                        supplier.subscription_status === 'ACTIVE'
                                          ? 'default'
                                          : 'secondary'
                                      }
                                    >
                                      {supplier.subscription_status || 'NONE'}
                                    </Badge>
                                  </td>
                                  <td className="py-3 px-4 text-gray-600">
                                    {supplier.product_count || 0}
                                  </td>
                                  <td className="py-3 px-4 text-gray-600">
                                    {supplier.warehouse_count || 0}
                                  </td>
                                  <td className="py-3 px-4 text-gray-600">
                                    ${parseFloat(supplier.total_revenue || 0).toFixed(2)}
                                  </td>
                                  <td className="py-3 px-4 flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      title="View as this supplier"
                                      onClick={async () => {
                                        try {
                                          await startImpersonation({
                                            tenantId: supplier.id,
                                            tenantType: 'SUPPLIER',
                                          }).unwrap()
                                          toast.success(`Impersonating ${supplier.name}`)
                                          window.location.reload()
                                        } catch (e: any) {
                                          toast.error(
                                            e?.data?.error?.message ||
                                              'Failed to start impersonation'
                                          )
                                        }
                                      }}
                                    >
                                      <UserCog className="h-4 w-4 mr-1" />
                                      Impersonate
                                    </Button>
                                    <Button size="sm" variant="outline">
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Restaurants Section - Show if not supplier-only view */}
                {!showSuppliersOnly && (
                  <Card>
                    <CardHeader>
                      <h3 className="text-xl font-bold text-gray-900">Restaurants</h3>
                      <p className="text-sm text-gray-600">
                        Manage restaurant tenants and subscriptions
                      </p>
                    </CardHeader>
                    <CardContent>
                      {restaurantsError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded">
                          <p className="text-red-800">
                            Error loading restaurants. Check console for details.
                          </p>
                        </div>
                      ) : restaurantsLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : !restaurantsData?.restaurants ||
                        restaurantsData.restaurants.length === 0 ? (
                        <p className="text-center py-8 text-gray-500">No restaurants found</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Restaurant
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Plan
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Status
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Orders (30d)
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Total Spent
                                </th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {restaurantsData.restaurants.map((restaurant: any) => (
                                <tr
                                  key={restaurant.id}
                                  className="border-b border-gray-100 hover:bg-gray-50"
                                >
                                  <td className="py-3 px-4">
                                    <div>
                                      <p className="font-medium text-gray-900">{restaurant.name}</p>
                                      <p className="text-sm text-gray-500">
                                        {restaurant.contact_email}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge variant="outline">
                                      {restaurant.plan_name || 'Free'}
                                    </Badge>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge
                                      variant={
                                        restaurant.subscription_status === 'ACTIVE'
                                          ? 'default'
                                          : 'secondary'
                                      }
                                    >
                                      {restaurant.subscription_status || 'NONE'}
                                    </Badge>
                                  </td>
                                  <td className="py-3 px-4 text-gray-600">
                                    {restaurant.orders_last_30d || 0}
                                  </td>
                                  <td className="py-3 px-4 text-gray-600">
                                    ${parseFloat(restaurant.total_spent || 0).toFixed(2)}
                                  </td>
                                  <td className="py-3 px-4 flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      title="View as this restaurant"
                                      onClick={async () => {
                                        try {
                                          await startImpersonation({
                                            tenantId: restaurant.id,
                                            tenantType: 'RESTAURANT',
                                          }).unwrap()
                                          toast.success(`Impersonating ${restaurant.name}`)
                                          window.location.reload()
                                        } catch (e: any) {
                                          toast.error(
                                            e?.data?.error?.message ||
                                              'Failed to start impersonation'
                                          )
                                        }
                                      }}
                                    >
                                      <UserCog className="h-4 w-4 mr-1" />
                                      Impersonate
                                    </Button>
                                    <Button size="sm" variant="outline">
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )
          })()}
        </TabsContent>

        <TabsContent value="usage" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">
              {initialTab === 'suppliers'
                ? 'Supplier Usage & Quotas'
                : initialTab === 'restaurants'
                  ? 'Restaurant Usage & Quotas'
                  : 'Usage & Quotas'}
            </h2>
            <p className="text-sm text-gray-600">
              Monitor tenant resource usage against plan limits
            </p>
          </div>

          {/* Supplier-specific Usage View */}
          {initialTab === 'suppliers' && (
            <>
              <Card>
                <CardHeader>
                  <h3 className="text-xl font-bold text-gray-900">Supplier Usage Overview</h3>
                  <p className="text-sm text-gray-600">
                    Product and warehouse usage across all suppliers
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Total Products</span>
                        <Package className="h-4 w-4 text-blue-600" />
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {suppliersData?.suppliers?.reduce(
                          (sum, s) => sum + parseInt(s.product_count || 0),
                          0
                        ) || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Across all suppliers</p>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Active Suppliers</span>
                        <Building2 className="h-4 w-4 text-green-600" />
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {suppliersData?.suppliers?.length || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">With active subscriptions</p>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Over Limit</span>
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {suppliersData?.suppliers?.filter((s) => {
                          const limit =
                            s.plan_name === 'Free' ? 50 : s.plan_name === 'Bronze' ? 1000 : 10000
                          return parseInt(s.product_count || 0) > limit
                        }).length || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Suppliers over product limit</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h3 className="text-xl font-bold text-gray-900">Products by Supplier</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {suppliersData?.suppliers?.slice(0, 10).map((supplier: any) => {
                      const limit =
                        supplier.plan_name === 'Free'
                          ? 50
                          : supplier.plan_name === 'Bronze'
                            ? 1000
                            : 10000
                      const productCount = parseInt(supplier.product_count || 0)
                      const usage = (productCount / limit) * 100
                      return (
                        <div key={supplier.id} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{supplier.name}</span>
                            <span className={productCount > limit ? 'text-red-600' : ''}>
                              {productCount} / {limit}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${productCount > limit ? 'bg-red-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(usage, 100)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Restaurant-specific Usage View */}
          {initialTab === 'restaurants' && (
            <>
              <Card>
                <CardHeader>
                  <h3 className="text-xl font-bold text-gray-900">Restaurant Usage Overview</h3>
                  <p className="text-sm text-gray-600">
                    Orders and spending across all restaurants
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">30-Day Orders</span>
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {restaurantsData?.restaurants?.reduce(
                          (sum, r) => sum + parseInt(r.orders_last_30d || 0),
                          0
                        ) || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Total orders last 30 days</p>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Active Restaurants</span>
                        <Users className="h-4 w-4 text-green-600" />
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {restaurantsData?.restaurants?.length || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">With active subscriptions</p>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Total Spent (30d)</span>
                        <DollarSign className="h-4 w-4 text-green-600" />
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        $
                        {restaurantsData?.restaurants
                          ?.reduce((sum, r) => sum + parseFloat(r.total_spent || 0), 0)
                          .toFixed(2) || '0.00'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Across all restaurants</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h3 className="text-xl font-bold text-gray-900">Orders by Restaurant</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {restaurantsData?.restaurants?.slice(0, 10).map((restaurant: any) => {
                      const dailyLimit =
                        restaurant.plan_name === 'Free'
                          ? 10
                          : restaurant.plan_name === 'Bronze'
                            ? 100
                            : restaurant.plan_name === 'Gold'
                              ? 500
                              : -1
                      return (
                        <div key={restaurant.id} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{restaurant.name}</span>
                            <span>{restaurant.orders_last_30d || 0} orders</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            Daily limit: {dailyLimit === -1 ? 'Unlimited' : `${dailyLimit}/day`}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="audit">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Audit Logs</h2>
          </div>

          {auditLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {auditLogsData?.logs?.map((log) => (
                <Card key={log.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-gray-900">{log.action_type}</p>
                        <Badge variant="outline">{log.target_entity_type}</Badge>
                      </div>
                      <p className="text-sm text-gray-600">{log.action_description}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        By {log.admin_name} at {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
