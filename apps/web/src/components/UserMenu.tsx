'use client';

import { useAuthContext, UserRole } from '@/app/auth-provider';
import { Button } from '@/components/ui/button';
import { 
  User, 
  LogOut, 
  Settings, 
  ChevronDown,
  Building2,
  Store,
  Shield
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

export function UserMenu() {
  const { user, logout, switchRole } = useAuthContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!user) return null;

  const roleIcons = {
    admin: Shield,
    restaurant: Building2,
    supplier: Store,
  };

  const RoleIcon = roleIcons[user.role];

  // Only admins can switch roles
  const canSwitchRoles = user.role === 'admin';

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        className="flex items-center gap-3 px-3 py-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="text-right">
          <div className="text-sm font-medium text-gray-900">{user.name}</div>
          <div className="text-xs text-gray-500">{user.email}</div>
        </div>
        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
          <RoleIcon className="h-5 w-5" />
        </div>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-md border shadow-lg z-50">
          <div className="px-3 py-2 border-b">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-gray-500">{user.email}</div>
            <div className="text-xs text-blue-600 font-medium mt-1">
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)} • {user.orgName}
            </div>
          </div>

          {canSwitchRoles && (
            <div className="py-1 border-b">
              <div className="px-4 py-2 text-xs text-gray-500 font-medium uppercase">Switch Role</div>
              <button
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                onClick={() => { switchRole('admin'); setIsOpen(false); }}
              >
                <Shield className="h-4 w-4 text-purple-600" />
                Admin
              </button>

              <button
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                onClick={() => { switchRole('restaurant'); setIsOpen(false); }}
              >
                <Building2 className="h-4 w-4 text-blue-600" />
                Restaurant
              </button>

              <button
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                onClick={() => { switchRole('supplier'); setIsOpen(false); }}
              >
                <Store className="h-4 w-4 text-green-600" />
                Supplier
              </button>
            </div>
          )}

          <div className="py-1">
            <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </button>

            <button
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              onClick={() => { logout(); setIsOpen(false); }}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
