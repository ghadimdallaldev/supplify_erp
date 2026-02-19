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

type NavItem = {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  permission?: string
}

const operationsNav: NavItem[] = [
  { name: 'Products', href: '/app/products', icon: Package },
  { name: 'Cart', href: '/app/cart', icon: ShoppingBag },
  { name: 'Orders', href: '/app/orders', icon: ShoppingCart },
]

const insightsNav: NavItem[] = [
  { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
  { name: 'Chat', href: '/app/chat', icon: MessageSquare },
]

const restaurantOnlyNav: NavItem[] = [
  { name: 'Quick Lists', href: '/app/quick-lists', icon: List },
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

const adminNav: NavItem[] = [
  { name: 'Admin Dashboard', href: '/app/admin', icon: Shield },
  { name: 'Supplier Admin', href: '/app/admin/suppliers', icon: Building2 },
  { name: 'Restaurant Admin', href: '/app/admin/restaurants', icon: Users },
]

function NavSection({
  title,
  items,
  visibleItems,
  canAccess,
}: {
  title: string
  items: NavItem[]
  visibleItems: NavItem[]
  canAccess: (p?: string) => boolean
}) {
  const location = useLocation()
  if (visibleItems.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </h2>
      <ul className="space-y-1">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.href
          const allowed = !item.permission || canAccess(item.permission)
          const content = (
            <>
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 shrink-0 transition-colors',
                  !allowed && 'text-gray-400',
                  isActive && allowed && 'text-primary',
                  !isActive && allowed && 'text-gray-600'
                )}
              />
              {item.name}
            </>
          )
          return (
            <li key={item.name}>
              {allowed ? (
                <Link
                  data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  to={item.href}
                  className={cn(
                    'flex items-center px-3 py-2.5 rounded-r-md text-sm font-medium transition-colors border-l-2 -ml-px',
                    isActive
                      ? 'bg-primary/10 text-primary border-primary'
                      : 'border-transparent text-gray-700 hover:bg-gray-100 hover:border-gray-300'
                  )}
                >
                  {content}
                </Link>
              ) : (
                <span
                  title="Ask admin to enable this"
                  className="flex items-center px-3 py-2.5 rounded-r-md text-sm font-medium text-gray-400 cursor-not-allowed border-l-2 border-transparent"
                >
                  {content}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

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

  const canAccess = (permission?: string) => !permission || can(permission)

  // Tenant context: Operations + Insights + role-specific + Settings
  const showOperations =
    isRestaurant || impersonatingRestaurant || isSupplier || impersonatingSupplier
  const operationsItems =
    isRestaurant || impersonatingRestaurant
      ? [...operationsNav, ...restaurantOnlyNav]
      : isSupplier || impersonatingSupplier
        ? [
            ...operationsNav.filter((i) => i.href !== '/app/cart'),
            { name: 'Restaurants', href: '/app/restaurants', icon: Users } as NavItem,
            { name: 'Fulfillment', href: '/app/fulfillment', icon: Truck } as NavItem,
            {
              name: 'Invoices',
              href: '/app/invoices',
              icon: FileText,
              permission: 'INVOICES_VIEW',
            } as NavItem,
          ]
        : []

  const showInsights =
    isRestaurant || impersonatingRestaurant || isSupplier || impersonatingSupplier
  const insightsItems = [...insightsNav]

  const showSettings =
    can('SETTINGS_VIEW') ||
    (isPlatformAdmin && !impersonation?.active) ||
    isRestaurant ||
    impersonatingRestaurant ||
    isSupplier ||
    impersonatingSupplier

  const settingsActive = location.pathname === '/app/settings'

  return (
    <div className="w-64 bg-white shadow-sm border-r flex flex-col" data-testid="sidebar">
      <div className="p-5 border-b border-gray-100">
        <h1 className="text-xl font-bold text-primary">Supplify</h1>
        <p className="text-xs text-gray-500 mt-0.5">Marketplace</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {showOperations && (
          <NavSection
            title="Operations"
            items={operationsNav}
            visibleItems={operationsItems}
            canAccess={canAccess}
          />
        )}
        {showInsights && (
          <NavSection
            title="Insights"
            items={insightsNav}
            visibleItems={insightsItems}
            canAccess={canAccess}
          />
        )}

        {isPlatformAdmin && !impersonation?.active && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <NavSection
              title="Admin"
              items={adminNav}
              visibleItems={adminNav}
              canAccess={() => true}
            />
          </div>
        )}

        {showSettings && (
          <div
            className={
              isPlatformAdmin && !impersonation?.active
                ? 'mt-2'
                : 'mt-6 pt-4 border-t border-gray-200'
            }
          >
            <h2 className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Account
            </h2>
            <ul className="space-y-1">
              <li>
                <Link
                  data-testid="nav-settings"
                  to="/app/settings"
                  className={cn(
                    'flex items-center px-3 py-2.5 rounded-r-md text-sm font-medium transition-colors border-l-2 -ml-px',
                    settingsActive
                      ? 'bg-primary/10 text-primary border-primary'
                      : 'border-transparent text-gray-700 hover:bg-gray-100 hover:border-gray-300'
                  )}
                >
                  <Settings className="mr-3 h-5 w-5 shrink-0" />
                  Settings
                </Link>
              </li>
            </ul>
          </div>
        )}
      </nav>
    </div>
  )
}
