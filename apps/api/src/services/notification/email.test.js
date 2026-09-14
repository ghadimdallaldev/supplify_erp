import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../email/email.service.js', () => ({
  sendTemplateEmail: vi.fn().mockResolvedValue({ sent: true }),
}))

vi.mock('../../lib/app-url.js', () => ({
  buildAppUrl: vi.fn((path) => `https://app.example${path}`),
}))

vi.mock('../whatsapp.service.js', () => ({
  sendWhatsAppMessage: vi.fn(),
}))

import { sendTemplateEmail } from '../email/email.service.js'
import { emailService } from './email.js'

describe('notification email order CTA', () => {
  beforeEach(() => vi.clearAllMocks())

  it('infers a working order link from order metadata', async () => {
    await emailService.send({
      email: 'user@example.com',
      subject: 'Order update',
      message: 'Your order changed',
      notificationType: 'ORDER',
      notificationCategory: 'processing',
      referenceId: 'order-1',
      referenceType: 'ORDER',
      metadata: { order_id: 'order-1' },
      userId: 'user-1',
      tenantId: 'tenant-1',
      locale: 'en',
    })

    expect(sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ctaUrl: 'https://app.example/app/orders/order-1',
        }),
      })
    )
  })

  it('prefers the order over a chat deep link for fulfillment emails', async () => {
    await emailService.send({
      email: 'user@example.com',
      subject: 'Shortage',
      message: 'A shortage was reported',
      notificationType: 'ORDER',
      notificationCategory: 'order_fulfillment_issue',
      referenceId: 'conversation-1',
      referenceType: 'CONVERSATION',
      metadata: { orderId: 'order-2', link: '/app/chat?conversation=conversation-1' },
      userId: 'user-1',
      tenantId: 'tenant-1',
      locale: 'en',
    })

    expect(sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ctaUrl: 'https://app.example/app/orders/order-2',
        }),
      })
    )
  })
})
