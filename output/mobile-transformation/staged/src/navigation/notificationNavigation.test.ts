import {
  resolveNotificationTarget,
  navigationRef,
  openNotificationTarget,
  flushPendingNotificationTarget,
} from './notificationNavigation'
import { invalidateRequestScope } from '../features/auth/requestScope'
import type { User } from '../types/supplify'

const user = (role: User['role']): User => ({
  id: 'u1',
  email: 'u@test.com',
  displayName: 'User',
  role,
})

describe('resolveNotificationTarget', () => {
  it('discards a queued notification after changing accounts or workspaces', () => {
    const ready = jest.spyOn(navigationRef, 'isReady').mockReturnValue(false)
    const navigate = jest.spyOn(navigationRef, 'navigate').mockImplementation(() => {})
    openNotificationTarget({
      screen: 'OrderDetail',
      params: { orderId: 'old-order' },
    })
    invalidateRequestScope()
    ready.mockReturnValue(true)
    flushPendingNotificationTarget()
    expect(navigate).not.toHaveBeenCalled()
    ready.mockRestore()
    navigate.mockRestore()
  })
  it('opens order details', () => {
    expect(
      resolveNotificationTarget(user('RESTAURANT'), {
        reference_type: 'ORDER',
        reference_id: 'o1',
      })
    ).toEqual({ screen: 'OrderDetail', params: { orderId: 'o1' } })
  })

  it('routes registered consumer order notifications to the consumer order detail', () => {
    expect(
      resolveNotificationTarget(user('CONSUMER'), {
        reference_type: 'ORDER',
        reference_id: 'consumer-order-1',
        metadata: { ctaUrl: '/shop/orders/consumer-order-1' },
      })
    ).toEqual({
      screen: 'ConsumerOrderDetail',
      params: { orderId: 'consumer-order-1' },
    })
  })

  it('uses role-specific quote destinations', () => {
    expect(
      resolveNotificationTarget(user('SUPPLIER'), {
        metadata: { ctaUrl: '/app/quote-requests/supplier/qrs1' },
      })
    ).toEqual({
      screen: 'QuoteResponse',
      params: { quoteRequestSupplierId: 'qrs1' },
    })
    expect(
      resolveNotificationTarget(user('RESTAURANT'), {
        metadata: { ctaUrl: '/app/quote-requests/qr1' },
      })
    ).toEqual({
      screen: 'QuoteRequestDetail',
      params: { quoteRequestId: 'qr1' },
    })
  })

  it('opens a chat thread from native push payload fields', () => {
    expect(
      resolveNotificationTarget(user('SUPPLIER'), {
        notification_type: 'MESSAGE',
        reference_type: 'CONVERSATION',
        reference_id: 'conv-1',
      })
    ).toEqual({ screen: 'ChatThread', params: { conversationId: 'conv-1' } })
  })
  it('opens mobile plan details for current and legacy billing alerts', () => {
    expect(resolveNotificationTarget(user('RESTAURANT'), { type: 'SUBSCRIPTION' })).toEqual({
      screen: 'Subscription',
    })
    expect(
      resolveNotificationTarget(user('SUPPLIER'), {
        metadata: { ctaUrl: '/app/settings?tab=subscription' },
      })
    ).toEqual({ screen: 'Subscription' })
  })
})
