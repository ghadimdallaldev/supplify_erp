'use client';

import { useAuth } from '@/hooks/use-auth';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { loading, authenticated, keycloak, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated || !keycloak) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Authentication Required
          </h1>
          <p className="text-gray-600 mb-4">
            Please log in to access Supplify.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => window.location.reload()}
              className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 mr-2"
            >
              Retry Login
            </button>
            <button
              onClick={() => {
                if (keycloak) {
                  keycloak.login();
                } else {
                  window.location.reload();
                }
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Login with Keycloak
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 p-4 bg-gray-100 rounded-md text-left text-sm">
              <p><strong>Debug Info:</strong></p>
              <p>Authenticated: {authenticated ? 'Yes' : 'No'}</p>
              <p>Keycloak: {keycloak ? 'Available' : 'Not available'}</p>
              <p>User: {user ? 'Loaded' : 'Not loaded'}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
