import { Link, useLocation } from 'react-router-dom'
import { cn } from '../lib/utils'
import { useAppSelector } from '../hooks/redux'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Building2,
  Settings,
  FileText,
  MessageSquare,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
  { name: 'Products', href: '/app/products', icon: Package },
  { name: 'Orders', href: '/app/orders', icon: ShoppingCart },
  { name: 'Cart', href: '/app/cart', icon: FileText },
  { name: 'Chat', href: '/app/chat', icon: MessageSquare },
]

const adminNavigation = [
  { name: 'Suppliers', href: '/app/suppliers', icon: Building2 },
  { name: 'Restaurants', href: '/app/restaurants', icon: Users },
]

export function Sidebar() {
  const location = useLocation()
  const { user } = useAppSelector((state) => state.auth)

  const isAdmin = user?.role === 'ADMIN'
  const isSupplier = user?.role === 'SUPPLIER'
  
  // Suppliers see "Restaurants" link, Admins see both "Suppliers" and "Restaurants"
  let allNavigation = [...navigation]
  if (isAdmin) {
    allNavigation = [...navigation, ...adminNavigation]
  } else if (isSupplier) {
    allNavigation = [...navigation, { name: 'Restaurants', href: '/app/restaurants', icon: Users }]
  }

  return (
    <div className="w-64 bg-white shadow-sm border-r">
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
          
          <li>
            <Link
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
        </ul>
      </nav>
    </div>
  )
}
