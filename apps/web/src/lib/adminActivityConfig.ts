import { Activity, CreditCard, Package, Shield, Users, type LucideIcon } from 'lucide-react'

export type ActivityEventConfig = {
  icon: LucideIcon
  color: string
  bg: string
  label: string
}

const EVENT_CONFIG: Record<string, ActivityEventConfig> = {
  order_placed: {
    icon: Package,
    color: 'var(--brand)',
    bg: 'var(--brand-ultra)',
    label: 'Order',
  },
  order_confirmed: {
    icon: Package,
    color: 'var(--brand)',
    bg: 'var(--brand-ultra)',
    label: 'Order',
  },
  order_completed: {
    icon: Package,
    color: 'var(--mint)',
    bg: 'var(--mint-pale)',
    label: 'Order',
  },
  new_tenant: {
    icon: Users,
    color: 'var(--mint)',
    bg: 'var(--mint-pale)',
    label: 'New Tenant',
  },
  plan_changed: {
    icon: CreditCard,
    color: '#8b5cf6',
    bg: '#ede9fe',
    label: 'Plan Change',
  },
  subscription_status: {
    icon: Shield,
    color: '#f59e0b',
    bg: '#fffbeb',
    label: 'Subscription',
  },
  deal_activity: {
    icon: Activity,
    color: 'var(--brand)',
    bg: 'var(--brand-ultra)',
    label: 'Deal',
  },
}

export function getActivityEventConfig(eventType: string): ActivityEventConfig {
  return (
    EVENT_CONFIG[eventType] ?? {
      icon: Activity,
      color: 'var(--text-muted)',
      bg: 'var(--surface-mid)',
      label: eventType.replace(/_/g, ' '),
    }
  )
}
