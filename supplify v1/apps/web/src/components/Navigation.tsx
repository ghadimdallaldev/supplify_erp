'use client';

import Link from 'next/link';
import { useAuthContext } from '../contexts/AuthContext';
import { useRouter } from 'next/navigation';

export function Navigation() {
  const { authenticated, user, logout } = useAuthContext();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!authenticated || !user) {
    return null;
  }

  const roles = user.realm_access?.roles || [];
  const isAdmin = roles.includes('admin');
  const isSupplier = roles.includes('supplier');
  const isRestaurant = roles.includes('restaurant');

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg"></div>
              <span className="text-xl font-bold text-gray-900">Supplify</span>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            {/* Role-based navigation */}
            {isAdmin && (
              <>
                <Link href="/admin/dashboard" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Admin Dashboard
                </Link>
                <Link href="/admin/users" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Users
                </Link>
                <Link href="/admin/feature-flags" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Feature Flags
                </Link>
              </>
            )}

            {isSupplier && (
              <>
                <Link href="/supplier/dashboard" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Supplier Dashboard
                </Link>
                <Link href="/supplier/products" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Products
                </Link>
                <Link href="/supplier/orders" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Orders
                </Link>
                <Link href="/supplier/chat" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Chat
                </Link>
              </>
            )}

            {isRestaurant && (
              <>
                <Link href="/restaurant/dashboard" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Restaurant Dashboard
                </Link>
                <Link href="/restaurant/orders" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Orders
                </Link>
                <Link href="/restaurant/inventory" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Inventory
                </Link>
                <Link href="/restaurant/suppliers" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Suppliers
                </Link>
                <Link href="/restaurant/chat" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                  Chat
                </Link>
              </>
            )}

            {/* User info and logout */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                {user.preferred_username || user.email}
              </span>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                {roles[0] || 'User'}
              </span>
              <button
                onClick={handleLogout}
                className="text-gray-700 hover:text-red-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
