import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useGetAdminOverviewQuery,
  useGetAdminPlansQuery,
  useGetAdminSubscriptionsQuery,
  useGetAdminFeatureFlagsQuery,
  useUpdateAdminFeatureFlagMutation,
  useGetAdminAuditLogsQuery,
  useUpdateAdminPlanMutation,
  useUpdateAdminSubscriptionMutation,
  useCreateAdminPlanMutation,
} from '@/services/api';
import { Loader2, Plus, Edit, Trash2, Users, Building2, DollarSign, TrendingUp } from 'lucide-react';

export default function AdminDashboardPage() {
  const [selectedTab, setSelectedTab] = useState('overview');
  const { data: overview, isLoading: overviewLoading } = useGetAdminOverviewQuery();
  const { data: plansData, isLoading: plansLoading } = useGetAdminPlansQuery();
  const { data: subscriptionsData, isLoading: subscriptionsLoading } = useGetAdminSubscriptionsQuery({});
  const { data: featureFlagsData, isLoading: flagsLoading } = useGetAdminFeatureFlagsQuery();
  const { data: auditLogsData, isLoading: auditLoading } = useGetAdminAuditLogsQuery({});

  const [createPlan] = useCreateAdminPlanMutation();
  const [updatePlan] = useUpdateAdminPlanMutation();
  const [updateSubscription] = useUpdateAdminSubscriptionMutation();
  const [updateFeatureFlag] = useUpdateAdminFeatureFlagMutation();

  const handleToggleFlag = async (key: string, enabled: boolean) => {
    try {
      await updateFeatureFlag({ key, data: { isEnabledGlobally: enabled } }).unwrap();
    } catch (error) {
      console.error('Failed to toggle flag:', error);
    }
  };

  const handleUpdatePlan = async (id: string, data: any) => {
    try {
      await updatePlan({ id, data }).unwrap();
    } catch (error) {
      console.error('Failed to update plan:', error);
    }
  };

  const handleUpdateSubscription = async (id: string, data: any) => {
    try {
      await updateSubscription({ id, data }).unwrap();
    } catch (error) {
      console.error('Failed to update subscription:', error);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage subscriptions, plans, feature flags, and tenant quotas</p>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="feature-flags">Feature Flags</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
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
                      <span className="font-semibold">{overview?.tenantCounts?.RESTAURANT || 0}</span>
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
                      <span className="font-semibold">${overview?.revenue?.mrr?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">ARR:</span>
                      <span className="font-semibold">${overview?.revenue?.arr?.toFixed(2) || '0.00'}</span>
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
                      <span className="font-semibold">{overview?.activity?.ordersLast24h || 0}</span>
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
                      <p className="text-sm text-gray-600">
                        ${plan.price_per_year}/yr
                      </p>
                    )}
                  </div>
                  {plan.description && (
                    <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
                  )}
                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-semibold text-gray-700">Limits:</p>
                    {plan.limits && Object.entries(plan.limits).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-gray-600">{key}:</span>
                        <span className="font-semibold">{value === -1 ? 'Unlimited' : value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-semibold text-gray-700">Features:</p>
                    <div className="flex flex-wrap gap-1">
                      {plan.features.map((feature) => (
                        <Badge key={feature} variant="outline">{feature}</Badge>
                      ))}
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
                          <p className="font-medium text-gray-900">{sub.tenant_name || 'Unknown'}</p>
                          <p className="text-sm text-gray-500">{sub.tenant_email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{sub.plan_name}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            sub.status === 'ACTIVE' ? 'default' :
                            sub.status === 'TRIALING' ? 'secondary' :
                            sub.status === 'CANCELLED' ? 'destructive' : 'secondary'
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

        <TabsContent value="tenants">
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Tenant management coming soon...</p>
          </div>
        </TabsContent>

        <TabsContent value="feature-flags" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Feature Flags</h2>
            <p className="text-sm text-gray-600">Toggle features globally or per-tenant</p>
          </div>

          {flagsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {featureFlagsData?.flags?.map((flag) => (
                <Card key={flag.id} className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{flag.feature_name}</h3>
                      {flag.description && (
                        <p className="text-sm text-gray-600 mt-1">{flag.description}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">Key: {flag.feature_key}</p>
                    </div>
                    <button
                      onClick={() => handleToggleFlag(flag.feature_key, !flag.is_enabled_globally)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        flag.is_enabled_globally ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          flag.is_enabled_globally ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="mt-3">
                    <Badge variant={flag.is_enabled_globally ? 'default' : 'secondary'}>
                      {flag.is_enabled_globally ? 'Enabled Globally' : 'Disabled Globally'}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="usage">
          <div className="text-center py-12">
            <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Usage and quotas tracking coming soon...</p>
          </div>
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
  );
}
