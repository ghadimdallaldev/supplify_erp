import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import {
  useGetAdminModelComparisonMetricsQuery,
  useGetAdminSystemInfoQuery,
} from '../../services/api'
import { Loader2 } from 'lucide-react'

export function AdminModelComparisonPanel() {
  const { data: systemInfo } = useGetAdminSystemInfoQuery()
  const { data, isLoading, error } = useGetAdminModelComparisonMetricsQuery()

  const m = data?.metrics

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplify model comparison</CardTitle>
        <CardDescription>
          Aggregate counters for evaluating V2 (supplier-first) vs V1. Active deploy model:{' '}
          <strong>{systemInfo?.supplifyModelLabel ?? '—'}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
        ) : error ? (
          <p className="text-sm text-[var(--text-muted)]">Could not load comparison metrics.</p>
        ) : m ? (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <Metric label="Invites sent" value={m.supplierInvitesSent} />
            <Metric label="Invites accepted" value={m.supplierInvitesAccepted} />
            <Metric label="Accept rate %" value={m.inviteAcceptanceRate} />
            <Metric label="Buyer-only restaurants" value={m.buyerOnlyRestaurants} />
            <Metric label="Workspace upgrades" value={m.restaurantWorkspaceUpgrades} />
            <Metric label="Buyer → paid %" value={m.buyerToPaidConversionRate} />
            <Metric label="Paid after upgrade" value={m.restaurantsWithPaidPlanAfterUpgrade} />
            <Metric label="Supplier-store orders" value={m.supplierStoreOrders} />
          </dl>
        ) : null}
        <p className="text-xs text-[var(--text-muted)] mt-4">
          Future: time-series charts, per-supplier funnels, and cohort exports (see
          SUPPLIFY_MODEL_VERSIONING.md).
        </p>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
