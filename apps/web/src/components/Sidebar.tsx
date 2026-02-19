import { Link, useLocation } from 'react-router-dom'
import { cn } from '../lib/utils'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import { useGetImpersonationStatusQuery } from '../services/api'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Building2,
  Settings,
  MessageSquare,
  ShoppingBag,
  Truck,
  FileText,
  List,
  Package2,
  PackageCheck,
  Shield,
  CalendarDays,
  UserCircle2,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
  { name: 'Products', href: '/app/products', icon: Package },
  { name: 'Orders', href: '/app/orders', icon: ShoppingCart },
  { name: 'Chat', href: '/app/chat', icon: MessageSquare },
]

const restaurantNavigation: {
  name: string
  href: string
  icon: typeof List
  permission?: string
}[] = [
  { name: 'Quick Lists', href: '/app/quick-lists', icon: List },
  { name: 'Cart', href: '/app/cart', icon: ShoppingBag },
  { name: 'Suppliers', href: '/app/suppliers', icon: Building2 },
  {
    name: 'Reservations',
    href: '/app/reservations',
    icon: CalendarDays,
    permission: 'RESERVATIONS_VIEW',
  },
  { name: 'Staff', href: '/app/staff', icon: UserCircle2, permission: 'STAFF_VIEW' },
  {
    name: 'Inventory',
    href: '/app/restaurant-inventory',
    icon: Package2,
    permission: 'INVENTORY_VIEW',
  },
  { name: 'Receiving', href: '/app/receiving', icon: PackageCheck },
  { name: 'Invoices', href: '/app/invoices', icon: FileText, permission: 'INVOICES_VIEW' },
]

const adminNavigation = [
  { name: 'Admin Dashboard', href: '/app/admin', icon: Shield },
  { name: 'Supplier Admin', href: '/app/admin/suppliers', icon: Building2 },
  { name: 'Restaurant Admin', href: '/app/admin/restaurants', icon: Users },
]

export function Sidebar() {
  const location = useLocation()
  const { user } = useAppSelector((state) => state.auth)
  const { can } = usePermissions()
  const { data: impersonation } = useGetImpersonationStatusQuery(undefined, {
    skip: user?.role !== 'ADMIN',
  })

  const isPlatformAdmin =
    user?.role === 'ADMIN' &&
    Array.isArray(user?.adminPermissions) &&
    user.adminPermissions.length > 0 &&
    (user.adminPermissions.includes('ADMIN_ACCESS') ||
      user.adminPermissions.includes('ADMIN_TENANTS'))
  const isAdmin = isPlatformAdmin
  const isSupplier = user?.role === 'SUPPLIER'
  const isRestaurant = user?.role === 'RESTAURANT'
  const impersonatingRestaurant =
    isPlatformAdmin && impersonation?.active && impersonation?.tenantType === 'RESTAURANT'
  const impersonatingSupplier =
    isPlatformAdmin && impersonation?.active && impersonation?.tenantType === 'SUPPLIER'

  // Build navigation: when impersonating, show that tenant's experience; else by role
  let allNavigation: { name: string; href: string; icon: any; permission?: string }[] = []
  if (isRestaurant || impersonatingRestaurant) {
    allNavigation = [
      ...navigation,
      ...restaurantNavigation.filter((item) => !item.permission || can(item.permission)),
    ]
  } else if (isPlatformAdmin && !impersonation?.active) {
    // Show admin nav only when user has admin role AND admin permissions (never for supplier/restaurant)
    allNavigation = [...adminNavigation]
  } else if (isSupplier || impersonatingSupplier) {
    allNavigation = [
      ...navigation,
      { name: 'Restaurants', href: '/app/restaurants', icon: Users },
      { name: 'Fulfillment', href: '/app/fulfillment', icon: Truck },
      { name: 'Invoices', href: '/app/invoices', icon: FileText, permission: 'INVOICES_VIEW' },
    ].filter((item) => !('permission' in item) || can((item as { permission: string }).permission))
  }

  return (
    <div className="w-64 bg-white shadow-sm border-r" data-testid="sidebar">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-primary">Supplify</h1>
        <p className="text-sm text-gray-600 mt-1">Marketplace</p>
      </div>

      <nav className="px-4 pb-4">
        <ul className="space-y-2">
          {allNavigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <li key={item.name}>
                <Link
                  data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  to={item.href}
                  className={cn(
                    'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              </li>
            )
          })}

          {(can('SETTINGS_VIEW') ||
            (isPlatformAdmin && !impersonation?.active) ||
            isRestaurant ||
            impersonatingRestaurant ||
            isSupplier ||
            impersonatingSupplier) && (
            <li>
              <Link
                data-testid="nav-settings"
                to="/app/settings"
                className={cn(
                  'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  location.pathname === '/app/settings'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <Settings className="mr-3 h-5 w-5" />
                Settings
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </div>
  )
}
