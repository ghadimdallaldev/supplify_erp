import { Link, NavLink, Outlet } from 'react-router-dom'
import { Bell, PackageSearch, ShoppingBag, UserRound } from 'lucide-react'
import { useAppSelector } from '../../hooks/redux'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

const links = [
  { to: '/shop', label: 'Discover', icon: ShoppingBag, end: true },
  { to: '/shop/orders', label: 'Orders', icon: PackageSearch },
  { to: '/shop/notifications', label: 'Notifications', icon: Bell },
  { to: '/shop/account', label: 'Account', icon: UserRound },
]

export function ConsumerShopShell() {
  const user = useAppSelector((state) => state.auth.user)
  return (
    <div className="min-h-dvh bg-[var(--brand-ultra)]">
      <header className="sticky top-0 z-40 border-b bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link to="/shop" className="text-lg font-bold text-[var(--brand)]">
            Supplify Shop
          </Link>
          <nav
            className="ml-auto hidden items-center gap-1 sm:flex"
            aria-label="Consumer navigation"
          >
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm',
                    isActive
                      ? 'bg-[var(--brand-pale)] text-[var(--brand)]'
                      : 'text-muted-foreground'
                  )
                }
              >
                <Icon className="h-4 w-4" /> {label}
              </NavLink>
            ))}
          </nav>
          {!user && (
            <Button asChild size="sm">
              <Link to="/login?redirect=%2Fshop">Sign in</Link>
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24">
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-[var(--surface)] p-1 sm:hidden"
        aria-label="Consumer navigation"
      >
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs',
                isActive ? 'text-[var(--brand)]' : 'text-muted-foreground'
              )
            }
          >
            <Icon className="h-5 w-5" /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
