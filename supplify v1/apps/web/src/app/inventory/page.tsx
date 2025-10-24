'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Package, 
  AlertTriangle, 
  Calendar, 
  TrendingUp, 
  TrendingDown,
  ArrowRight,
  Clock,
  DollarSign
} from 'lucide-react';

export default function InventoryDashboard() {
  const [stats, setStats] = useState({
    totalStockValue: 0,
    itemsBelowPar: 0,
    nearExpiry: 0,
    openCounts: 0,
    wastageThisMonth: 0,
    stockTurnover: 0,
  });

  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // TODO: Replace with actual GraphQL queries
      // Mock data for now
      setStats({
        totalStockValue: 45678.50,
        itemsBelowPar: 12,
        nearExpiry: 8,
        openCounts: 2,
        wastageThisMonth: 1234.25,
        stockTurnover: 8.5,
      });

      setAlerts([
        {
          id: '1',
          type: 'LOW_STOCK',
          severity: 'CRITICAL',
          message: 'Fresh Chicken Breast - Below minimum par',
          itemName: 'Fresh Chicken Breast',
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          type: 'NEAR_EXPIRY',
          severity: 'WARNING',
          message: 'Fresh Whole Milk - Expires in 3 days',
          itemName: 'Fresh Whole Milk',
          createdAt: new Date().toISOString(),
        },
      ]);

      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Inventory Dashboard</h1>
          <p className="text-gray-600 mt-2">Real-time stock management and analytics</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Stock Value */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Stock Value</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  ${stats.totalStockValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-blue-100 rounded-full p-3">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-green-600 font-medium">2.5%</span>
              <span className="text-gray-600 ml-1">vs last month</span>
            </div>
          </div>

          {/* Items Below Par */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Items Below Par</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.itemsBelowPar}</p>
              </div>
              <div className="bg-orange-100 rounded-full p-3">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
            </div>
            <div className="mt-4">
              <Link 
                href="/inventory/replenishment"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center"
              >
                View replenishment list
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </div>
          </div>

          {/* Near Expiry */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Near Expiry</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.nearExpiry}</p>
              </div>
              <div className="bg-red-100 rounded-full p-3">
                <Clock className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600">Next 7 days</p>
            </div>
          </div>

          {/* Open Counts */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Open Counts</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.openCounts}</p>
              </div>
              <div className="bg-purple-100 rounded-full p-3">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <div className="mt-4">
              <Link 
                href="/inventory/counts"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center"
              >
                View counts
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Alerts */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Active Alerts</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {alerts.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                    <p>No active alerts</p>
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div key={alert.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start">
                        <div className={`rounded-full p-2 mr-3 ${
                          alert.severity === 'CRITICAL' 
                            ? 'bg-red-100' 
                            : 'bg-yellow-100'
                        }`}>
                          <AlertTriangle className={`h-5 w-5 ${
                            alert.severity === 'CRITICAL'
                              ? 'text-red-600'
                              : 'text-yellow-600'
                          }`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(alert.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                          Acknowledge
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-2 gap-6 mt-6">
              <div className="bg-white rounded-lg shadow p-6">
                <p className="text-sm font-medium text-gray-600">Wastage This Month</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  ${stats.wastageThisMonth.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <div className="mt-2 flex items-center text-sm">
                  <TrendingDown className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-green-600 font-medium">12%</span>
                  <span className="text-gray-600 ml-1">vs last month</span>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <p className="text-sm font-medium text-gray-600">Stock Turnover</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {stats.stockTurnover}x
                </p>
                <p className="text-sm text-gray-600 mt-2">Average per month</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
              </div>
              <div className="p-6 space-y-3">
                <Link
                  href="/inventory/items"
                  className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg text-center transition-colors"
                >
                  <Package className="inline-block h-5 w-5 mr-2" />
                  View All Items
                </Link>
                
                <Link
                  href="/inventory/counts?action=new"
                  className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-3 px-4 rounded-lg text-center transition-colors"
                >
                  <Calendar className="inline-block h-5 w-5 mr-2" />
                  Start New Count
                </Link>

                <Link
                  href="/inventory/replenishment"
                  className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-3 px-4 rounded-lg text-center transition-colors"
                >
                  <TrendingUp className="inline-block h-5 w-5 mr-2" />
                  Build Replenishment
                </Link>

                <Link
                  href="/inventory/recipes"
                  className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-3 px-4 rounded-lg text-center transition-colors"
                >
                  <Package className="inline-block h-5 w-5 mr-2" />
                  Manage Recipes
                </Link>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow mt-6">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
              </div>
              <div className="p-6 space-y-3 text-sm">
                <div className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                  <span>Received: Flour (50 kg)</span>
                  <span className="ml-auto text-gray-500">2h ago</span>
                </div>
                <div className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  <span>Count completed: Kitchen</span>
                  <span className="ml-auto text-gray-500">5h ago</span>
                </div>
                <div className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                  <span>Waste: Tomatoes (2 kg)</span>
                  <span className="ml-auto text-gray-500">1d ago</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

