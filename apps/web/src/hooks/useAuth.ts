import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { apolloClient } from '../lib/apollo-client';
import { gql } from '@apollo/client';

interface User {
  id: string;
  email: string;
  role: string;
  organizationId: string;
}

interface Organization {
  id: string;
  type: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  clientId: string | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GET_ME_QUERY = gql`
  query GetMe {
    me
  }
`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      // Set the token in Apollo Client headers
      apolloClient.setLink(
        apolloClient.link.concat(
          new ApolloLink((operation, forward) => {
            operation.setContext({
              headers: {
                authorization: `Bearer ${token}`,
              },
            });
            return forward(operation);
          })
        )
      );
      
      // Fetch user data
      fetchUserData();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserData = async () => {
    try {
      const result = await apolloClient.query({
        query: GET_ME_QUERY,
      });
      
      const userData = JSON.parse(result.data.me);
      setUser(userData.user);
      setOrganization(userData.organization);
      setClientId(userData.clientId);
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (token: string) => {
    localStorage.setItem('auth_token', token);
    
    // Set the token in Apollo Client headers
    apolloClient.setLink(
      apolloClient.link.concat(
        new ApolloLink((operation, forward) => {
          operation.setContext({
            headers: {
              authorization: `Bearer ${token}`,
            },
          });
          return forward(operation);
        })
      )
    );
    
    await fetchUserData();
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
    setOrganization(null);
    setClientId(null);
    
    // Clear Apollo Client cache
    apolloClient.clearStore();
  };

  const value: AuthContextType = {
    user,
    organization,
    clientId,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Hook to get client ID specifically
export function useClientId(): string {
  const { clientId } = useAuth();
  if (!clientId) {
    throw new Error('Client ID not available. User may not be authenticated.');
  }
  return clientId;
}

// Hook to check if user has specific role
export function useRole(): string {
  const { user } = useAuth();
  return user?.role || 'GUEST';
}

// Hook to check if user is restaurant or supplier
export function useUserType(): 'RESTAURANT' | 'SUPPLIER' | 'GUEST' {
  const { user } = useAuth();
  return user?.role === 'RESTAURANT' ? 'RESTAURANT' : 
         user?.role === 'SUPPLIER' ? 'SUPPLIER' : 'GUEST';
}