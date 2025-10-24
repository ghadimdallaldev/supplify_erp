'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function KeycloakCallback() {
  const router = useRouter();
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        if (typeof window !== 'undefined') {
          // Check if we have OAuth parameters in the URL fragment
          const hash = window.location.hash;
          const search = window.location.search;
          
          console.log('Callback URL:', window.location.href);
          console.log('Hash:', hash);
          console.log('Search:', search);
          
          if (hash.includes('code=') || search.includes('code=')) {
            console.log('OAuth callback detected, redirecting to home...');
            
            // Clear the URL parameters and redirect to home
            // The AuthContext will handle the authentication
            window.history.replaceState({}, document.title, '/');
            
            // Small delay to ensure URL is cleaned up
            setTimeout(() => {
              router.push('/');
            }, 100);
          } else {
            console.log('No OAuth parameters, redirecting to login');
            router.push('/login');
          }
        }
      } catch (err) {
        console.error('Callback processing error:', err);
        setError('Authentication failed. Please try again.');
        setTimeout(() => router.push('/login'), 2000);
      } finally {
        setProcessing(false);
      }
    };

    handleCallback();
  }, [router]);

  if (processing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-lg mx-auto mb-4 animate-pulse"></div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Supplify</h1>
          <p className="text-gray-600">Processing authentication...</p>
          {error && (
            <p className="text-red-600 mt-2">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
