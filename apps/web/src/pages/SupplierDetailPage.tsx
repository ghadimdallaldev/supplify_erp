import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useGetSupplierQuery,
  useGetProductsQuery,
  useCreateConversationMutation,
  useGetRestaurantsQuery,
  useFollowSupplierMutation,
  useUnfollowSupplierMutation,
  useGetSupplierStatisticsQuery,
  useGetSupplierReviewsQuery,
  useGetSupplierRatingSummaryQuery,
  useCreateSupplierReviewMutation,
  useGetEntitlementsQuery,
} from '../services/api'
import { featureEnabled } from '../lib/planLimits'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
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
  Award,
  CheckCircle,
  Star,
} from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { formatCurrency, formatPrice } from '../utils/format'

export function SupplierDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const isRestaurant = user?.role === 'RESTAURANT'
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !isRestaurant })
  const reviewsWriteEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.supplier_reviews
  )

  const { data, isLoading, error, refetch } = useGetSupplierQuery(id!)
  const { data: restaurantsData } = useGetRestaurantsQuery()
  const [createConversation, { isLoading: isCreatingConversation }] =
    useCreateConversationMutation()
  const [followSupplier, { isLoading: isFollowing }] = useFollowSupplierMutation()
  const [unfollowSupplier, { isLoading: isUnfollowing }] = useUnfollowSupplierMutation()

  // Fetch products for this supplier
  const { data: productsData, isLoading: isLoadingProducts } = useGetProductsQuery({
    supplier: id,
    limit: 50,
    offset: 0,
  })

  // Fetch supplier statistics (for restaurants viewing suppliers)
  const { data: statsData, isLoading: isLoadingStats } = useGetSupplierStatisticsQuery(id!, {
    skip: !isRestaurant || !id,
  })
  const { data: reviewsData } = useGetSupplierReviewsQuery(
    { supplierId: id!, limit: 20 },
    { skip: !id }
  )
  const { data: ratingSummaryData } = useGetSupplierRatingSummaryQuery(id!, { skip: !id })
  const [createReview, { isLoading: submittingReview }] = useCreateSupplierReviewMutation()
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewForm, setReviewForm] = useState({
    orderId: '',
    overallRating: 5,
    comment: '',
  })

  const stats = statsData || null
  const ratingSummary = ratingSummaryData?.summary as Record<string, unknown> | undefined

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
      </div>
    )
  }

  if (error || !data?.supplier) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)]">Failed to load supplier</p>
      </div>
    )
  }

  const supplier = data.supplier

  const handleSendMessage = async () => {
    if (!user || !id) {
      toast.error('User or supplier ID missing')
      return
    }

    try {
      // Create or get conversation
      // The backend will automatically get the restaurant ID based on the logged-in user's email
      const result = await createConversation({
        supplierId: id,
      }).unwrap()

      toast.success('Opening conversation...')
      navigate(`/app/chat?conversation=${result.conversation.id}`)
    } catch (error: any) {
      console.error('Create conversation error:', error)
      toast.error(error?.data?.error?.message || 'Failed to start conversation')
    }
  }

  const handleFollowToggle = async () => {
    if (!id) return

    const isFollowed = supplier.is_followed

    try {
      if (isFollowed) {
        await unfollowSupplier(id).unwrap()
        toast.success('Supplier unfollowed')
      } else {
        await followSupplier(id).unwrap()
        toast.success('Supplier followed')
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update follow status')
    }
    refetch()
  }

  return (
    <div className="space-y-6">
      {/* Header with Logo */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
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
          <div>
            <h1 className="text-[21px] font-black text-[var(--text)]">{supplier.name}</h1>
            <p className="text-[var(--text-muted)] mt-1">{supplier.slug}</p>
            {ratingSummary?.avg_rating != null && Number(ratingSummary.avg_rating) > 0 ? (
              <p className="flex items-center gap-1 text-sm text-amber-600 mt-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${i < Math.round(Number(ratingSummary.avg_rating)) ? 'fill-amber-400' : 'text-amber-200'}`}
                  />
                ))}
                <span>
                  {Number(ratingSummary.avg_rating).toFixed(1)} (
                  {String(ratingSummary.review_count ?? 0)} reviews)
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
        <div className="flex space-x-2">
          {isRestaurant && (
            <>
              <Button
                variant={supplier.is_followed ? 'default' : 'outline'}
                onClick={handleFollowToggle}
                disabled={isFollowing || isUnfollowing}
              >
                <Heart className={`h-4 w-4 mr-2 ${supplier.is_followed ? 'fill-current' : ''}`} />
                {supplier.is_followed ? 'Following' : 'Follow'}
              </Button>
              <Button
                variant="outline"
                onClick={handleSendMessage}
                disabled={isCreatingConversation}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                {isCreatingConversation ? 'Opening...' : 'Message'}
              </Button>
            </>
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
                  <p className="text-sm font-medium text-[var(--text-muted)]">Total Orders</p>
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
                  <p className="text-sm font-medium text-[var(--text-muted)]">Total Spent</p>
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
                  <p className="text-sm font-medium text-[var(--text-muted)]">Avg Order Value</p>
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
                  <p className="text-sm font-medium text-[var(--text-muted)]">Products Available</p>
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
              Contact Information
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
            {supplier.address_json && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
                <div>
                  {supplier.address_json.street && (
                    <p className="text-[var(--text-mid)]">{supplier.address_json.street}</p>
                  )}
                  <p className="text-[var(--text-mid)]">
                    {supplier.address_json.city}, {supplier.address_json.country}
                  </p>
                </div>
              </div>
            )}
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
              Business Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {supplier.legal_name && (
              <div>
                <p className="text-sm text-[var(--text-muted)]">Legal Name</p>
                <p className="font-medium">{supplier.legal_name}</p>
              </div>
            )}
            {supplier.vat_no && (
              <div>
                <p className="text-sm text-[var(--text-muted)]">VAT Number</p>
                <p className="font-medium">{supplier.vat_no}</p>
              </div>
            )}
            {supplier.trade_license_no && (
              <div>
                <p className="text-sm text-[var(--text-muted)]">Trade License</p>
                <p className="font-medium">{supplier.trade_license_no}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-[var(--text-muted)]">Member Since</p>
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
              Products & Pricing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-3xl font-bold">{supplier.product_count || 0}</p>
              <p className="text-sm text-[var(--text-muted)]">Total products available</p>
            </div>
            {supplier.avg_price > 0 && (
              <div>
                <p className="text-2xl font-bold text-[var(--mint)]">
                  {formatPrice(supplier.avg_price)}
                </p>
                <p className="text-sm text-[var(--text-muted)]">Average product price</p>
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
              View All Products
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/app/chat?supplier=${supplier.id}`}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Send Message
            </Link>
          </Button>
        </div>
      )}

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
        </TabsList>
        <TabsContent value="reviews">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Supplier reviews</CardTitle>
              {isRestaurant && reviewsWriteEnabled && (
                <Button size="sm" onClick={() => setShowReviewModal(true)}>
                  Write review
                </Button>
              )}
              {isRestaurant && !reviewsWriteEnabled && (
                <p className="text-xs text-[var(--text-muted)]">
                  Upgrade your plan to write supplier reviews.
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {(reviewsData?.reviews || []).length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No reviews yet.</p>
              ) : (
                (reviewsData?.reviews || []).map((r: Record<string, unknown>) => (
                  <div key={String(r.id)} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center gap-1 text-amber-600">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3.5 w-3.5 ${i < Number(r.overall_rating || 0) ? 'fill-amber-400' : 'text-amber-200'}`}
                        />
                      ))}
                    </div>
                    {r.comment ? <p className="mt-2">{String(r.comment)}</p> : null}
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {r.created_at ? new Date(String(r.created_at)).toLocaleDateString() : ''}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Package className="h-5 w-5" />
                <span>Products ({productsData?.products.length || 0})</span>
              </CardTitle>
              <CardDescription>Browse products from this supplier</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingProducts ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand)]"></div>
                </div>
              ) : productsData?.products.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-4" />
                  <p className="text-[var(--text-muted)]">
                    No products available from this supplier
                  </p>
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
                          {product.current_price ? formatPrice(product.current_price) : 'N/A'}
                        </p>
                        <p className="text-sm text-[var(--text-muted)]">
                          Stock: {product.available_qty || 0}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" className="w-full mt-3" asChild>
                        <Link to={`/app/products/${product.id}`}>View Details</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review {supplier.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Order ID (completed order)</Label>
              <Input
                value={reviewForm.orderId}
                onChange={(e) => setReviewForm((f) => ({ ...f, orderId: e.target.value }))}
              />
            </div>
            <div>
              <Label>Rating</Label>
              <select
                className="w-full h-10 border rounded-md px-3"
                value={reviewForm.overallRating}
                onChange={(e) =>
                  setReviewForm((f) => ({ ...f, overallRating: Number(e.target.value) }))
                }
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} stars
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Comment</Label>
              <Textarea
                value={reviewForm.comment}
                onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={submittingReview}
              onClick={async () => {
                if (!reviewForm.orderId) {
                  toast.error('Order ID required')
                  return
                }
                try {
                  await createReview({
                    supplierId: id!,
                    body: {
                      orderId: reviewForm.orderId,
                      overallRating: reviewForm.overallRating,
                      comment: reviewForm.comment || null,
                    },
                  }).unwrap()
                  toast.success('Review submitted')
                  setShowReviewModal(false)
                } catch (e: unknown) {
                  const err = e as { data?: { error?: { message?: string } } }
                  toast.error(err?.data?.error?.message || 'Failed to submit review')
                }
              }}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
