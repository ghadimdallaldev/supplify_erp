import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import {
  useGetAdminModelComparisonMetricsQuery,
  useGetAdminSystemInfoQuery,
} from '../../services/api'
import { getSupplifyModelVersion } from '../../config/supplifyModel'
import { Loader2, AlertTriangle } from 'lucide-react'

export function AdminModelComparisonPanel() {
  const { data: systemInfo } = useGetAdminSystemInfoQuery()
  const { data, isLoading, error } = useGetAdminModelComparisonMetricsQuery()

  const m = data?.metrics
  const webModel = getSupplifyModelVersion()
  const apiModel = systemInfo?.supplifyModelVersion
  const modelMismatch = Boolean(apiModel && apiModel !== webModel)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplify model comparison</CardTitle>
        <CardDescription>
          Aggregate counters for evaluating V2 (supplier-first) vs V1. API model:{' '}
          <strong>{systemInfo?.supplifyModelLabel ?? '—'}</strong>
          {apiModel ? (
            <>
              {' '}
              · Web build:{' '}
              <strong>{webModel === 'v2' ? 'V2 (Supplier-first)' : 'V1 (Marketplace)'}</strong>
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {modelMismatch ? (
          <div
            role="alert"
            className="mb-4 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <p>
              Model version mismatch: API is <strong>{apiModel}</strong> but this web build is{' '}
              <strong>{webModel}</strong>. Set <code>SUPPLIFY_MODEL_VERSION</code> and{' '}
              <code>VITE_SUPPLIFY_MODEL_VERSION</code> to the same value and redeploy both services.
            </p>
          </div>
        ) : null}
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
