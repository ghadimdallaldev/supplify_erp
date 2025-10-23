'use client';

import { createContext, useContext, ReactNode, useState, useEffect } from 'react';

export type UserRole = 'admin' | 'restaurant' | 'supplier';

export interface User {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  orgId: string;
  orgName: string;
  phone?: string;
  businessType?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  createdAt?: string;
  status?: 'pending_approval' | 'approved' | 'suspended' | 'rejected';
  lastLogin?: string;
  tier?: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => void;
  switchRole: (role: 'admin' | 'restaurant' | 'supplier') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage for user session (only on client side)
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('supplify-user');
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (error) {
          console.error('Error parsing saved user:', error);
          localStorage.removeItem('supplify-user');
        }
      }
    }
    setLoading(false);
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    if (typeof window !== 'undefined') {
      localStorage.setItem('supplify-user', JSON.stringify(userData));
    }
  };

  const logout = () => {
    setUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('supplify-user');
      // Redirect to login page
      window.location.href = '/login';
    }
  };

  const switchRole = (newRole: UserRole) => {
    if (!user) return;
    
    // Only admins can switch roles
    if (user.role !== 'admin') {
      console.warn('Only admin users can switch roles');
      return;
    }
    
    const roleData = getRoleData(newRole);
    const updatedUser = {
      ...user,
      role: newRole,
      orgId: roleData.orgId,
      orgName: roleData.orgName,
      name: roleData.name,
      email: roleData.email,
    };
    
    login(updatedUser);
    
    // Redirect to appropriate dashboard
    if (typeof window !== 'undefined') {
      switch (newRole) {
        case 'admin':
          window.location.href = '/admin/dashboard';
          break;
        case 'restaurant':
          window.location.href = '/restaurant/dashboard';
          break;
        case 'supplier':
          window.location.href = '/supplier/dashboard';
          break;
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

function getRoleData(role: UserRole) {
  const roleData = {
    admin: {
      id: 'admin-1',
      email: 'admin@supplify.com',
      name: 'Admin User',
      orgId: 'platform',
      orgName: 'Supplify Platform',
    },
    restaurant: {
      id: 'restaurant-1',
      email: 'manager@restaurant.com',
      name: 'Restaurant Manager',
      orgId: 'restaurant-1',
      orgName: 'Golden Fork Restaurant',
    },
    supplier: {
      id: 'supplier-1',
      email: 'sales@freshfoods.com',
      name: 'Sales Manager',
      orgId: 'supplier-1',
      orgName: 'Fresh Foods Supply',
    },
  };

  return roleData[role];
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
