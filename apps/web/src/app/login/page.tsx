'use client';

import { useAuthContext } from '../auth-provider';
import { useRouter } from 'next/navigation';
import { Building2, Store, Shield } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

// Demo users database
const USERS = {
  'admin@supplify.com': {
    password: 'admin123',
    id: 'admin-1',
    email: 'admin@supplify.com',
    name: 'Admin User',
    role: 'admin' as const,
    orgId: 'platform',
    orgName: 'Supplify Platform',
  },
  'restaurant@supplify.com': {
    password: 'restaurant123',
    id: 'restaurant-1',
    email: 'restaurant@supplify.com',
    name: 'Restaurant Manager',
    role: 'restaurant' as const,
    orgId: 'restaurant-1',
    orgName: 'Golden Fork Restaurant',
  },
  'supplier@supplify.com': {
    password: 'supplier123',
    id: 'supplier-1',
    email: 'supplier@supplify.com',
    name: 'Sales Manager',
    role: 'supplier' as const,
    orgId: 'supplier-1',
    orgName: 'Fresh Foods Supply',
  },
};

export default function LoginPage() {
  const { login } = useAuthContext();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check demo users first
    const demoUser = USERS[email as keyof typeof USERS];
    
    if (demoUser && demoUser.password === password) {
      // Demo user login
      const { password: _, ...userWithoutPassword } = demoUser;
      login(userWithoutPassword);

      // Redirect to appropriate dashboard
      switch (demoUser.role) {
        case 'admin':
          router.push('/admin/dashboard');
          break;
        case 'restaurant':
          router.push('/restaurant/dashboard');
          break;
        case 'supplier':
          router.push('/supplier/dashboard');
          break;
      }
      return;
    }

    // Check individual users from localStorage
    let foundUser = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('supplify-user-')) {
        try {
          const userData = JSON.parse(localStorage.getItem(key) || '{}');
          if (userData.email === email && userData.password === password) {
            foundUser = userData;
            break;
          }
        } catch (error) {
          console.error('Error parsing user data:', error);
        }
      }
    }

    if (!foundUser) {
      setError('Invalid email or password');
      setLoading(false);
      return;
    }

    // Check if user is approved
    if (foundUser.status === 'pending_approval') {
      setError('🔒 Your account is pending admin approval. An admin will review your application and you will receive an email once approved. Please check back later or contact support if you have questions.');
      setLoading(false);
      return;
    }

    if (foundUser.status === 'rejected') {
      setError('❌ Your account has been rejected. Please contact support at support@supplify.com for more information about this decision.');
      setLoading(false);
      return;
    }

    if (foundUser.status === 'suspended') {
      setError('⚠️ Your account has been suspended. Please contact support at support@supplify.com to resolve this issue.');
      setLoading(false);
      return;
    }

    // Login successful - update last login but keep password in storage
    foundUser.lastLogin = new Date().toISOString();
    
    // Update last login in localStorage (keep password for future logins)
    localStorage.setItem(`supplify-user-${foundUser.id}`, JSON.stringify(foundUser));
    
    // Remove password from user object for session
    const { password: _, ...userWithoutPassword } = foundUser;
    login(userWithoutPassword);

    // Redirect to appropriate dashboard
    switch (foundUser.role) {
      case 'admin':
        router.push('/admin/dashboard');
        break;
      case 'restaurant':
        router.push('/restaurant/dashboard');
        break;
      case 'supplier':
        router.push('/supplier/dashboard');
        break;
    }
  };

  const handleQuickLogin = (role: 'admin' | 'restaurant' | 'supplier') => {
    const emails = {
      admin: 'admin@supplify.com',
      restaurant: 'restaurant@supplify.com',
      supplier: 'supplier@supplify.com',
    };
    setEmail(emails[role]);
    setPassword(`${role}123`);
    
    // Auto-submit after filling credentials
    setTimeout(() => {
      const user = USERS[emails[role] as keyof typeof USERS];
      if (user) {
        const { password: _, ...userWithoutPassword } = user;
        login(userWithoutPassword);
        
        // Redirect to appropriate dashboard
        switch (user.role) {
          case 'admin':
            router.push('/admin/dashboard');
            break;
          case 'restaurant':
            router.push('/restaurant/dashboard');
            break;
          case 'supplier':
            router.push('/supplier/dashboard');
            break;
        }
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-14 h-14 bg-blue-600 rounded-xl shadow-lg"></div>
            <h1 className="text-4xl font-bold text-gray-900">Supplify</h1>
          </div>
          <p className="text-gray-600 text-lg font-medium">B2B Food Supply Platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Sign In</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Enter your email"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Demo Accounts</span>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin')}
                className="w-full flex items-center justify-between px-4 py-3 border-2 border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                    <Shield className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">Admin</div>
                    <div className="text-xs text-gray-500">admin@supplify.com</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">Click to login</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('restaurant')}
                className="w-full flex items-center justify-between px-4 py-3 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">Restaurant</div>
                    <div className="text-xs text-gray-500">restaurant@supplify.com</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">Click to login</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('supplier')}
                className="w-full flex items-center justify-between px-4 py-3 border-2 border-green-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                    <Store className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">Supplier</div>
                    <div className="text-xs text-gray-500">supplier@supplify.com</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">Click to login</div>
              </button>
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-sm text-gray-600">
            Click any demo account button to instantly login
          </p>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link href="/signup" className="text-blue-600 hover:underline font-semibold">
                Create one here
              </Link>
            </p>
            <p className="text-xs text-gray-500 mt-2">
              New accounts require admin approval before you can login
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
