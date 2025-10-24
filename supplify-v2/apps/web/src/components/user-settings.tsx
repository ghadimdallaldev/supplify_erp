'use client';

import { useAuth } from '@/hooks/use-auth';
import { useQuery } from 'react-query';
import { apiClient } from '@/lib/api';
import { User, Mail, Shield, Building, Settings as SettingsIcon, LogOut } from 'lucide-react';

export function UserSettings() {
  const { user, logout } = useAuth();

  const { data: flags } = useQuery('flags', () => apiClient.get('/flags'));

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const userRoles = user.user?.roles || [];
  const organization = user.organization;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <SettingsIcon className="h-8 w-8 text-primary-600 mr-3" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
                <p className="text-gray-600">Manage your account and preferences</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* User Information Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  User Information
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center">
                    <User className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Username</p>
                      <p className="text-sm text-gray-900">{user.user?.name || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Mail className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Email</p>
                      <p className="text-sm text-gray-900">{user.user?.email || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Shield className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">User ID</p>
                      <p className="text-sm text-gray-900 font-mono">{user.user?.keycloakId || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Organization Information Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Organization Information
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center">
                    <Building className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Organization</p>
                      <p className="text-sm text-gray-900">{organization?.name || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Shield className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Organization Type</p>
                      <p className="text-sm text-gray-900 capitalize">{organization?.type || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <SettingsIcon className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Subscription Tier</p>
                      <p className="text-sm text-gray-900 capitalize">{organization?.tier || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* User Roles Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg lg:col-span-2">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  User Roles & Permissions
                </h3>
                <div className="space-y-3">
                  {userRoles.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {userRoles.map((role, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800"
                        >
                          <Shield className="h-3 w-3 mr-1" />
                          {role}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No roles assigned</p>
                  )}
                </div>
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Role-based Features:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                    {userRoles.includes('admin') && (
                      <div className="flex items-center text-green-600">
                        <div className="w-2 h-2 bg-green-600 rounded-full mr-2"></div>
                        Admin Panel Access
                      </div>
                    )}
                    {userRoles.includes('manager') && (
                      <div className="flex items-center text-green-600">
                        <div className="w-2 h-2 bg-green-600 rounded-full mr-2"></div>
                        Order Management
                      </div>
                    )}
                    {userRoles.includes('user') && (
                      <div className="flex items-center text-green-600">
                        <div className="w-2 h-2 bg-green-600 rounded-full mr-2"></div>
                        Basic Access
                      </div>
                    )}
                    {!userRoles.includes('admin') && !userRoles.includes('manager') && !userRoles.includes('user') && (
                      <div className="flex items-center text-gray-500">
                        <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
                        Limited Access
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Feature Flags Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg lg:col-span-2">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Active Feature Flags
                </h3>
                <div className="space-y-2">
                  {flags?.data && Object.keys(flags.data).length > 0 ? (
                    Object.entries(flags.data).map(([key, enabled]) => (
                      <div key={key} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                        <span className="text-sm font-medium text-gray-900">{key}</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          enabled 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No feature flags configured</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
