'use client';

import { useAuthContext } from '../app/auth-provider';
import { useState } from 'react';

export function TestModeRoleSwitcher() {
  const { user, switchRole } = useAuthContext();
  const [showSwitcher, setShowSwitcher] = useState(false);

  if (!user) return null;

  const handleRoleSwitch = (newRole: 'admin' | 'restaurant' | 'supplier') => {
    // Get role data for the new role
    const getRoleData = (role: string) => {
      switch (role) {
        case 'admin':
          return {
            id: 'admin-test',
            email: 'admin@supplify.com',
            name: 'Test Admin',
            orgId: 'platform',
            orgName: 'Supplify Platform',
          };
        case 'restaurant':
          return {
            id: 'restaurant-test',
            email: 'restaurant@supplify.com',
            name: 'Restaurant Manager',
            orgId: 'golden-fork',
            orgName: 'Golden Fork Restaurant',
          };
        case 'supplier':
          return {
            id: 'supplier-test',
            email: 'supplier@supplify.com',
            name: 'Supplier Manager',
            orgId: 'fresh-foods',
            orgName: 'Fresh Foods Supply',
          };
        default:
          return {
            id: 'test',
            email: 'test@supplify.com',
            name: 'Test User',
            orgId: 'test',
            orgName: 'Test Organization',
          };
      }
    };

    const roleData = getRoleData(newRole);
    const newUser = {
      ...roleData,
      role: newRole,
    };
    
    // Update localStorage and trigger login
    localStorage.setItem('supplify-user', JSON.stringify(newUser));
    
    // Reload the page to apply the new role
    window.location.reload();
  };

  return (
    <div className="fixed top-4 right-4 z-50">
      <button
        onClick={() => setShowSwitcher(!showSwitcher)}
        className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
      >
        🧪 Test Mode
      </button>
      
      {showSwitcher && (
        <div className="absolute top-12 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-48">
          <h3 className="font-semibold text-gray-900 mb-3">Switch Role for Testing</h3>
          <div className="space-y-2">
            <button
              onClick={() => handleRoleSwitch('admin')}
              className="w-full text-left px-3 py-2 bg-purple-50 hover:bg-purple-100 rounded text-sm transition-colors"
            >
              🛡️ Admin
            </button>
            <button
              onClick={() => handleRoleSwitch('restaurant')}
              className="w-full text-left px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded text-sm transition-colors"
            >
              🏢 Restaurant
            </button>
            <button
              onClick={() => handleRoleSwitch('supplier')}
              className="w-full text-left px-3 py-2 bg-green-50 hover:bg-green-100 rounded text-sm transition-colors"
            >
              🏪 Supplier
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Current: {user.role}
          </p>
        </div>
      )}
    </div>
  );
}
