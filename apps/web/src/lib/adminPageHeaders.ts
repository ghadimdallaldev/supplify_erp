export type AdminPageContext = 'platform' | 'suppliers' | 'restaurants' | 'settings'

export type AdminPageHeaderKeys = {
  titleKey: string
  subtitleKey: string
}

/** i18n keys under the `admin` namespace (`pageHeaders.*`). */
export function getAdminPageHeaderKeys(context: AdminPageContext): AdminPageHeaderKeys {
  switch (context) {
    case 'suppliers':
      return {
        titleKey: 'pageHeaders.suppliers.title',
        subtitleKey: 'pageHeaders.suppliers.subtitle',
      }
    case 'restaurants':
      return {
        titleKey: 'pageHeaders.restaurants.title',
        subtitleKey: 'pageHeaders.restaurants.subtitle',
      }
    case 'settings':
      return {
        titleKey: 'pageHeaders.settings.title',
        subtitleKey: 'pageHeaders.settings.subtitle',
      }
    default:
      return {
        titleKey: 'pageHeaders.platform.title',
        subtitleKey: 'pageHeaders.platform.subtitle',
      }
  }
}

/** @deprecated Prefer getAdminPageHeaderKeys + t(). Kept for tests / English fallback. */
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
