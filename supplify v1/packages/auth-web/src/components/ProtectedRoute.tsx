import { useAuth } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import { useEffect, ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: string[];
  requiredOrgType?: 'RESTAURANT' | 'SUPPLIER' | 'ADMIN';
  requireClientId?: boolean;
  fallback?: ReactNode;
}

export function ProtectedRoute({
  children,
  requiredRoles,
  requiredOrgType,
  requireClientId,
  fallback = <div>Access denied</div>
}: ProtectedRouteProps) {
  const { user, loading, authenticated, clientId, orgType } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !authenticated) {
      router.push('/auth/signin');
      return;
    }

    if (authenticated && user) {
      // Check required roles
      if (requiredRoles && requiredRoles.length > 0) {
        const hasRequiredRole = requiredRoles.some(role => user.roles?.includes(role));
        if (!hasRequiredRole) {
          router.push('/unauthorized');
          return;
        }
      }

      // Check required org type
      if (requiredOrgType && orgType !== requiredOrgType) {
        router.push('/unauthorized');
        return;
      }

      // Check if client ID is required
      if (requireClientId && !clientId) {
        router.push('/pending-approval');
        return;
      }
    }
  }, [loading, authenticated, user, clientId, orgType, router, requiredRoles, requiredOrgType, requireClientId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!authenticated) {
    return null;
  }

  if (requiredRoles && requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.some(role => user?.roles?.includes(role));
    if (!hasRequiredRole) {
      return <>{fallback}</>;
    }
  }

  if (requiredOrgType && orgType !== requiredOrgType) {
    return <>{fallback}</>;
  }

  if (requireClientId && !clientId) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
