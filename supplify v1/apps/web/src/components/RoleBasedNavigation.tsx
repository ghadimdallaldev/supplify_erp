'use client';

import { useAuthContext, UserRole } from '@/app/auth-provider';

export function RoleBasedNavigation() {
  const { user } = useAuthContext();

  if (!user) return null;

  const getNavigationItems = (role: 'admin' | 'restaurant' | 'supplier') => {
    switch (role) {
      case 'admin':
        return [
          { href: '/admin/dashboard', label: 'Dashboard' },
          { href: '/admin/users', label: 'User Management' },
          { href: '/admin/subscriptions', label: 'Subscriptions' },
          { href: '/admin/promotions', label: 'Promotions' },
          { href: '/admin/feature-flags', label: 'Feature Flags' },
          { href: '/admin/test-data', label: 'Test Data' },
          { href: '/admin/product-imports', label: 'Product Reviews' },
          { href: '/admin/analytics', label: 'Analytics' },
        ];
      
      case 'restaurant':
        return [
          { href: '/restaurant/dashboard', label: 'Dashboard' },
          { href: '/restaurant/inventory', label: 'Inventory' },
          { href: '/restaurant/orders', label: 'Orders' },
          { href: '/restaurant/suppliers', label: 'Suppliers' },
          { href: '/restaurant/chat', label: 'Chat' },
          { href: '/restaurant/invoices', label: 'Invoices' },
        ];
      
      case 'supplier':
        return [
          { href: '/supplier/dashboard', label: 'Dashboard' },
          { href: '/supplier/products', label: 'Products' },
          { href: '/supplier/orders', label: 'Orders' },
          { href: '/supplier/campaigns', label: 'Campaigns' },
          { href: '/supplier/chat', label: 'Chat' },
          { href: '/supplier/analytics', label: 'Analytics' },
        ];
      
      default:
        return [];
    }
  };

  const navigationItems = getNavigationItems(user.role);

  return (
    <div className="hidden md:flex items-center gap-6">
      {navigationItems.map((item) => (
        <NavLink key={item.href} href={item.href}>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
    >
      {children}
    </a>
  );
}
