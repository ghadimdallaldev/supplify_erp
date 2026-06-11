import { Loader2 } from 'lucide-react'

/** Unwired tabs hidden for demo — re-enable when backend exists. */
export const CONTACTS_TAB_ENABLED = false
export const DELIVERY_ZONES_ENABLED = false

export const SUPPLIER_SETTINGS_URL_TABS = [
  'profile',
  'business',
  'warehouses',
  'notifications',
  'plan',
  'team',
  'drivers',
  'branches',
  'activity',
] as const

export type SupplierSettingsTabKey = (typeof SUPPLIER_SETTINGS_URL_TABS)[number]

export const SUPPLIER_NOTIFICATION_DEFAULTS = {
  emailEnabled: true,
  whatsappEnabled: false,
  inAppEnabled: true,
  notifyOrderNew: true,
  notifyMessageReceived: true,
  notifyInvoiceIssued: true,
  notifyLowStock: true,
} as const

export type SupplierNotificationPrefs = typeof SUPPLIER_NOTIFICATION_DEFAULTS

export const SUPPLIER_NOTIFICATION_FIELDS: Array<{
  key: keyof SupplierNotificationPrefs
  label: string
  description: string
}> = [
  {
    key: 'emailEnabled',
    label: 'Email notifications',
    description: 'Receive important updates via email.',
  },
  {
    key: 'whatsappEnabled',
    label: 'WhatsApp notifications',
    description: 'Get alerts on WhatsApp when your phone is on file.',
  },
  {
    key: 'inAppEnabled',
    label: 'In-app notifications',
    description: 'Show alerts inside Supplify.',
  },
  {
    key: 'notifyOrderNew',
    label: 'New orders',
    description: 'Be notified when restaurants place orders.',
  },
  {
    key: 'notifyMessageReceived',
    label: 'Chat messages',
    description: 'Receive pings for new chat messages.',
  },
  { key: 'notifyInvoiceIssued', label: 'Invoices', description: 'Invoice and payment reminders.' },
  { key: 'notifyLowStock', label: 'Low stock', description: 'Warehouse low stock warnings.' },
]

export function SupplierSettingsTabLoading({ className = 'py-12' }: { className?: string }) {
  return (
    <div className={`flex justify-center text-[var(--text-muted)] ${className}`}>
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  )
}
