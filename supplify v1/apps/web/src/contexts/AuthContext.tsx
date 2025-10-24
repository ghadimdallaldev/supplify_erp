'use client';

import Keycloak from 'keycloak-js';
import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';

interface User {
  sub: string;
  email: string;
  preferred_username: string;
  given_name?: string;
  family_name?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [key: string]: {
      roles: string[];
    };
  };
  client_id?: string;
  org_type?: string;
  tier?: string;
}

interface AuthContextType {
  keycloak: Keycloak | null;
  authenticated: boolean;
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return; // SSR-safe

    const kc = new Keycloak({
      url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',
      realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'Supplify',
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'supplify-web',
    });

    // Expose Keycloak instance globally for Apollo Client
    (window as any).keycloak = kc;

    kc.init({ 
      onLoad: 'check-sso',
      checkLoginIframe: false,
      pkceMethod: 'S256',
      redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback/keycloak` : 'http://localhost:3000/auth/callback/keycloak',
      silentCheckSsoRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/silent-check-sso.html` : 'http://localhost:3000/silent-check-sso.html'
    })
      .then(auth => {
        setKeycloak(kc);
        setAuthenticated(auth);
        if (auth && kc.tokenParsed) {
          setUser(kc.tokenParsed as User);
        }
      })
      .catch(error => {
        console.error('Keycloak initialization failed:', error);
        setAuthenticated(false);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = () => {
    if (keycloak) {
      keycloak.login();
    }
  };

  const logout = () => {
    if (keycloak) {
      keycloak.logout();
    }
  };

  return (
    <AuthContext.Provider value={{ keycloak, authenticated, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
