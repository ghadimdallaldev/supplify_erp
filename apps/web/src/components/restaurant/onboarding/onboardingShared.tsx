import { Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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

export function OnboardingTabLoading({ className = 'py-12' }: { className?: string }) {
  return (
    <div className={`flex justify-center text-[var(--text-muted)] ${className}`}>
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  )
}
