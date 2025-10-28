import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AdminDashboardPage() {
  const [selectedTab, setSelectedTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'plans', label: 'Plans' },
    { id: 'subscriptions', label: 'Subscriptions' },
    { id: 'tenants', label: 'Tenants' },
    { id: 'feature-flags', label: 'Feature Flags' },
    { id: 'usage', label: 'Usage & Quotas' },
    { id: 'audit', label: 'Audit Logs' },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage subscriptions, plans, feature flags, and tenant quotas</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Quick Stats</h3>
          <p className="text-gray-600 mb-4">Platform-wide metrics and performance indicators</p>
          <p className="text-sm text-gray-500">Coming soon...</p>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Plans Management</h3>
          <p className="text-gray-600 mb-4">Manage subscription plans (Free, Bronze, Gold, Platinum)</p>
          <p className="text-sm text-gray-500">Coming soon...</p>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Feature Flags</h3>
          <p className="text-gray-600 mb-4">Toggle features globally or per-tenant</p>
          <p className="text-sm text-gray-500">Coming soon...</p>
        </Card>
      </div>

      <div className="mt-6">
        <Card className="p-6 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-2">Admin Dashboard Status</h3>
          <p className="text-blue-800 mb-4">
            The backend API is ready at <code className="bg-blue-100 px-2 py-1 rounded">/api/admin-dashboard</code>
          </p>
          <p className="text-blue-700 text-sm">
            ✅ Database tables created<br />
            ✅ 15 API endpoints implemented<br />
            ✅ 4 plans pre-seeded (Free, Bronze, Gold, Platinum)<br />
            ✅ 7 feature flags configured<br />
            ⏳ Frontend UI pages (in progress)
          </p>
          <Button className="mt-4" disabled>
            View Full Dashboard (Coming Soon)
          </Button>
        </Card>
      </div>
    </div>
  );
}

