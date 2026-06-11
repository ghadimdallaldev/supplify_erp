import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { RequirePermission } from '../../components/RequirePermission'

/**
 * Supplier B2B loyalty program configuration (Track D1 stub).
 * Wire to GET/PUT /api/loyalty/supplier/program and balance endpoints.
 */
export function LoyaltyProgramPage() {
  return (
    <RequirePermission permission="CATALOG_VIEW">
      <div className="space-y-6">
        <PageHeader
          title="Loyalty Program"
          description="Reward restaurant customers with points on received orders and let them redeem at checkout."
        />
        <Card>
          <CardHeader>
            <CardTitle>Program settings</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Configure earn rate, redeem value, minimum redemption, and per-order caps. Full UI
            coming soon — API available at <code>/api/loyalty/supplier/program</code>.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Restaurant balances</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            View points earned and redeemed by each restaurant partner via{' '}
            <code>/api/loyalty/supplier/balances</code>.
          </CardContent>
        </Card>
      </div>
    </RequirePermission>
  )
}
