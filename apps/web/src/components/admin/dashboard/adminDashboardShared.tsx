import { Loader2 } from 'lucide-react'
import type { SubscriptionPlan } from '../../../types'

export function dedupeAdminPlans(raw: SubscriptionPlan[] | undefined) {
  return (
    raw?.filter(
      (p, i, arr) =>
        (p.code || '').toLowerCase() !== 'enterprise' &&
        arr.findIndex(
          (x) =>
            x.code === p.code && (x.tenant_type || 'RESTAURANT') === (p.tenant_type || 'RESTAURANT')
        ) === i
    ) ?? []
  )
}

export function AdminTabLoading({ className = 'py-12' }: { className?: string }) {
  return (
    <div className={`flex justify-center text-[var(--text-muted)] ${className}`}>
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  )
}

export type AdminTabKey =
  | 'overview'
  | 'activity'
  | 'tenants'
  | 'users'
  | 'subscriptions'
  | 'plans'
  | 'finance'
  | 'usage'
  | 'features'
  | 'deals'
  | 'limits'
  | 'operations'
  | 'health'
  | 'audit'

export type AdminCanTabMap = Record<AdminTabKey, boolean>

export const ADMIN_TENANT_PAGE_SIZE = 50
