'use client';

import { useAuthContext } from '../../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { authenticated, loading, login } = useAuthContext();
  const router = useRouter();
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    if (!loading && authenticated && !redirected) {
      // If already authenticated, redirect to dashboard
      setRedirected(true);
      router.push('/');
    }
  }, [authenticated, loading, router, redirected]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-lg mx-auto mb-4 animate-pulse"></div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Supplify</h1>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-lg mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Supplify</h1>
          <p className="text-gray-600">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

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
          
          <div className="space-y-4">
            <p className="text-gray-600 text-center mb-6">
              Sign in with your Supplify account to access the platform.
            </p>

            <button
              onClick={login}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Sign In with Supplify
            </button>
          </div>

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
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="text-purple-600 font-bold">A</span>
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">Admin</div>
                    <div className="text-xs text-gray-500">Full platform access</div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-blue-600 font-bold">R</span>
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">Restaurant</div>
                    <div className="text-xs text-gray-500">Order management & inventory</div>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-green-600 font-bold">S</span>
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">Supplier</div>
                    <div className="text-xs text-gray-500">Product catalog & orders</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-sm text-gray-600">
            Contact your administrator to get access to Supplify
          </p>
        </div>
      </div>
    </div>
  );
}
