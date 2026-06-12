import { useMemo } from 'react'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { StatusBadge } from '../../ui/status-badge'
import {
  useGetAdminSubscriptionsQuery,
  useUnlockAdminSubscriptionMutation,
  useExtendAdminFreeTrialMutation,
} from '../../../services/api'
import { formatPlanDisplayName } from '../../../lib/planComparison'
import { toast } from 'sonner'
import { AdminTabLoading } from './adminDashboardShared'

export type AdminChangePlanTarget = {
  id: string
  tenant_type: 'RESTAURANT' | 'SUPPLIER'
  tenant_name?: string
}

export interface AdminSubscriptionsTabProps {
  active: boolean
  onOpenChangePlan: (sub: AdminChangePlanTarget) => void
}

export function AdminSubscriptionsTab({ active, onOpenChangePlan }: AdminSubscriptionsTabProps) {
  const { data: subscriptionsData, isLoading: subscriptionsLoading } =
    useGetAdminSubscriptionsQuery({}, { skip: !active })

  const [unlockSubscription, { isLoading: isUnlocking }] = useUnlockAdminSubscriptionMutation()
  const [extendFreeTrial, { isLoading: isExtendingTrial }] = useExtendAdminFreeTrialMutation()

  const subscriptions = useMemo(
    () =>
      subscriptionsData?.subscriptions?.filter(
        (s, i, arr) =>
          arr.findIndex((x) => x.tenant_id === s.tenant_id && x.tenant_type === s.tenant_type) === i
      ) ?? [],
    [subscriptionsData?.subscriptions]
  )

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[var(--text)]">Subscriptions</h2>
      </div>

      {subscriptionsLoading ? (
        <AdminTabLoading />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--app-border)]">
                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Tenant</th>
                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Plan</th>
                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Status</th>
                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Type</th>
                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Created</th>
                <th className="text-left py-3 px-4 font-semibold text-[var(--text)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr
                  key={sub.id}
                  className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
                >
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium text-[var(--text)]">
                        {sub.tenant_name || 'Unknown'}
                      </p>
                      <p className="text-sm text-[var(--text-muted)]">{sub.tenant_email}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="outline">
                      {formatPlanDisplayName(
                        (sub as { plan_code?: string }).plan_code,
                        sub.plan_name
                      )}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={sub.status} />
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="outline">{sub.tenant_type}</Badge>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                    {new Date(sub.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-2">
                      {(sub as { lock_reason?: string }).lock_reason === 'free_sandbox_expired' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isExtendingTrial}
                          onClick={async () => {
                            try {
                              await extendFreeTrial({ id: sub.id }).unwrap()
                              toast.success('Free Trial extended')
                            } catch {
                              toast.error('Failed to extend Free Trial')
                            }
                          }}
                        >
                          Extend trial
                        </Button>
                      )}
                      {((sub as { account_locked_at?: string; lock_reason?: string })
                        .account_locked_at ||
                        (sub as { lock_reason?: string }).lock_reason === 'pending_activation') && (
                        <Button
                          size="sm"
                          disabled={isUnlocking}
                          onClick={async () => {
                            try {
                              await unlockSubscription({
                                id: sub.id,
                                reason: 'admin_activation',
                              }).unwrap()
                              toast.success('Account activated')
                            } catch {
                              toast.error('Failed to activate account')
                            }
                          }}
                        >
                          Activate
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onOpenChangePlan({
                            id: sub.id,
                            tenant_type: sub.tenant_type,
                            tenant_name: sub.tenant_name,
                          })
                        }
                      >
                        Change plan
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
