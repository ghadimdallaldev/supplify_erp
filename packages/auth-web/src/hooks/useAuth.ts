import { useSession } from 'next-auth/react';

export interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
  clientId?: string;
  orgType?: string;
  tier?: string;
  roles?: string[];
}

export interface Session {
  user: User;
  accessToken?: string;
  refreshToken?: string;
  expires: string;
}

export function useAuth() {
  const { data: session, status } = useSession();

  return {
    user: session?.user,
    session,
    loading: status === 'loading',
    authenticated: status === 'authenticated',
    isAdmin: session?.user?.roles?.includes('admin') || session?.user?.roles?.includes('superadmin'),
    isRestaurant: session?.user?.roles?.includes('restaurant'),
    isSupplier: session?.user?.roles?.includes('supplier'),
    clientId: session?.user?.clientId,
    orgType: session?.user?.orgType,
  };
}

export function useRole(): string[] {
  const { session } = useAuth();
  return session?.user?.roles || [];
}

export function useTenant(): string {
  const { clientId } = useAuth();
  return clientId || '';
}

export function useUserType(): 'RESTAURANT' | 'SUPPLIER' | 'ADMIN' | 'GUEST' {
  const { orgType, isAdmin } = useAuth();
  
  if (isAdmin) return 'ADMIN';
  if (orgType === 'RESTAURANT') return 'RESTAURANT';
  if (orgType === 'SUPPLIER') return 'SUPPLIER';
  return 'GUEST';
}

export function useFeatureFlag(flagKey: string): boolean {
  // TODO: Integrate with feature flags service
  // For now, return true for all flags
  return true;
}
