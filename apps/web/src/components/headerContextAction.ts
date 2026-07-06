type CanFn = (permission: string) => boolean

export type HeaderContextAction = {
  href: string
  labelKey: string
  namespace: string
}

export function resolveHeaderContextAction(
  pathname: string,
  can: CanFn,
  isSupplier: boolean,
  isRestaurant: boolean
): HeaderContextAction | null {
  if (pathname === '/app/orders' || pathname.startsWith('/app/orders/')) {
    if (!isSupplier && isRestaurant && can('ORDERS_CREATE')) {
      return { href: '/app/cart', labelKey: 'page.createNewOrder', namespace: 'orders' }
    }
    return null
  }

  if (pathname === '/app/cart') {
    if (isRestaurant && can('CATALOG_VIEW')) {
      return { href: '/app/products', labelKey: 'products', namespace: 'navigation' }
    }
    return null
  }

  if (pathname === '/app/products' || pathname.startsWith('/app/products/')) {
    if (isRestaurant && can('ORDERS_CREATE')) {
      return { href: '/app/cart', labelKey: 'cart', namespace: 'navigation' }
    }
    return null
  }

  if (
    pathname === '/app/restaurant-inventory' ||
    pathname === '/app/inventory' ||
    pathname.startsWith('/app/restaurant-inventory/')
  ) {
    if (can('CATALOG_VIEW')) {
      return { href: '/app/products', labelKey: 'products', namespace: 'navigation' }
    }
    return null
  }

  if (pathname === '/app/quick-lists' || pathname.startsWith('/app/quick-lists/')) {
    if (isRestaurant && can('ORDERS_CREATE')) {
      return { href: '/app/products', labelKey: 'products', namespace: 'navigation' }
    }
    return null
  }

  return null
}
