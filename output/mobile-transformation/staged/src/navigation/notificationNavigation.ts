import { createNavigationContainerRef } from '@react-navigation/native'
import { resolveAppRoleNav } from '../hooks/usePermissions'
import type { User, NotificationItem } from '../types/supplify'
import { getRequestScopeVersion } from '../features/auth/requestScope'

type Target = { screen: string; params?: Record<string, unknown> }

export const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>()
let pendingTarget: { target: Target; scope: number } | null = null

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function resolveNotificationTarget(
  user: User | null,
  notification: Partial<NotificationItem> & Record<string, unknown>
): Target | null {
  const metadata = (
    notification.metadata && typeof notification.metadata === 'object' ? notification.metadata : {}
  ) as Record<string, unknown>
  const referenceType =
    text(notification.reference_type)?.toUpperCase() ??
    text(notification.type)?.toUpperCase() ??
    text(metadata.referenceType)?.toUpperCase()
  const referenceId =
    text(notification.reference_id) ??
    text(metadata.referenceId) ??
    text(metadata.orderId) ??
    text(metadata.order_id)
  const url = text(metadata.ctaUrl) ?? text(metadata.link) ?? text(notification.url)

  const orderMatch = url?.match(/\/(?:app\/orders|shop\/orders)\/([^/?#]+)/)
  if (referenceType === 'ORDER' || orderMatch) {
    const orderId = referenceId ?? orderMatch?.[1]
    if (user?.role === 'CONSUMER') {
      return orderId
        ? { screen: 'ConsumerOrderDetail', params: { orderId } }
        : { screen: 'Tabs', params: { screen: 'Orders' } }
    }
    if (resolveAppRoleNav(user) === 'driver') {
      return orderId
        ? {
            screen: 'Tabs',
            params: {
              screen: 'Deliveries',
              params: { screen: 'DriverStop', params: { orderId } },
            },
          }
        : { screen: 'Tabs', params: { screen: 'Deliveries' } }
    }
    return orderId
      ? { screen: 'OrderDetail', params: { orderId } }
      : { screen: 'Tabs', params: { screen: 'Orders' } }
  }

  const quoteSupplierMatch = url?.match(/\/app\/quote-requests\/supplier\/([^/?#]+)/)
  const quoteRestaurantMatch = url?.match(/\/app\/quote-requests\/([^/?#]+)/)
  if (referenceType === 'QUOTE_REQUEST' || url?.includes('/app/quote-requests')) {
    if (user?.role === 'SUPPLIER') {
      const quoteRequestSupplierId = quoteSupplierMatch?.[1] ?? referenceId
      return quoteRequestSupplierId
        ? { screen: 'QuoteResponse', params: { quoteRequestSupplierId } }
        : { screen: 'QuoteInbox' }
    }
    const quoteRequestId = quoteRestaurantMatch?.[1] ?? referenceId
    return quoteRequestId
      ? { screen: 'QuoteRequestDetail', params: { quoteRequestId } }
      : { screen: 'QuoteRequests' }
  }

  if (referenceType === 'DISPUTE' || url?.includes('/app/disputes')) {
    const disputeId = referenceId ?? url?.match(/\/app\/disputes\/([^/?#]+)/)?.[1]
    if (disputeId) {
      return { screen: 'DisputeDetail', params: { disputeId } }
    }
    return {
      screen: user?.role === 'SUPPLIER' ? 'IncomingDisputes' : 'Disputes',
    }
  }
  if (referenceType === 'INVOICE' || url?.includes('/app/invoices')) {
    return { screen: user?.role === 'SUPPLIER' ? 'Receivables' : 'Invoices' }
  }
  if (
    referenceType === 'CHAT' ||
    referenceType === 'CONVERSATION' ||
    referenceType === 'MESSAGE' ||
    url?.includes('/app/chat')
  ) {
    const conversationId =
      referenceId ??
      text(metadata.conversationId) ??
      text(metadata.conversation_id) ??
      url?.match(/\/app\/chat\/([^/?#]+)/)?.[1]
    return conversationId
      ? { screen: 'ChatThread', params: { conversationId } }
      : { screen: 'Tabs', params: { screen: 'Chat' } }
  }
  if (referenceType === 'QUICK_LIST' || url?.includes('/app/quick-lists')) {
    return { screen: 'QuickLists' }
  }
  if (referenceType === 'DEAL' || url?.includes('/app/deals')) {
    return { screen: 'Deals' }
  }
  if (
    referenceType === 'SUBSCRIPTION' ||
    referenceType === 'BILLING' ||
    (url?.includes('/app/settings') &&
      (url.includes('tab=subscription') || url.includes('tab=plan')))
  ) {
    return { screen: 'Subscription' }
  }
  if (referenceType === 'RESERVATION' || url?.includes('/app/reservations')) {
    return { screen: 'Reservations' }
  }
  return null
}

export function openNotificationTarget(target: Target | null): boolean {
  if (!target) return false
  if (!navigationRef.isReady()) {
    pendingTarget = { target, scope: getRequestScopeVersion() }
    return false
  }
  navigationRef.navigate(target.screen, target.params)
  return true
}

export function flushPendingNotificationTarget() {
  if (!pendingTarget || !navigationRef.isReady()) return
  const { target, scope } = pendingTarget
  pendingTarget = null
  if (scope !== getRequestScopeVersion()) return
  navigationRef.navigate(target.screen, target.params)
}
