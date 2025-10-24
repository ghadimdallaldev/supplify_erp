import { useState, useEffect, useRef } from 'react';
import { initKeycloak, getKeycloakInstance } from '@/lib/keycloak';
import { apiClient } from '@/lib/api';
import Keycloak from 'keycloak-js';

export interface AuthContext {
  loading: boolean;
  authenticated: boolean;
  keycloak: Keycloak | null;
  user: any | null;
  token: string | null;
  login: () => void;
  logout: () => void;
}

export const useAuth = (): AuthContext => {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const keycloakRef = useRef<Keycloak | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const keycloak = await initKeycloak();
        keycloakRef.current = keycloak;
        
        setAuthenticated(true);
        setToken(keycloak.token || null);
        
        // Set token for API client
        if (keycloak.token) {
          apiClient.setToken(keycloak.token);
        }

        // Get user info from our API
        try {
          const response = await apiClient.get('/auth/me');
          if (response.success && response.data) {
            setUser(response.data);
          }
        } catch (error) {
          console.error('Failed to get user info:', error);
          // Don't fail authentication if API call fails
          // Set basic user info from Keycloak token
          if (keycloak.tokenParsed) {
            setUser({
              user: {
                keycloakId: keycloak.tokenParsed.sub,
                email: keycloak.tokenParsed.email,
                name: keycloak.tokenParsed.preferred_username || keycloak.tokenParsed.name,
                roles: keycloak.tokenParsed.realm_access?.roles || []
              },
              organization: {
                clientId: keycloak.tokenParsed.client_id,
                type: keycloak.tokenParsed.org_type || 'restaurant',
                tier: keycloak.tokenParsed.tier || 'basic'
              }
            });
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('Authentication initialization failed:', error);
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = () => {
    if (keycloakRef.current) {
      keycloakRef.current.login();
    }
  };

  const logout = () => {
    if (keycloakRef.current) {
      keycloakRef.current.logout();
    }
  };

  return {
    loading,
    authenticated,
    keycloak: keycloakRef.current,
    user,
    token,
    login,
    logout,
  };
};
