'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export type UserRole = 'admin' | 'restaurant' | 'supplier';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  orgId: string;
  orgName: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage for user session
    const savedUser = localStorage.getItem('supplify-user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('supplify-user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('supplify-user');
  };

  const switchRole = (newRole: UserRole) => {
    if (!user) return;
    
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
  };

  return { user, loading, login, logout, switchRole };
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

export const DEMO_USERS = {
  admin: getRoleData('admin'),
  restaurant: getRoleData('restaurant'),
  supplier: getRoleData('supplier'),
};
