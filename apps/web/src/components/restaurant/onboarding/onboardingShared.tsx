import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Switch } from '../../ui/switch'
import { Skeleton } from '../../ui/skeleton'
import {
  Mail,
  MessageCircle,
  Bell,
  ShoppingCart,
  FileText,
  AlertCircle,
  Clock,
  Calendar,
  Users,
  Package,
} from 'lucide-react'

export const DEFAULT_NOTIFICATION_PREFS = {
  emailEnabled: true,
  whatsappEnabled: false,
  inAppEnabled: true,
  notifyOrderNew: true,
  notifyMessageReceived: true,
  notifyInvoiceIssued: true,
  notifyLowStock: true,
  notifyReservationCreated: true,
  notifyReservationWaitlist: true,
  notifyStaffPto: true,
  notifyStaffSwap: true,
  notifyScheduledOrder: true,
  notifyReorderCadence: true,
}

export interface PreferenceField {
  key: keyof typeof DEFAULT_NOTIFICATION_PREFS
  label: string
  description: string
  icon: LucideIcon
}

export const CHANNEL_FIELDS: PreferenceField[] = [
  {
    key: 'emailEnabled',
    label: 'Email',
    description: 'Receive important alerts via email',
    icon: Mail,
  },
  {
    key: 'whatsappEnabled',
    label: 'WhatsApp',
    description: 'Receive alerts on WhatsApp (phone required in profile)',
    icon: MessageCircle,
  },
  { key: 'inAppEnabled', label: 'In-app', description: 'Show alerts inside Supplify', icon: Bell },
]

export const CATEGORY_FIELDS: PreferenceField[] = [
  {
    key: 'notifyOrderNew',
    label: 'Order updates',
    description: 'New orders and status changes',
    icon: ShoppingCart,
  },
  {
    key: 'notifyMessageReceived',
    label: 'Supplier messages',
    description: 'Chat and inbox notifications',
    icon: Mail,
  },
  {
    key: 'notifyInvoiceIssued',
    label: 'Invoice reminders',
    description: 'Issued and overdue invoices',
    icon: FileText,
  },
  {
    key: 'notifyLowStock',
    label: 'Low stock alerts',
    description: 'Inventory thresholds reached',
    icon: AlertCircle,
  },
  {
    key: 'notifyReorderCadence',
    label: 'Reorder reminders',
    description: 'Suggested reorders based on your ordering patterns',
    icon: Clock,
  },
  {
    key: 'notifyReservationCreated',
    label: 'New reservations',
    description: 'Reservations booked by guests or staff',
    icon: Calendar,
  },
  {
    key: 'notifyReservationWaitlist',
    label: 'Waitlist changes',
    description: 'Guests added or moved on waitlist',
    icon: Clock,
  },
  {
    key: 'notifyStaffPto',
    label: 'PTO requests',
    description: 'Team time-off submissions awaiting review',
    icon: Users,
  },
  {
    key: 'notifyStaffSwap',
    label: 'Shift swap requests',
    description: 'Coverage and swap approvals',
    icon: Users,
  },
  {
    key: 'notifyScheduledOrder',
    label: 'Scheduled orders',
    description: 'Recurring orders executing automatically',
    icon: Package,
  },
]

export type RestaurantOnboardingTabKey =
  | 'profile'
  | 'team'
  | 'branches'
  | 'subscription'
  | 'notifications'
  | 'activity'
  | 'reviews'

export const RESTAURANT_ONBOARDING_TABS: RestaurantOnboardingTabKey[] = [
  'profile',
  'team',
  'branches',
  'subscription',
  'notifications',
  'activity',
  'reviews',
]

export function OnboardingTabLoading({ className = 'py-8' }: { className?: string }) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)] ${className}`}
    >
      <div className="divide-y divide-[var(--app-border)]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 px-4 py-4 sm:px-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-10 w-full max-w-md" />
          </div>
        ))}
      </div>
    </section>
  )
}

export function RestaurantSettingsSummary({
  totalOrders,
  completedOrders,
  pendingOrders,
  totalSpent,
}: {
  totalOrders: number
  completedOrders: number
  pendingOrders: number
  totalSpent: string
}) {
  return (
    <section
      data-testid="restaurant-settings-summary"
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-4 py-3"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="text-xs text-[var(--text-mid)]">Total orders</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--text)]">
            {totalOrders}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-mid)]">Completed</p>
          <p className="mt-0.5 font-medium tabular-nums text-[var(--mint)]">{completedOrders}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-mid)]">In progress</p>
          <p className="mt-0.5 font-medium tabular-nums text-[var(--text)]">{pendingOrders}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-mid)]">Total spent</p>
          <p className="mt-0.5 font-medium tabular-nums text-[var(--text)]">{totalSpent}</p>
        </div>
      </div>
    </section>
  )
}

export function SettingsSection({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-[var(--text-mid)]">{description}</p>
        ) : null}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
      {footer ? (
        <div className="border-t border-[var(--app-border)] px-4 py-3 sm:px-5">{footer}</div>
      ) : null}
    </section>
  )
}

export function PreferenceToggleRow({
  label,
  description,
  icon: Icon,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string
  description: string
  icon: LucideIcon
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--brand-ultra)]/50 sm:px-5">
      <div className="flex min-w-0 gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-mid)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text)]">{label}</p>
          <p className="mt-0.5 text-xs text-[var(--text-mid)]">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  )
}
