import { Link, Navigate, useParams } from 'react-router-dom'
import { useConsumerAuth } from '../../contexts/ConsumerAuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { ArrowLeft, Gift, LogOut } from 'lucide-react'
import { toast } from 'react-hot-toast'

function formatLedgerType(type: string) {
  switch (type) {
    case 'EARN':
      return 'Earned'
    case 'REDEEM':
      return 'Redeemed'
    case 'ADJUST':
      return 'Adjustment'
    default:
      return type
  }
}

export function ConsumerRewardsPage() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>()
  const slug = restaurantSlug ?? ''
  const { isAuthenticated, isLoading, member, loyaltyPoints, recentLedger, logout } =
    useConsumerAuth()

  if (!isLoading && !isAuthenticated) {
    return <Navigate to={`/order/${slug}/account`} replace />
  }

  const handleLogout = async () => {
    try {
      await logout()
      toast.success('Signed out')
    } catch {
      toast.error('Unable to sign out')
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/order/${slug}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        {isAuthenticated && (
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1 h-4 w-4" />
            Sign out
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gift className="h-5 w-5 text-primary" />
                My rewards
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{loyaltyPoints} pts</p>
              {member?.displayName && (
                <p className="mt-1 text-sm text-muted-foreground">Hi, {member.displayName}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!recentLedger.length && (
                <p className="text-sm text-muted-foreground">
                  No activity yet. Place an order to start earning points.
                </p>
              )}
              {recentLedger.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">{formatLedgerType(entry.entry_type)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={entry.points_delta >= 0 ? 'default' : 'secondary'}>
                      {entry.points_delta >= 0 ? '+' : ''}
                      {entry.points_delta} pts
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Balance {entry.balance_after}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button asChild className="w-full">
            <Link to={`/order/${slug}/menu`}>Order now</Link>
          </Button>
        </>
      )}
    </div>
  )
}

export default ConsumerRewardsPage
