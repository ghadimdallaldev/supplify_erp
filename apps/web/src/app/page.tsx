'use client';

import { useAuthContext } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const { authenticated, user, loading, login } = useAuthContext();
  const router = useRouter();
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    if (!loading && !redirected) {
      if (!authenticated) {
        // Only redirect to login if we're not already there
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          setRedirected(true);
          router.push('/login');
        }
        return;
      }

      // Redirect to appropriate dashboard based on user role
      if (user && !redirected) {
        setRedirected(true);
        const roles = user.realm_access?.roles || [];
        
        if (roles.includes('admin')) {
          router.push('/admin/dashboard');
        } else if (roles.includes('restaurant')) {
          router.push('/restaurant/dashboard');
        } else if (roles.includes('supplier')) {
          router.push('/supplier/dashboard');
        } else {
          // Default to restaurant dashboard if no specific role
          router.push('/restaurant/dashboard');
        }
      }
    }
  }, [authenticated, user, loading, router, redirected]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-lg mx-auto mb-4 animate-pulse"></div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Supplify</h1>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-lg mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Supplify</h1>
          <p className="text-gray-600 mb-4">Redirecting to login...</p>
          <button
            onClick={login}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Login Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-lg mx-auto mb-4"></div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Supplify</h1>
        <p className="text-gray-600">Redirecting to dashboard...</p>
      </div>
    </div>
  );
}

