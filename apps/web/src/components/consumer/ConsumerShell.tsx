import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Gift, Home, MapPin, Menu, Search, User } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useConsumerAuth } from '../../contexts/ConsumerAuthContext'
import { useGetPublicConsumerStorefrontQuery } from '../../services/consumerApi'
import { getRestaurantOpenStatus } from '../../lib/consumerHours'
import { orderingStatusFromBranch } from '../../lib/consumerOrderingHours'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

type ConsumerShellProps = {
  slug: string
  children: ReactNode
  showBranchPicker?: boolean
  hideBottomNav?: boolean
}

const NAV_ITEMS = [
  {
    key: 'home',
    label: 'Home',
    icon: Home,
    match: (path: string) => /\/order\/[^/]+\/?$/.test(path),
  },
  {
    key: 'menu',
    label: 'Menu',
    icon: Menu,
    match: (path: string) => path.includes('/menu'),
  },
  {
    key: 'track',
    label: 'Track',
    icon: Search,
    match: (path: string) => path.includes('/track'),
  },
  {
    key: 'account',
    label: 'Account',
    icon: User,
    match: (path: string) => path.includes('/account') || path.includes('/rewards'),
  },
] as const

export function ConsumerShell({
  slug,
  children,
  showBranchPicker = false,
  hideBottomNav = false,
}: ConsumerShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAuthenticated } = useConsumerAuth()
  const { data: storefront } = useGetPublicConsumerStorefrontQuery(slug, { skip: !slug })

  const branchId = searchParams.get('branchId') ?? ''
  const branches = storefront?.branches ?? []
  const restaurant = storefront?.restaurant
  const activeBranch = branches.find((b) => b.branchId === branchId) ?? branches[0]
  const orderingStatus = orderingStatusFromBranch(activeBranch)
  const openStatus = getRestaurantOpenStatus(restaurant?.operatingHours ?? null)

  const headerStatus = activeBranch
    ? {
        label:
          orderingStatus.mode === 'LIVE'
            ? 'Taking orders'
            : orderingStatus.mode === 'PREORDER_ONLY'
              ? 'Preorders open'
              : 'Closed',
        isPositive: orderingStatus.mode !== 'CLOSED',
        isPreorder: orderingStatus.mode === 'PREORDER_ONLY',
      }
    : {
        label: openStatus.label,
        isPositive: openStatus.isOpen,
        isPreorder: false,
      }

  const menuPath = branchId ? `/order/${slug}/menu?branchId=${branchId}` : `/order/${slug}/menu`

  const handleBranchChange = (nextBranchId: string) => {
    const params = new URLSearchParams(searchParams)
    if (nextBranchId) params.set('branchId', nextBranchId)
    else params.delete('branchId')
    setSearchParams(params, { replace: true })
  }

  const isMinimal =
    location.pathname.includes('/checkout') || location.pathname.includes('/receipt/')

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--brand-ultra)]">
      <header className="sticky top-0 z-40 border-b border-[var(--app-border)] bg-[var(--surface)] pwa-safe-top">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Link to={`/order/${slug}`} className="block truncate font-semibold text-[var(--text)]">
              {restaurant?.name ?? 'Order online'}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <Badge
                variant={headerStatus.isPositive ? 'default' : 'secondary'}
                className={cn(
                  'text-[10px] font-medium',
                  headerStatus.isPositive &&
                    !headerStatus.isPreorder &&
                    'bg-green-600 hover:bg-green-600',
                  headerStatus.isPreorder && 'bg-amber-600 hover:bg-amber-600'
                )}
              >
                {headerStatus.label}
              </Badge>
              {openStatus.todayHours && (
                <span className="text-xs text-muted-foreground">{openStatus.todayHours}</span>
              )}
            </div>
          </div>
          {showBranchPicker && branches.length > 1 && (
            <Select value={branchId || branches[0]?.branchId} onValueChange={handleBranchChange}>
              <SelectTrigger className="h-9 w-[140px] shrink-0 text-xs">
                <MapPin className="mr-1 h-3.5 w-3.5 shrink-0" />
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.branchId} value={branch.branchId}>
                    {branch.branchName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isAuthenticated ? (
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link to={`/order/${slug}/rewards`} aria-label="Rewards">
                <Gift className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm" className="shrink-0 text-xs">
              <Link to={`/order/${slug}/account`}>Join</Link>
            </Button>
          )}
        </div>
      </header>

      <main
        className={cn(
          'mx-auto w-full max-w-3xl flex-1',
          isMinimal ? 'pwa-safe-bottom' : 'pwa-main-with-bottom-nav'
        )}
      >
        {children}
      </main>

      {!hideBottomNav && !isMinimal && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--app-border)] bg-[var(--surface)] pwa-bottom-nav"
          aria-label="Consumer navigation"
        >
          <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2">
            {NAV_ITEMS.map(({ key, label, icon: Icon, match }) => {
              const active = match(location.pathname)
              const href =
                key === 'home'
                  ? `/order/${slug}`
                  : key === 'menu'
                    ? menuPath
                    : key === 'track'
                      ? `/order/${slug}/track`
                      : isAuthenticated
                        ? `/order/${slug}/rewards`
                        : `/order/${slug}/account`

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => navigate(href)}
                  className={cn(
                    'flex min-h-[56px] min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors sm:text-xs',
                    active
                      ? 'text-[var(--brand-mid)]'
                      : 'text-muted-foreground hover:text-[var(--text)]'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className={cn('h-5 w-5', active && 'text-[var(--brand-mid)]')} />
                  {label}
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}

export default ConsumerShell
