import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useGetSupplierQuery,
  useGetProductsQuery,
  useCreateConversationMutation,
  useGetRestaurantsQuery,
  useFollowSupplierMutation,
  useUnfollowSupplierMutation,
  useBlockSupplierMutation,
  useUnblockSupplierMutation,
  useGetSupplierStatisticsQuery,
  useGetSupplierReviewsQuery,
  useGetSupplierRatingSummaryQuery,
  useGetMyReviewsQuery,
  useDeleteReviewMutation,
  useGetEntitlementsQuery,
} from '../services/api'
import { featureEnabled } from '../lib/planLimits'
import { canEditReview } from '../lib/orderReviewEligibility'
import {
  SupplierReviewModal,
  type SupplierReviewEditTarget,
} from '../components/reviews/SupplierReviewModal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { DetailPageSkeleton } from '../components/ui/detail-page-skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Package,
  MessageSquare,
  Heart,
  ShoppingCart,
  TrendingUp,
  DollarSign,
  Clock,
  Globe,
  FileText,
  Star,
  FileQuestion,
  Ban,
} from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { formatCurrency, formatPrice } from '../utils/format'
import { CardAddressBlock } from '../components/ui/card-layout'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { ensureNamespace } from '../i18n'

export function SupplierDetailPage() {
  const { t } = useTranslation('suppliers')
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const isRestaurant = user?.role === 'RESTAURANT'
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !isRestaurant })
  const reviewsWriteEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.supplier_reviews
  )

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  const { data, isLoading, error, refetch } = useGetSupplierQuery(id!)
  useGetRestaurantsQuery()
  const [createConversation, { isLoading: isCreatingConversation }] =
    useCreateConversationMutation()
  const [followSupplier, { isLoading: isFollowing }] = useFollowSupplierMutation()
  const [unfollowSupplier, { isLoading: isUnfollowing }] = useUnfollowSupplierMutation()
  const [blockSupplier, { isLoading: isBlocking }] = useBlockSupplierMutation()
  const [unblockSupplier, { isLoading: isUnblocking }] = useUnblockSupplierMutation()
  const [showBlockDialog, setShowBlockDialog] = useState(false)
  const [blockReason, setBlockReason] = useState('')

  // Fetch products for this supplier
  const { data: productsData, isLoading: isLoadingProducts } = useGetProductsQuery({
    supplier: id,
    limit: 50,
    offset: 0,
  })

  // Fetch supplier statistics (for restaurants viewing suppliers)
  const { data: statsData } = useGetSupplierStatisticsQuery(id!, {
    skip: !isRestaurant || !id,
  })
  const { data: reviewsData } = useGetSupplierReviewsQuery(
    { supplierId: id!, limit: 20 },
    { skip: !id }
  )
  const { data: ratingSummaryData } = useGetSupplierRatingSummaryQuery(id!, { skip: !id })
  const { data: myReviewsData, refetch: refetchMyReviews } = useGetMyReviewsQuery(undefined, {
    skip: !isRestaurant,
  })
  const [deleteReview, { isLoading: deletingReview }] = useDeleteReviewMutation()
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [editingReview, setEditingReview] = useState<SupplierReviewEditTarget | null>(null)

  const myReviewIds = new Set((myReviewsData?.reviews ?? []).map((r) => String(r.id)))
  const myReviewsById = new Map(
    (myReviewsData?.reviews ?? []).map((r) => [String(r.id), r as Record<string, unknown>])
  )

  const stats = statsData || null
  const ratingSummary = ratingSummaryData?.summary as Record<string, unknown> | undefined

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (error || !data?.supplier) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)]">{t('detail.loadFailed')}</p>
      </div>
    )
  }

  const supplier = data.supplier

  const handleSendMessage = async () => {
    if (!user || !id) {
      toast.error(t('detail.toast.userMissing'))
      return
    }

    try {
      const result = await createConversation({
        supplierId: id,
      }).unwrap()

      toast.success(t('detail.toast.openingConversation'))
      navigate(`/app/chat?conversation=${result.conversation.id}`)
    } catch (error: any) {
      console.error('Create conversation error:', error)
      toast.error(error?.data?.error?.message || t('detail.toast.conversationFailed'))
    }
  }

  const handleFollowToggle = async () => {
    if (!id) return

    const isFollowed = supplier.is_followed

    try {
      if (isFollowed) {
        await unfollowSupplier(id).unwrap()
        toast.success(t('detail.toast.unfollowed'))
      } else {
        await followSupplier(id).unwrap()
        toast.success(t('detail.toast.followed'))
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('detail.toast.followFailed'))
    }
    refetch()
  }

  const isBlocked = Boolean(supplier.is_blocked)

  const handleBlockSupplier = async () => {
    if (!id) return
    try {
      await blockSupplier({ id, reason: blockReason.trim() || undefined }).unwrap()
      toast.success(t('detail.toast.blocked'))
      setShowBlockDialog(false)
      setBlockReason('')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('detail.toast.blockFailed'))
    }
  }

  const handleUnblockSupplier = async () => {
    if (!id) return
    try {
      await unblockSupplier(id).unwrap()
      toast.success(t('detail.toast.unblocked'))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('detail.toast.unblockFailed'))
    }
  }

  return (
    <PageShell data-testid="supplier-detail-page">
      <div className="flex items-start gap-4">
        {supplier.logo_url ? (
          <img
            src={supplier.logo_url}
            alt={supplier.name}
            className="h-20 w-20 rounded-lg object-cover border-2 border-[var(--app-border)] shadow-md"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              const fallback = target.nextElementSibling as HTMLDivElement
              if (fallback) fallback.style.display = 'flex'
            }}
          />
        ) : null}
        <div
          className={`h-20 w-20 rounded-lg bg-gradient-to-br from-[var(--brand)] to-[var(--brand-mid)] flex items-center justify-center text-white font-bold text-3xl shadow-md ${supplier.logo_url ? 'hidden' : ''}`}
        >
          {supplier.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <PageHeader
            title={supplier.name}
            description={supplier.slug}
            className="mb-0"
            actions={
              isRestaurant ? (
                <div className="flex flex-wrap gap-2 shrink-0">
                  {isBlocked ? (
                    <>
                      <Badge variant="destructive" className="self-center">
                        {t('detail.blocked')}
                      </Badge>
                      <Button
                        variant="outline"
                        className="whitespace-normal"
                        onClick={handleUnblockSupplier}
                        disabled={isUnblocking}
                        data-testid="unblock-supplier"
                      >
                        {t('detail.unblock')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant={supplier.is_followed ? 'default' : 'outline'}
                        className="whitespace-normal"
                        onClick={handleFollowToggle}
                        disabled={isFollowing || isUnfollowing}
                      >
                        <Heart
                          className={`h-4 w-4 mr-2 ${supplier.is_followed ? 'fill-current' : ''}`}
                        />
                        {supplier.is_followed ? t('detail.following') : t('detail.follow')}
                      </Button>
                      <Button
                        variant="outline"
                        className="whitespace-normal"
                        onClick={handleSendMessage}
                        disabled={isCreatingConversation}
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        {isCreatingConversation ? t('detail.opening') : t('detail.message')}
                      </Button>
                      <Button variant="outline" className="whitespace-normal" asChild>
                        <Link
                          to="/app/quote-requests/new"
                          state={{
                            prefill: {
                              supplierIds: [supplier.id],
                              items: (productsData?.products ?? []).slice(0, 5).map((p) => ({
                                productId: p.id,
                                quantity: 1,
                              })),
                            },
                          }}
                        >
                          <FileQuestion className="h-4 w-4 mr-2" />
                          {t('detail.requestBestPrice')}
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        className="whitespace-normal text-[var(--red)] border-[var(--red)]/30 hover:bg-red-50"
                        onClick={() => setShowBlockDialog(true)}
                        disabled={isBlocking}
                        data-testid="block-supplier"
                      >
                        <Ban className="h-4 w-4 mr-2" />
                        {t('detail.block')}
                      </Button>
                    </>
                  )}
                </div>
              ) : undefined
            }
          />
          {ratingSummary?.avg_rating != null && Number(ratingSummary.avg_rating) > 0 ? (
            <p className="flex items-center gap-1 text-sm text-amber-600 mt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${i < Math.round(Number(ratingSummary.avg_rating)) ? 'fill-amber-400' : 'text-amber-200'}`}
                />
              ))}
              <span>
                {t('detail.reviewsCount', {
                  rating: Number(ratingSummary.avg_rating).toFixed(1),
                  count: String(ratingSummary.review_count ?? 0),
                })}
              </span>
            </p>
          ) : null}
          {supplier.description && (
            <p className="text-sm text-[var(--text-muted)] mt-2 max-w-2xl">
              {supplier.description}
            </p>
          )}
        </div>
      </div>

      {/* Statistics Cards - Show only for restaurants */}
      {isRestaurant && stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-muted)]">
                    {t('detail.stats.totalOrders')}
                  </p>
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.totalOrders}</p>
                </div>
                <ShoppingCart className="h-8 w-8 text-[var(--brand-mid)]" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-muted)]">
                    {t('detail.stats.totalSpent')}
                  </p>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {formatCurrency(stats.totalSpent, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-[var(--mint)]" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-muted)]">
                    {t('detail.stats.avgOrderValue')}
                  </p>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {formatCurrency(stats.averageOrderValue, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-[var(--brand-mid)]" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-muted)]">
                    {t('detail.stats.productsAvailable')}
                  </p>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {supplier.product_count || 0}
                  </p>
                </div>
                <Package className="h-8 w-8 text-[var(--amber-mid)]" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {t('detail.contactInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
              <a
                href={`mailto:${supplier.contact_email}`}
                className="text-[var(--brand-mid)] hover:underline truncate"
              >
                {supplier.contact_email}
              </a>
            </div>
            {supplier.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                <a
                  href={`tel:${supplier.phone}`}
                  className="text-[var(--text-mid)] hover:text-[var(--brand-mid)]"
                >
                  {supplier.phone}
                </a>
              </div>
            )}
            <CardAddressBlock address={supplier.address_json} icon={MapPin} />
            {supplier.website && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                <a
                  href={supplier.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--brand-mid)] hover:underline truncate"
                >
                  {supplier.website}
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Business Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('detail.businessInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {supplier.legal_name && (
              <div>
                <p className="text-sm text-[var(--text-muted)]">{t('detail.legalName')}</p>
                <p className="font-medium">{supplier.legal_name}</p>
              </div>
            )}
            {supplier.vat_no && (
              <div>
                <p className="text-sm text-[var(--text-muted)]">{t('detail.vatNumber')}</p>
                <p className="font-medium">{supplier.vat_no}</p>
              </div>
            )}
            {supplier.trade_license_no && (
              <div>
                <p className="text-sm text-[var(--text-muted)]">{t('detail.tradeLicense')}</p>
                <p className="font-medium">{supplier.trade_license_no}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-[var(--text-muted)]">{t('detail.memberSince')}</p>
              <p className="font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(supplier.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Products & Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {t('detail.productsPricing')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-3xl font-bold">{supplier.product_count || 0}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {t('detail.totalProductsAvailable')}
              </p>
            </div>
            {supplier.avg_price > 0 && (
              <div>
                <p className="text-2xl font-bold text-[var(--mint)]">
                  {formatPrice(supplier.avg_price)}
                </p>
                <p className="text-sm text-[var(--text-muted)]">
                  {t('detail.averageProductPrice')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      {isRestaurant && (
        <div className="flex space-x-4">
          <Button asChild>
            <Link to={`/app/products?supplier=${supplier.id}`}>
              <Package className="h-4 w-4 mr-2" />
              {t('detail.viewAllProducts')}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/app/chat?supplier=${supplier.id}`}>
              <MessageSquare className="h-4 w-4 mr-2" />
              {t('detail.sendMessage')}
            </Link>
          </Button>
        </div>
      )}

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">{t('detail.tabs.products')}</TabsTrigger>
          <TabsTrigger value="reviews">{t('detail.tabs.reviews')}</TabsTrigger>
        </TabsList>
        <TabsContent value="reviews">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('detail.reviews.title')}</CardTitle>
              {isRestaurant && reviewsWriteEnabled && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingReview(null)
                    setShowReviewModal(true)
                  }}
                >
                  {t('detail.reviews.writeReview')}
                </Button>
              )}
              {isRestaurant && !reviewsWriteEnabled && (
                <p className="text-xs text-[var(--text-muted)]">
                  {t('detail.reviews.upgradeHint')}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {(reviewsData?.reviews || []).length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t('detail.reviews.empty')}</p>
              ) : (
                (reviewsData?.reviews || []).map((r: Record<string, unknown>) => {
                  const reviewId = String(r.id)
                  const isOwnReview = myReviewIds.has(reviewId)
                  const ownReviewMeta = myReviewsById.get(reviewId) as
                    | Record<string, unknown>
                    | undefined
                  const showEdit =
                    isOwnReview &&
                    canEditReview(
                      {
                        reviewer_user_id: ownReviewMeta?.reviewer_user_id as string | undefined,
                        created_at: (ownReviewMeta?.created_at ?? r.created_at) as
                          | string
                          | undefined,
                      },
                      user?.id
                    )

                  return (
                    <div key={reviewId} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1 text-amber-600">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3.5 w-3.5 ${i < Number(r.overall_rating || 0) ? 'fill-amber-400' : 'text-amber-200'}`}
                            />
                          ))}
                        </div>
                        {isOwnReview && (
                          <div className="flex gap-1 shrink-0">
                            {showEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => {
                                  setEditingReview({
                                    id: reviewId,
                                    overall_rating: Number(r.overall_rating) || 5,
                                    comment: r.comment ? String(r.comment) : null,
                                  })
                                  setShowReviewModal(true)
                                }}
                              >
                                {t('detail.reviews.edit')}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[var(--red)]"
                              disabled={deletingReview}
                              onClick={async () => {
                                if (!window.confirm(t('detail.reviews.deleteConfirm'))) return
                                try {
                                  await deleteReview(reviewId).unwrap()
                                  toast.success(t('detail.reviews.deleted'))
                                  refetchMyReviews()
                                } catch (e: unknown) {
                                  const err = e as { data?: { error?: { message?: string } } }
                                  toast.error(
                                    err?.data?.error?.message || t('detail.reviews.deleteFailed')
                                  )
                                }
                              }}
                            >
                              {t('detail.reviews.delete')}
                            </Button>
                          </div>
                        )}
                      </div>
                      {r.comment ? <p className="mt-2">{String(r.comment)}</p> : null}
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {r.created_at ? new Date(String(r.created_at)).toLocaleDateString() : ''}
                      </p>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Package className="h-5 w-5" />
                <span>
                  {t('detail.productsTab.title', {
                    count: productsData?.products.length || 0,
                  })}
                </span>
              </CardTitle>
              <CardDescription>{t('detail.productsTab.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingProducts ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand)]"></div>
                </div>
              ) : productsData?.products.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-4" />
                  <p className="text-[var(--text-muted)]">{t('detail.productsTab.empty')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {productsData?.products.slice(0, 6).map((product: any) => (
                    <div
                      key={product.id}
                      className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium">{product.name}</h4>
                        {product.category && <Badge variant="secondary">{product.category}</Badge>}
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mb-2">{product.sku}</p>
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">
                          {product.current_price
                            ? formatPrice(product.current_price)
                            : t('detail.productsTab.notAvailable')}
                        </p>
                        <p className="text-sm text-[var(--text-muted)]">
                          {t('detail.productsTab.stock', {
                            count: product.available_qty || 0,
                          })}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" className="w-full mt-3" asChild>
                        <Link to={`/app/products/${product.id}`}>
                          {t('detail.productsTab.viewDetails')}
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('detail.blockDialog.title', { name: supplier.name })}</DialogTitle>
            <DialogDescription>{t('detail.blockDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="block-reason">{t('detail.blockDialog.reasonLabel')}</Label>
            <Textarea
              id="block-reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder={t('detail.blockDialog.reasonPlaceholder')}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)}>
              {t('detail.blockDialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBlockSupplier}
              disabled={isBlocking}
              data-testid="confirm-block-supplier"
            >
              {isBlocking ? t('detail.blockDialog.blocking') : t('detail.blockDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SupplierReviewModal
        supplierId={id!}
        supplierName={supplier.name}
        open={showReviewModal}
        onOpenChange={(open) => {
          setShowReviewModal(open)
          if (!open) setEditingReview(null)
        }}
        editingReview={editingReview}
        onSuccess={() => {
          refetchMyReviews()
          refetch()
        }}
      />
    </PageShell>
  )
}
