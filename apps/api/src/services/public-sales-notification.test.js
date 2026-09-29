import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  notifyTenantUsers: vi.fn(),
  sendNotification: vi.fn(),
  sendTemplateEmail: vi.fn(),
  sendWhatsAppMessage: vi.fn(),
  isWhatsAppConfigured: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({ query: vi.fn() }))
vi.mock('../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../i18n/index.js', () => ({
  t: (key) => key,
  resolveLocale: (locale) => locale || 'en',
  resolveUserLocale: vi.fn(() => 'en'),
  DEFAULT_LOCALE: 'en',
  fetchUserLocales: vi.fn(async () => new Map()),
}))
vi.mock('./email/email.service.js', () => ({
  sendTemplateEmail: (...args) => mocks.sendTemplateEmail(...args),
}))
vi.mock('./whatsapp.service.js', () => ({
  isWhatsAppConfigured: (...args) => mocks.isWhatsAppConfigured(...args),
  sendWhatsAppMessage: (...args) => mocks.sendWhatsAppMessage(...args),
}))
vi.mock('../lib/subscription/plans.js', () => ({ getUpgradePathForTenant: vi.fn() }))
vi.mock('./notification/in-app.js', () => ({
  notifyTenantUsers: (...args) => mocks.notifyTenantUsers(...args),
  sendNotification: (...args) => mocks.sendNotification(...args),
  listTenantUserIds: vi.fn(async () => []),
}))
vi.mock('../lib/socket.js', () => ({ getIO: vi.fn(() => null) }))
vi.mock('../lib/cache.js', () => ({ getRedisClient: vi.fn(() => null) }))

import { notifyOrderStatusChange } from './notification/templates.js'

describe('public order notification routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.notifyTenantUsers.mockResolvedValue([])
    mocks.sendNotification.mockResolvedValue({})
    mocks.sendTemplateEmail.mockResolvedValue({ sent: true })
    mocks.sendWhatsAppMessage.mockResolvedValue({ sent: true })
    mocks.isWhatsAppConfigured.mockReturnValue(false)
  })

  it('notifies supplier users and the registered consumer when an order is placed', async () => {
    await notifyOrderStatusChange(
      {
        id: 'order-1',
        supplier_id: 'supplier-1',
        customer_type: 'CONSUMER',
        consumer_user_id: 'consumer-1',
        total_amount: 25,
      },
      'PLACED'
    )
    expect(mocks.notifyTenantUsers).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'supplier-1', tenantType: 'SUPPLIER' })
    )
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'consumer-1',
        userType: 'CONSUMER',
        metadata: expect.objectContaining({ ctaUrl: '/shop/orders/order-1' }),
      })
    )
  })

  it('emails consenting guest status updates without leaking the contact snapshot to metadata', async () => {
    await notifyOrderStatusChange(
      {
        id: 'order-2',
        supplier_id: 'supplier-1',
        supplier_name: 'Supplier',
        customer_type: 'GUEST',
        total_amount: 25,
        customer_contact_snapshot: {
          name: 'Guest',
          email: 'guest@example.com',
          phone: '+96170000000',
          whatsappConsent: true,
        },
      },
      'ACKNOWLEDGED'
    )
    expect(mocks.sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'guest@example.com',
        template: 'order.acknowledged',
        sensitive: true,
      })
    )
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('uses the configured WhatsApp provider only with explicit consent and redacted logging', async () => {
    mocks.isWhatsAppConfigured.mockReturnValue(true)
    await notifyOrderStatusChange(
      {
        id: 'order-3',
        supplier_id: 'supplier-1',
        customer_type: 'GUEST',
        total_amount: 25,
        customer_contact_snapshot: {
          phone: '+96170000000',
          whatsappConsent: true,
        },
      },
      'SHIPPED'
    )
    expect(mocks.sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+96170000000',
        eventType: 'public_order.shipped',
        sensitive: true,
      })
    )
  })
})
