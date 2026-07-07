import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()

vi.mock('../../lib/db.js', () => ({
  query: (...args) => query(...args),
}))

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { processWhatsAppWebhook } from './webhook.service.js'

describe('whatsapp/webhook.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockResolvedValue({ rows: [] })
  })

  it('logs inbound messages and status updates', async () => {
    const result = await processWhatsAppWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '100' },
                messages: [
                  { id: 'wamid.in', from: '96170123456', type: 'text', text: { body: 'Hi' } },
                ],
                statuses: [{ id: 'wamid.out', status: 'read', recipient_id: '96170987654' }],
              },
            },
          ],
        },
      ],
    })

    expect(result.processed).toBe(2)
    expect(query).toHaveBeenCalled()
    expect(String(query.mock.calls[0][0])).toContain('whatsapp_webhook_log')
    expect(String(query.mock.calls[1][0])).toContain('whatsapp_webhook_log')
    expect(String(query.mock.calls[2][0])).toContain('UPDATE whatsapp_delivery_log')
  })
})
