import { Loader2 } from 'lucide-react'

/** Unwired tabs hidden for demo — re-enable when backend exists. */
export const CONTACTS_TAB_ENABLED = true
export const DELIVERY_ZONES_ENABLED = true

export const SUPPLIER_SETTINGS_URL_TABS = [
  'profile',
  'contacts',
  'business',
  'warehouses',
  'delivery',
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

export const SUPPLIER_NOTIFICATION_FIELD_KEYS: Array<keyof SupplierNotificationPrefs> = [
  'emailEnabled',
  'whatsappEnabled',
  'inAppEnabled',
  'notifyOrderNew',
  'notifyMessageReceived',
  'notifyInvoiceIssued',
  'notifyLowStock',
]

export function SupplierSettingsTabLoading({ className = 'py-12' }: { className?: string }) {
  return (
    <div className={`flex justify-center text-[var(--text-muted)] ${className}`}>
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  )
}
