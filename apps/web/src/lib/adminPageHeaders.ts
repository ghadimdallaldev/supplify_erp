export type AdminPageContext = 'platform' | 'suppliers' | 'restaurants' | 'settings'

export function getAdminPageHeader(context: AdminPageContext): {
  title: string
  subtitle: string
} {
  switch (context) {
    case 'suppliers':
      return {
        title: 'Supplier Control Center',
        subtitle:
          'Manage supplier accounts, quotas, products, warehouses, fulfillment, and billing.',
      }
    case 'restaurants':
      return {
        title: 'Restaurant Control Center',
        subtitle:
          'Manage restaurant accounts, subscriptions, ordering limits, usage, and activity.',
      }
    case 'settings':
      return {
        title: 'Account Settings',
        subtitle: 'Manage your profile, security, notifications, and admin preferences.',
      }
    default:
      return {
        title: 'Platform Command Center',
        subtitle:
          'Monitor tenants, subscriptions, usage, operations, and system health from one place.',
      }
  }
}
