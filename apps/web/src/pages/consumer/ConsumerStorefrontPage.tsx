import { Link, useParams } from 'react-router-dom'
import { useGetPublicConsumerRestaurantQuery } from '../../services/consumerApi'
import { useConsumerAuth } from '../../contexts/ConsumerAuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { UtensilsCrossed, ShoppingBag, Gift } from 'lucide-react'

function ConsumerStoreHeader({ slug }: { slug: string }) {
  const { isAuthenticated, isLoading } = useConsumerAuth()

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b pb-4">
      {isLoading ? (
        <Skeleton className="h-9 w-48" />
      ) : isAuthenticated ? (
        <Button asChild variant="outline" size="sm">
          <Link to={`/order/${slug}/rewards`}>
            <Gift className="mr-1 h-4 w-4" />
            My rewards
          </Link>
        </Button>
      ) : (
        <>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/order/${slug}/account`}>Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to={`/order/${slug}/account`}>Sign up for rewards</Link>
          </Button>
        </>
      )}
    </div>
  )
}

export function ConsumerStorefrontPage() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>()
  const slug = restaurantSlug ?? ''

  const {
    data: restaurant,
    isLoading,
    isError,
  } = useGetPublicConsumerRestaurantQuery(slug, {
    skip: !slug,
  })

  if (!slug) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center text-muted-foreground">
        Restaurant slug is required.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (isError || !restaurant) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <p className="text-muted-foreground">Restaurant not found.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <ConsumerStoreHeader slug={slug} />

      <div className="text-center">
        <UtensilsCrossed className="mx-auto mb-3 h-10 w-10 text-primary" />
        <h1 className="text-3xl font-semibold tracking-tight">{restaurant.name}</h1>
        <p className="mt-2 text-muted-foreground">
          Order online for delivery, takeaway, or dine-in.
        </p>
      </div>

      <Card className="border-amber-200/60 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/30">
        <CardContent className="flex items-start gap-3 pt-6">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-950 dark:text-amber-100">
              Earn rewards on every order
            </p>
            <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
              Create a free account to collect points on food subtotals. Delivery orders earn bonus
              multipliers — redeem points at checkout.
            </p>
            <Button
              asChild
              variant="link"
              className="mt-1 h-auto p-0 text-amber-900 dark:text-amber-300"
            >
              <Link to={`/order/${slug}/account`}>Join rewards →</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Browse our menu and checkout in a few taps.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="flex-1">
            <Link to={`/order/${slug}/menu`}>
              <ShoppingBag className="mr-2 h-4 w-4" />
              View menu
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link to={`/order/${slug}/checkout`}>Go to checkout</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default ConsumerStorefrontPage
