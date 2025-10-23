'use client';

import { useAuthContext } from './auth-provider';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { user, loading } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        // Redirect to appropriate dashboard based on role
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
      } else {
        // Redirect to login if no user
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-lg mx-auto mb-4"></div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Supplify</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

