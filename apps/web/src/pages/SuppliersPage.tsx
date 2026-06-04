import { useState, useMemo, type ReactNode } from 'react'
import {
  useGetSuppliersQuery,
  useFollowSupplierMutation,
  useUnfollowSupplierMutation,
} from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Search,
  Star,
  Package,
  Heart,
  Ban,
  Eye,
  Grid3x3,
  List,
  Filter,
  TrendingUp,
  ShoppingCart,
  MessageCircle,
  Calendar,
  Award,
  CheckCircle,
  ArrowUpDown,
  Sparkles,
  Users,
  Store,
  Clock,
  X,
} from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { formatPrice } from '../utils/format'
import {
  CardActionGrid,
  CardFooterMeta,
  CardMetaLine,
  CardStatusBadges,
  cardActionBtnClass,
  cardShellClass,
  formatAddressLine,
} from '../components/ui/card-layout'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { cn } from '../lib/utils'

function SupplierStatCard({
  label,
  value,
  hint,
  icon,
  iconWrapClassName,
  active,
  onClick,
}: {
  label: string
  value: number | string
  hint?: string
  icon: ReactNode
  iconWrapClassName: string
  active?: boolean
  onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-start justify-between gap-3 rounded-xl border bg-[var(--surface)] p-4 text-left shadow-sm transition',
        'border-[var(--app-border-mid)]',
        onClick &&
          'hover:border-[var(--brand-mid)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]',
        active && 'border-[var(--brand-mid)] ring-2 ring-[var(--brand-pale)]'
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">{value}</p>
        {hint && <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">{hint}</p>}
      </div>
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          iconWrapClassName
        )}
      >
        {icon}
      </div>
    </Comp>
  )
}

function isSupplierNew(createdAt: string) {
  const daysSince = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  return daysSince <= 30
}

export function SuppliersPage() {
  const { user } = useAppSelector((state) => state.auth)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'products' | 'recent' | 'followed'>('name')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [filterBy, setFilterBy] = useState<'all' | 'followed' | 'new'>('all')

  const isRestaurant = user?.role === 'RESTAURANT'

  const { data, isLoading, error, refetch } = useGetSuppliersQuery({
    q: search || undefined,
    city: cityFilter || undefined,
    limit: 50,
    offset: 0,
  })

  const [followSupplier] = useFollowSupplierMutation()
  const [unfollowSupplier] = useUnfollowSupplierMutation()

  // Calculate statistics
  const stats = useMemo(() => {
    const suppliers = data?.suppliers || []
    return {
      total: suppliers.length,
      followed: suppliers.filter((s: any) => s.is_followed).length,
      withProducts: suppliers.filter((s: any) => Number(s.product_count || 0) > 0).length,
      totalProducts: suppliers.reduce(
        (sum: number, s: any) => sum + Number(s.product_count || 0),
        0
      ),
      newSuppliers: suppliers.filter((s: any) => isSupplierNew(s.created_at)).length,
    }
  }, [data?.suppliers])

  const suppliers = data?.suppliers || []
  const hasActiveFilters = Boolean(search || cityFilter || filterBy !== 'all')

  // Filter and sort suppliers
  const filteredSuppliers = useMemo(() => {
    let suppliers = data?.suppliers || []

    // Filter by status
    if (filterBy === 'followed') {
      suppliers = suppliers.filter((s: any) => s.is_followed)
    } else if (filterBy === 'new') {
      // Show recently created suppliers (within last 30 days)
      suppliers = suppliers.filter((s: any) => {
        const created = new Date(s.created_at)
        const daysSince = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
        return daysSince <= 30
      })
    }

    // Sort
    suppliers = [...suppliers].sort((a: any, b: any) => {
      switch (sortBy) {
        case 'products':
          return Number(b.product_count || 0) - Number(a.product_count || 0)
        case 'recent':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'followed':
          if (a.is_followed && !b.is_followed) return -1
          if (!a.is_followed && b.is_followed) return 1
          return 0
        case 'name':
        default:
          return a.name.localeCompare(b.name)
      }
    })

    return suppliers
  }, [data?.suppliers, filterBy, sortBy])

  const handleFollow = async (supplierId: string) => {
    try {
      await followSupplier(supplierId).unwrap()
      toast.success('Supplier followed')
      // RTK Query will automatically refetch due to invalidatesTags, but manual refetch ensures immediate UI update
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to follow supplier')
    }
  }

  const handleUnfollow = async (supplierId: string) => {
    try {
      await unfollowSupplier(supplierId).unwrap()
      toast.success('Supplier unfollowed')
      // RTK Query will automatically refetch due to invalidatesTags, but manual refetch ensures immediate UI update
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to unfollow supplier')
    }
  }

  const handleViewProducts = (supplierId: string) => {
    navigate(`/app/products?supplier=${supplierId}`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)]">Failed to load suppliers</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 min-w-0" data-testid="suppliers-page">
      <PageHeader
        title="Suppliers"
        description={
          isRestaurant
            ? 'Discover suppliers, follow favorites, and browse their catalogs.'
            : 'Manage suppliers in the marketplace'
        }
        actions={
          isRestaurant ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/products">Browse products</Link>
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
              >
                <Grid3x3 className="h-4 w-4 mr-1" />
                Grid
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
              >
                <List className="h-4 w-4 mr-1" />
                List
              </Button>
            </div>
          ) : undefined
        }
      />

      {isRestaurant && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <SupplierStatCard
              label="Total suppliers"
              value={stats.total}
              hint="Available in your marketplace"
              icon={<Building2 className="h-5 w-5 text-[var(--brand-mid)]" />}
              iconWrapClassName="bg-[var(--brand-pale)]"
              active={filterBy === 'all' && stats.total > 0}
              onClick={stats.total > 0 ? () => setFilterBy('all') : undefined}
            />
            <SupplierStatCard
              label="Following"
              value={stats.followed}
              hint="Suppliers you follow for quick access"
              icon={<Heart className="h-5 w-5 text-[var(--red)]" />}
              iconWrapClassName="bg-[var(--red-pale)]"
              active={filterBy === 'followed'}
              onClick={stats.total > 0 ? () => setFilterBy('followed') : undefined}
            />
            <SupplierStatCard
              label="With products"
              value={stats.withProducts}
              hint="Ready to browse and order"
              icon={<Package className="h-5 w-5 text-[var(--mint)]" />}
              iconWrapClassName="bg-[var(--mint)]/15"
            />
            <SupplierStatCard
              label="Total products"
              value={stats.totalProducts}
              hint={
                stats.newSuppliers > 0
                  ? `${stats.newSuppliers} new supplier${stats.newSuppliers === 1 ? '' : 's'} this month`
                  : 'Across all suppliers'
              }
              icon={<TrendingUp className="h-5 w-5 text-[var(--amber-mid)]" />}
              iconWrapClassName="bg-[var(--amber-pale)]"
              active={filterBy === 'new'}
              onClick={stats.newSuppliers > 0 ? () => setFilterBy('new') : undefined}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-[var(--app-border-mid)] bg-[var(--surface)] p-3 shadow-sm lg:flex-row lg:items-center lg:p-4">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <Input
                placeholder="Search by name, email, or city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 rounded-lg border-[var(--app-border-mid)] pl-10"
                aria-label="Search suppliers"
              />
            </div>
            <Input
              placeholder="City"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="h-10 w-full rounded-lg border-[var(--app-border-mid)] lg:w-40"
              aria-label="Filter by city"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filterBy === 'all' ? 'default' : 'outline'}
                size="sm"
                className="h-10 rounded-lg"
                onClick={() => setFilterBy('all')}
              >
                <Filter className="h-4 w-4 mr-1.5" />
                All
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  {stats.total}
                </Badge>
              </Button>
              <Button
                variant={filterBy === 'followed' ? 'default' : 'outline'}
                size="sm"
                className="h-10 rounded-lg"
                onClick={() => setFilterBy('followed')}
              >
                <Heart className="h-4 w-4 mr-1.5" />
                Following
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  {stats.followed}
                </Badge>
              </Button>
              <Button
                variant={filterBy === 'new' ? 'default' : 'outline'}
                size="sm"
                className="h-10 rounded-lg"
                onClick={() => setFilterBy('new')}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                New
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  {stats.newSuppliers}
                </Badge>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 rounded-lg"
                onClick={() =>
                  setSortBy(
                    sortBy === 'name' ? 'products' : sortBy === 'products' ? 'recent' : 'name'
                  )
                }
              >
                <ArrowUpDown className="h-4 w-4 mr-1.5" />
                {sortBy === 'name' ? 'Name' : sortBy === 'products' ? 'Products' : 'Recent'}
              </Button>
            </div>
          </div>
        </>
      )}

      {filteredSuppliers.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title={hasActiveFilters ? 'No suppliers match your filters' : 'No suppliers yet'}
            description={
              hasActiveFilters
                ? 'Try clearing filters or broadening your search.'
                : isRestaurant
                  ? 'When suppliers join the marketplace, they will appear here. Browse products or check back soon.'
                  : 'No suppliers are registered in the marketplace yet.'
            }
            icon={<Building2 className="h-6 w-6" aria-hidden />}
            action={
              hasActiveFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('')
                    setCityFilter('')
                    setFilterBy('all')
                  }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear filters
                </Button>
              ) : isRestaurant ? (
                <Button asChild>
                  <Link to="/app/products">
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Browse products
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={() => refetch()}>
                  Refresh
                </Button>
              )
            }
          />
          {isRestaurant && !hasActiveFilters && suppliers.length === 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  step: '1',
                  title: 'Explore the catalog',
                  body: 'Browse products from every connected supplier.',
                  icon: Package,
                  to: '/app/products',
                },
                {
                  step: '2',
                  title: 'Follow suppliers',
                  body: 'Save favorites to find them quickly later.',
                  icon: Heart,
                },
                {
                  step: '3',
                  title: 'Message & order',
                  body: 'Chat with suppliers and place orders from their catalog.',
                  icon: MessageCircle,
                },
              ].map(({ step, title, body, icon: Icon, to }) => (
                <div
                  key={step}
                  className="rounded-xl border border-[var(--app-border-mid)] bg-[var(--surface)] p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-pale)] text-xs font-bold text-[var(--brand-mid)]">
                      {step}
                    </span>
                    <Icon className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
                    <span className="text-sm font-semibold text-[var(--text)]">{title}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>
                  {to && (
                    <Button variant="link" size="sm" className="mt-2 h-auto p-0" asChild>
                      <Link to={to}>Go to products</Link>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredSuppliers.map((supplier: any) => {
            const locationLine = formatAddressLine(supplier.address_json)
            const isNew = isSupplierNew(supplier.created_at)
            return (
              <Card
                key={supplier.id}
                className={`${cardShellClass} hover:shadow-lg transition-all duration-200 group`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {supplier.logo_url ? (
                      <img
                        src={supplier.logo_url}
                        alt={supplier.name}
                        className="h-12 w-12 rounded-lg object-cover border-2 border-[var(--app-border)] shadow-md"
                        onError={(e) => {
                          // Fallback to gradient if image fails to load
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                          const fallback = target.nextElementSibling as HTMLDivElement
                          if (fallback) fallback.style.display = 'flex'
                        }}
                      />
                    ) : null}
                    <div
                      className={`h-12 w-12 rounded-lg bg-gradient-to-br from-[var(--brand)] to-[var(--brand-mid)] flex items-center justify-center text-white font-bold text-lg shadow-md ${supplier.logo_url ? 'hidden' : ''}`}
                    >
                      {supplier.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg min-w-0 flex-1">
                          <span className="block truncate">{supplier.name}</span>
                          {supplier.avg_rating != null && Number(supplier.avg_rating) > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-sm font-normal text-amber-600 mt-0.5">
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                              {Number(supplier.avg_rating).toFixed(1)}
                            </span>
                          ) : null}
                        </CardTitle>
                        <CardStatusBadges className="shrink-0 max-w-[45%] justify-end">
                          {isNew && (
                            <Badge className="bg-[var(--mint)] text-white flex items-center gap-1 shadow-sm text-[10px] px-1.5 py-0">
                              <Sparkles className="h-3 w-3 shrink-0" />
                              New
                            </Badge>
                          )}
                          {isRestaurant && supplier.is_followed && (
                            <Badge className="bg-[var(--brand)] text-white flex items-center gap-1 shadow-sm text-[10px] px-1.5 py-0">
                              <Heart className="h-3 w-3 fill-current shrink-0" />
                              Following
                            </Badge>
                          )}
                        </CardStatusBadges>
                      </div>
                      <CardDescription className="truncate mt-1">{supplier.slug}</CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Key Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[var(--brand-ultra)] rounded-lg p-3 border border-[var(--app-border)]">
                      <div className="flex items-center gap-2 mb-1">
                        <Package className="h-4 w-4 text-[var(--brand-mid)]" />
                        <span className="text-xs font-medium text-[var(--brand-mid)]">
                          Products
                        </span>
                      </div>
                      <p className="text-xl font-bold text-[var(--text)]">
                        {Number(supplier.product_count || 0)}
                      </p>
                    </div>
                    {supplier.avg_price > 0 && (
                      <div className="bg-[var(--mint-pale)] rounded-lg p-3 border border-[var(--mint)]/25">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="h-4 w-4 text-[var(--mint)]" />
                          <span className="text-xs font-medium text-[var(--mint)]">Avg Price</span>
                        </div>
                        <p className="text-xl font-bold text-[var(--mint)]">
                          ${formatPrice(supplier.avg_price)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  {locationLine ? (
                    <CardMetaLine icon={MapPin} className="bg-[var(--brand-ultra)] rounded-md p-2">
                      {locationLine}
                    </CardMetaLine>
                  ) : isRestaurant ? (
                    <CardMetaLine icon={MapPin} className="italic">
                      Location not provided
                    </CardMetaLine>
                  ) : null}

                  {/* Contact */}
                  {supplier.contact_email ? (
                    <a href={`mailto:${supplier.contact_email}`} className="block min-w-0">
                      <CardMetaLine
                        icon={Mail}
                        muted={false}
                        className="text-[var(--brand-mid)] hover:underline"
                      >
                        {supplier.contact_email}
                      </CardMetaLine>
                    </a>
                  ) : null}

                  {/* Actions */}
                  <CardActionGrid>
                    {isRestaurant && (
                      <Button variant="default" size="sm" className={cardActionBtnClass()} asChild>
                        <Link to={`/app/chat?supplier=${supplier.id}`}>
                          <MessageCircle className="h-4 w-4 mr-1 shrink-0" />
                          Message
                        </Link>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className={cardActionBtnClass()}
                      onClick={() => handleViewProducts(supplier.id)}
                    >
                      <Package className="h-4 w-4 mr-1 shrink-0" />
                      Products
                    </Button>
                    <Button variant="outline" size="sm" className={cardActionBtnClass()} asChild>
                      <Link to={`/app/suppliers/${supplier.id}`}>
                        <Eye className="h-4 w-4 mr-1 shrink-0" />
                        View
                      </Link>
                    </Button>
                    {isRestaurant && (
                      <>
                        {!supplier.is_followed ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleFollow(supplier.id)}
                            className={`${cardActionBtnClass({ iconOnly: true })} text-[var(--red)] hover:text-[var(--red)] hover:bg-[var(--red-pale)]`}
                            aria-label="Follow supplier"
                          >
                            <Heart className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnfollow(supplier.id)}
                            className={`${cardActionBtnClass({ iconOnly: true })} text-[var(--red)] bg-[var(--red-pale)] hover:bg-[var(--red-pale)]`}
                            aria-label="Unfollow supplier"
                          >
                            <Heart className="h-4 w-4 fill-current" />
                          </Button>
                        )}
                      </>
                    )}
                  </CardActionGrid>

                  <CardFooterMeta
                    left={supplier.vat_no ? `VAT: ${supplier.vat_no}` : undefined}
                    right={
                      <>
                        <Clock className="h-3 w-3 shrink-0" aria-hidden />
                        <span>Joined {new Date(supplier.created_at).toLocaleDateString()}</span>
                      </>
                    }
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSuppliers.map((supplier: any) => (
            <Card
              key={supplier.id}
              className={`${cardShellClass} hover:shadow-md transition-shadow`}
            >
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {supplier.logo_url ? (
                      <img
                        src={supplier.logo_url}
                        alt={supplier.name}
                        className="h-16 w-16 rounded-lg object-cover border-2 border-[var(--app-border)] shadow-md"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                          const fallback = target.nextElementSibling as HTMLDivElement
                          if (fallback) fallback.style.display = 'flex'
                        }}
                      />
                    ) : null}
                    <div
                      className={`h-16 w-16 rounded-lg bg-gradient-to-br from-[var(--brand)] to-[var(--brand-mid)] flex items-center justify-center text-white font-bold text-xl shadow-md ${supplier.logo_url ? 'hidden' : ''}`}
                    >
                      {supplier.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-[var(--text)]">{supplier.name}</h3>
                        {isRestaurant && supplier.is_followed && (
                          <Badge className="bg-[var(--brand)] text-white">
                            <Heart className="h-3 w-3 mr-1 fill-current" />
                            Following
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-muted)]">
                        <span className="flex items-center gap-1 shrink-0">
                          <Package className="h-4 w-4 shrink-0" />
                          {Number(supplier.product_count || 0)} Products
                        </span>
                        {supplier.avg_price > 0 && (
                          <span className="flex items-center gap-1 shrink-0">
                            <TrendingUp className="h-4 w-4 shrink-0" />
                            Avg: ${formatPrice(supplier.avg_price)}
                          </span>
                        )}
                        {formatAddressLine(supplier.address_json) ? (
                          <span className="flex min-w-0 items-center gap-1">
                            <MapPin className="h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {formatAddressLine(supplier.address_json)}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:justify-end">
                    {isRestaurant && (
                      <Button variant="default" size="sm" asChild>
                        <Link to={`/app/chat?supplier=${supplier.id}`}>
                          <MessageCircle className="h-4 w-4 mr-1" />
                          Message
                        </Link>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewProducts(supplier.id)}
                    >
                      <Package className="h-4 w-4 mr-1" />
                      View Products
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/app/suppliers/${supplier.id}`}>
                        <Eye className="h-4 w-4 mr-1" />
                        Details
                      </Link>
                    </Button>
                    {isRestaurant && (
                      <>
                        {!supplier.is_followed ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleFollow(supplier.id)}
                          >
                            <Heart className="h-4 w-4 mr-1" />
                            Follow
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnfollow(supplier.id)}
                            className="text-[var(--red)]"
                          >
                            <Heart className="h-4 w-4 mr-1 fill-current" />
                            Unfollow
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
