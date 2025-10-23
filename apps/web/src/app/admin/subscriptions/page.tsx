'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, TrendingUp, Calendar, Edit, CheckCircle, X, Search, Filter, Building2, Store } from 'lucide-react';

interface OrgSubscription {
  id: string;
  orgId: string;
  orgName: string;
  orgType: string;
  planCode: string;
  status: string;
  startsAt: string;
  endsAt?: string;
  trialEndsAt?: string;
  updatedBy: string;
}

interface Supplier {
  id: string;
  orgName: string;
  taxId: string;
  kycStatus: string;
  billingPlan: string;
  promoCredits: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  description?: string;
}

interface Restaurant {
  id: string;
  orgName: string;
  taxId: string;
  kycStatus: string;
  billingPlan: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  description?: string;
}

/**
 * Admin Subscription Management Page
 * Manage all organization subscriptions with complete supplier/restaurant lists
 */
export default function AdminSubscriptionsPage() {
  const [showAssignDrawer, setShowAssignDrawer] = useState(false);
  const [selectedSub, setSelectedSub] = useState<OrgSubscription | null>(null);
  const [filterPlan, setFilterPlan] = useState<string>('');
  const [filterOrgType, setFilterOrgType] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const queryClient = useQueryClient();

  // Fetch all subscriptions
  const { data: subscriptions, isLoading: subscriptionsLoading } = useQuery({
    queryKey: ['admin', 'subscriptions', filterPlan, filterOrgType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterOrgType) params.append('orgType', filterOrgType);
      if (filterPlan) params.append('planCode', filterPlan);
      
      const response = await fetch(`/api/admin/subscriptions?type=subscriptions&${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch subscriptions');
      return response.json();
    },
  });

  // Fetch suppliers
  const { data: suppliers, isLoading: suppliersLoading } = useQuery({
    queryKey: ['admin', 'suppliers'],
    queryFn: async () => {
      const response = await fetch('/api/admin/subscriptions?type=suppliers');
      if (!response.ok) throw new Error('Failed to fetch suppliers');
      return response.json();
    },
  });

  // Fetch restaurants
  const { data: restaurants, isLoading: restaurantsLoading } = useQuery({
    queryKey: ['admin', 'restaurants'],
    queryFn: async () => {
      const response = await fetch('/api/admin/subscriptions?type=restaurants');
      if (!response.ok) throw new Error('Failed to fetch restaurants');
      return response.json();
    },
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['admin', 'subscriptions', 'stats'],
    queryFn: async () => {
      const response = await fetch('/api/admin/subscriptions?type=stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
  });

  // Assign subscription mutation
  const assignMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign_subscription',
          data,
        }),
      });

      if (!response.ok) throw new Error('Failed to assign subscription');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'restaurants'] });
      setShowAssignDrawer(false);
    },
  });

  // Update subscription mutation
  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_subscription',
          data,
        }),
      });

      if (!response.ok) throw new Error('Failed to update subscription');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'restaurants'] });
      setShowAssignDrawer(false);
    },
  });

  const isLoading = subscriptionsLoading || suppliersLoading || restaurantsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Subscription Management</h1>
            <p className="text-gray-600 mt-2">Manage organization subscriptions and tiers</p>
          </div>
          <button
            onClick={() => setShowAssignDrawer(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Users className="h-5 w-5" />
            Assign Subscription
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <StatCard
              label="Total Subscriptions"
              value={stats.totalSubscriptions}
              icon={<Users className="h-6 w-6" />}
              color="blue"
            />
            <StatCard
              label="Active"
              value={stats.activeSubscriptions}
              icon={<CheckCircle className="h-6 w-6" />}
              color="green"
            />
            <StatCard
              label="Trials Ending Soon"
              value={stats.trialsEndingSoon}
              icon={<Calendar className="h-6 w-6" />}
              color="orange"
            />
            <StatCard
              label="Premium Customers"
              value={stats.byPlan?.PREMIUM || 0}
              icon={<TrendingUp className="h-6 w-6" />}
              color="purple"
            />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search organizations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={filterOrgType}
              onChange={(e) => setFilterOrgType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Organization Types</option>
              <option value="SUPPLIER">Suppliers</option>
              <option value="RESTAURANT">Restaurants</option>
            </select>

            <select
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Plans</option>
              <option value="FREE">Free</option>
              <option value="BASIC">Basic</option>
              <option value="PRO">Pro</option>
              <option value="PREMIUM">Premium</option>
            </select>

            <div className="text-sm text-gray-600 flex items-center">
              Showing {subscriptions?.length || 0} subscriptions
            </div>
          </div>
        </div>

        {/* Subscriptions Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Organization
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Plan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Trial Ends
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Started
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {subscriptions?.map((sub: OrgSubscription) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    <div>
                      <div className="font-medium">{sub.orgName}</div>
                      <div className="text-gray-500 text-xs">{sub.orgId}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      sub.orgType === 'SUPPLIER' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {sub.orgType === 'SUPPLIER' ? <Building2 className="h-3 w-3 mr-1" /> : <Store className="h-3 w-3 mr-1" />}
                      {sub.orgType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      sub.planCode === 'PREMIUM' ? 'bg-purple-100 text-purple-800' :
                      sub.planCode === 'PRO' ? 'bg-blue-100 text-blue-800' :
                      sub.planCode === 'BASIC' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {sub.planCode}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      sub.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {sub.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(sub.startsAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    <button
                      onClick={() => {
                        setSelectedSub(sub);
                        setShowAssignDrawer(true);
                      }}
                      className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      <Edit className="h-4 w-4" /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {subscriptions?.length === 0 && (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No subscriptions found</p>
            </div>
          )}
        </div>

        {/* Assign/Edit Drawer */}
        {showAssignDrawer && (
          <AssignSubscriptionDrawer
            subscription={selectedSub}
            suppliers={suppliers || []}
            restaurants={restaurants || []}
            onClose={() => {
              setShowAssignDrawer(false);
              setSelectedSub(null);
            }}
            onSave={(data) => {
              if (selectedSub) {
                updateMutation.mutate({ ...data, id: selectedSub.id });
              } else {
                assignMutation.mutate(data);
              }
            }}
            isLoading={assignMutation.isPending || updateMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: any) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className={`rounded-full p-3 ${colorClasses[color as keyof typeof colorClasses]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function AssignSubscriptionDrawer({ subscription, suppliers, restaurants, onClose, onSave, isLoading }: any) {
  const [formData, setFormData] = useState({
    orgId: subscription?.orgId || '',
    orgName: subscription?.orgName || '',
    orgType: subscription?.orgType || 'SUPPLIER',
    planCode: subscription?.planCode || 'BASIC',
    trialDays: 30,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<any>(null);

  // Filter organizations based on search and type
  const filteredOrgs = formData.orgType === 'SUPPLIER' 
    ? suppliers.filter((org: any) => 
        org.orgName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : restaurants.filter((org: any) => 
        org.orgName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.id.toLowerCase().includes(searchQuery.toLowerCase())
      );

  const handleOrgSelect = (org: any) => {
    setSelectedOrg(org);
    setFormData({
      ...formData,
      orgId: org.id,
      orgName: org.orgName,
    });
  };

  const handleSubmit = () => {
    if (!selectedOrg) {
      alert('Please select an organization');
      return;
    }
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-end">
      <div className="bg-white w-full sm:w-[600px] h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {subscription ? 'Edit Subscription' : 'Assign Subscription'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Organization Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Organization Type
            </label>
            <select
              value={formData.orgType}
              onChange={(e) => {
                setFormData({ ...formData, orgType: e.target.value, orgId: '', orgName: '' });
                setSelectedOrg(null);
                setSearchQuery('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="SUPPLIER">Supplier</option>
              <option value="RESTAURANT">Restaurant</option>
            </select>
          </div>

          {/* Organization Search and Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select {formData.orgType}
            </label>
            
            {/* Search Input */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder={`Search ${formData.orgType.toLowerCase()}s...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Organization List */}
            <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
              {filteredOrgs.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No {formData.orgType.toLowerCase()}s found
                </div>
              ) : (
                filteredOrgs.map((org: any) => (
                  <div
                    key={org.id}
                    onClick={() => handleOrgSelect(org)}
                    className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                      selectedOrg?.id === org.id ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{org.orgName}</div>
                        <div className="text-sm text-gray-500">ID: {org.id}</div>
                        {org.description && (
                          <div className="text-sm text-gray-600 mt-1">{org.description}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          org.kycStatus === 'APPROVED' ? 'bg-green-100 text-green-800' :
                          org.kycStatus === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {org.kycStatus}
                        </div>
                        <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-1 ${
                          org.billingPlan === 'PREMIUM' ? 'bg-purple-100 text-purple-800' :
                          org.billingPlan === 'PRO' ? 'bg-blue-100 text-blue-800' :
                          org.billingPlan === 'BASIC' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {org.billingPlan}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Selected Organization Display */}
            {selectedOrg && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-blue-900">{selectedOrg.orgName}</div>
                    <div className="text-sm text-blue-700">ID: {selectedOrg.id}</div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedOrg(null);
                      setFormData({ ...formData, orgId: '', orgName: '' });
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Plan Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Plan
            </label>
            <select
              value={formData.planCode}
              onChange={(e) => setFormData({ ...formData, planCode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="FREE">Free - Basic features, limited products</option>
              <option value="BASIC">Basic - 500 products, core features</option>
              <option value="PRO">Pro - 5K products, promotions, inventory</option>
              <option value="PREMIUM">Premium - 50K products, all features</option>
            </select>
          </div>

          {/* Trial Days */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trial Days (optional)
            </label>
            <input
              type="number"
              value={formData.trialDays}
              onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) })}
              min="0"
              max="90"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Leave 0 for no trial</p>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !selectedOrg}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              {subscription ? 'Update' : 'Assign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

