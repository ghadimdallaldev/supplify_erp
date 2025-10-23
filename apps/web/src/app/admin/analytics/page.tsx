'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Users, ShoppingCart, DollarSign, Package, Star, Flag } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/**
 * Admin Analytics Dashboard
 * Platform-wide metrics and insights
 */
export default function AdminAnalyticsPage() {
  // Mock data - would be real GraphQL queries
  const stats = {
    totalOrgs: 156,
    activeSubscriptions: 142,
    totalRevenue: 45678,
    growthRate: 12.5,
    
    byPlan: {
      BASIC: 89,
      PRO: 45,
      PREMIUM: 8,
    },
    
    byCampaigns: {
      active: 23,
      totalSpend: 12500,
      totalImpressions: 245000,
      avgCTR: 2.8,
    },
    
    byInventory: {
      locationsTracked: 89,
      itemsManaged: 12450,
      countsCompleted: 156,
      wasteReduction: 18.5,
    },
    
    byProducts: {
      totalProducts: 45600,
      pinnedProducts: 3400,
      bulkImports: 234,
      avgTimeToOnboard: 2.3,
    },
  };

  const revenueData = [
    { month: 'Jan', revenue: 32000, subscriptions: 120 },
    { month: 'Feb', revenue: 35400, subscriptions: 128 },
    { month: 'Mar', revenue: 39200, subscriptions: 135 },
    { month: 'Apr', revenue: 42800, subscriptions: 142 },
    { month: 'May', revenue: 45678, subscriptions: 156 },
  ];

  const planData = [
    { name: 'Basic', value: stats.byPlan.BASIC, color: '#9CA3AF' },
    { name: 'Pro', value: stats.byPlan.PRO, color: '#3B82F6' },
    { name: 'Premium', value: stats.byPlan.PREMIUM, color: '#8B5CF6' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Platform Analytics</h1>
          <p className="text-gray-600 mt-2">Performance metrics and insights</p>
        </div>

        {/* Top Level Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <StatCard
            label="Total Organizations"
            value={stats.totalOrgs}
            change="+12.5%"
            icon={<Users className="h-6 w-6" />}
            color="blue"
          />
          <StatCard
            label="Active Subscriptions"
            value={stats.activeSubscriptions}
            change="+8.2%"
            icon={<TrendingUp className="h-6 w-6" />}
            color="green"
          />
          <StatCard
            label="Monthly Revenue"
            value={`$${stats.totalRevenue.toLocaleString()}`}
            change="+15.3%"
            icon={<DollarSign className="h-6 w-6" />}
            color="purple"
          />
          <StatCard
            label="Growth Rate"
            value={`${stats.growthRate}%`}
            change="+2.1%"
            icon={<TrendingUp className="h-6 w-6" />}
            color="green"
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Revenue Trend */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} name="Revenue ($)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Plan Distribution */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscription Distribution</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={planData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {planData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Feature Usage */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <FeatureCard
            icon={<Package className="h-8 w-8" />}
            label="Inventory Module"
            value={`${stats.byInventory.locationsTracked} locations`}
            subValue={`${stats.byInventory.itemsManaged.toLocaleString()} items tracked`}
            color="blue"
          />
          <FeatureCard
            icon={<Star className="h-8 w-8" />}
            label="Pinned Products"
            value={`${stats.byProducts.pinnedProducts.toLocaleString()} pins`}
            subValue="Avg 22 pins per supplier"
            color="yellow"
          />
          <FeatureCard
            icon={<TrendingUp className="h-8 w-8" />}
            label="Sponsored Campaigns"
            value={`${stats.byCampaigns.active} active`}
            subValue={`$${stats.byCampaigns.totalSpend.toLocaleString()} spent`}
            color="green"
          />
          <FeatureCard
            icon={<Flag className="h-8 w-8" />}
            label="Feature Flags"
            value="13 flags"
            subValue="8 active in prod"
            color="purple"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, change, icon, color }: any) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-600">{label}</div>
        <div className={`rounded-full p-2 ${colors[color as keyof typeof colors]}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {change && (
        <div className="text-sm text-green-600 font-medium mt-1">{change} vs last month</div>
      )}
    </div>
  );
}

function FeatureCard({ icon, label, value, subValue, color }: any) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-600',
    green: 'bg-green-50 border-green-200 text-green-600',
    purple: 'bg-purple-50 border-purple-200 text-purple-600',
  };

  return (
    <div className={`rounded-lg border p-6 ${colors[color as keyof typeof colors]}`}>
      <div className="mb-3">{icon}</div>
      <div className="text-sm font-medium text-gray-700">{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-1">{value}</div>
      <div className="text-xs text-gray-600 mt-1">{subValue}</div>
    </div>
  );
}

