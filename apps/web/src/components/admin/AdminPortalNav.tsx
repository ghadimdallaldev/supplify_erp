import { Link, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Building2, Settings, Shield, Users } from 'lucide-react'

const ADMIN_LINKS = [
  {
    href: '/app/admin',
    label: 'Platform overview',
    icon: Shield,
    match: (path: string) => path === '/app/admin',
  },
  {
    href: '/app/admin/suppliers',
    label: 'Supplier admin',
    icon: Building2,
    match: (path: string) => path.startsWith('/app/admin/suppliers'),
  },
  {
    href: '/app/admin/restaurants',
    label: 'Restaurant admin',
    icon: Users,
    match: (path: string) => path.startsWith('/app/admin/restaurants'),
  },
  {
    href: '/app/settings',
    label: 'Settings',
    icon: Settings,
    match: (path: string) => path.startsWith('/app/settings'),
  },
] as const

export function AdminPortalNav() {
  const { pathname } = useLocation()

  return (
    <nav
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 sm:px-5"
      aria-label="Admin portal"
      data-testid="admin-portal-nav"
    >
      {ADMIN_LINKS.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            to={href}
            className={cn(
              'inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors',
              active
                ? 'bg-[var(--brand-pale)] text-[var(--brand)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--brand-ultra)] hover:text-[var(--text)]'
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
