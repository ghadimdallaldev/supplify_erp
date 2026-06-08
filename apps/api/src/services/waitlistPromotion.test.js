import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  offerNextWaitlistEntry,
  handleReservationCancelled,
  checkExpiredWaitlistOffers,
  buildWaitlistOfferUrls,
  buildReservationManageUrl,
  acceptWaitlistOffer,
  declineWaitlistOffer,
} from './waitlistPromotion.js'

const getRestaurantSlotAvailabilityMock = vi.fn()
const assertSlotBookableMock = vi.fn()

vi.mock('../lib/reservation-availability.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getRestaurantSlotAvailability: (...args) => getRestaurantSlotAvailabilityMock(...args),
    assertSlotBookable: (...args) => assertSlotBookableMock(...args),
  }
})

const queryMock = vi.fn()
const withTransactionMock = vi.fn((handler) =>
  handler({
    query: (...args) => queryMock(...args),
  })
)

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (handler) => withTransactionMock(handler),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('./email/email.service.js', () => ({
  sendTemplateEmail: vi.fn().mockResolvedValue({ sent: true }),
}))

vi.mock('./whatsapp.service.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ sent: false, reason: 'NOT_CONFIGURED' }),
}))

vi.mock('../config/env.js', () => ({
  config: { WEB_ORIGIN: 'http://localhost:5173' },
}))

const isFeatureEnabledMock = vi.fn().mockResolvedValue(true)
vi.mock('../lib/subscription.js', () => ({
  isFeatureEnabled: (...args) => isFeatureEnabledMock(...args),
}))

describe('waitlistPromotion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isFeatureEnabledMock.mockResolvedValue(true)
    getRestaurantSlotAvailabilityMock.mockResolvedValue({
      slots: [{ startTime: new Date().toISOString(), isAvailable: true }],
    })
    assertSlotBookableMock.mockImplementation(() => true)
  })

  describe('buildWaitlistOfferUrls', () => {
    it('builds accept and decline URLs from offer token', () => {
      const urls = buildWaitlistOfferUrls('abc-123')
      expect(urls.acceptUrl).toContain('/reserve/waitlist/abc-123/accept')
      expect(urls.declineUrl).toContain('/reserve/waitlist/abc-123/decline')
    })
  })

  describe('buildReservationManageUrl', () => {
    it('builds manage URL from public token', () => {
      expect(buildReservationManageUrl('pub-tok')).toContain('/reserve/manage/pub-tok')
    })
  })

  describe('offerNextWaitlistEntry', () => {
    it('returns null when no eligible waitlist entries', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] })

      const result = await offerNextWaitlistEntry({
        restaurantId: 'rest-1',
        partySize: 4,
      })

      expect(result).toBeNull()
    })

    it('offers the first matching entry by position', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'wl-1',
              restaurant_id: 'rest-1',
              party_size: 4,
              customer_name: 'Alex',
              customer_phone: '+123',
              customer_email: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'wl-1',
              offer_token: 'token-1',
              offer_expires_at: new Date(Date.now() + 7200000).toISOString(),
              customer_name: 'Alex',
              party_size: 4,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ name: 'Test Bistro' }] })

      const result = await offerNextWaitlistEntry({
        restaurantId: 'rest-1',
        partySize: 4,
      })

      expect(result?.id).toBe('wl-1')
      expect(result?.offer_token).toBe('token-1')
    })
  })

  describe('handleReservationCancelled', () => {
    it('skips auto promotion when waitlist_auto_promo is disabled', async () => {
      isFeatureEnabledMock.mockResolvedValue(false)
      queryMock.mockResolvedValueOnce({ rows: [] })

      const offered = await handleReservationCancelled({
        id: 'res-1',
        restaurant_id: 'rest-1',
        party_size: 2,
      })

      expect(offered).toBeNull()
      expect(isFeatureEnabledMock).toHaveBeenCalledWith(
        'rest-1',
        'RESTAURANT',
        'waitlist_auto_promo'
      )
    })

    it('records cancellation and promotes waitlist', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'wl-2',
              restaurant_id: 'rest-1',
              party_size: 2,
              customer_name: 'Sam',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'wl-2',
              offer_token: 'tok-2',
              offer_expires_at: new Date().toISOString(),
              customer_name: 'Sam',
              party_size: 2,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ name: 'Venue' }] })

      const offered = await handleReservationCancelled(
        { id: 'res-1', restaurant_id: 'rest-1', party_size: 2 },
        { cancellationReason: 'Guest no-show' }
      )

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('cancelled_at'),
        expect.arrayContaining(['res-1', 'Guest no-show'])
      )
      expect(offered?.id).toBe('wl-2')
    })
  })

  describe('checkExpiredWaitlistOffers', () => {
    it('expires offers and attempts next promotion', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'wl-exp',
              restaurant_id: 'rest-1',
              party_size: 3,
              branch_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })

      const result = await checkExpiredWaitlistOffers()

      expect(result.expired).toBe(1)
      expect(result.promoted).toBe(0)
    })
  })

  describe('acceptWaitlistOffer', () => {
    it('rejects inactive offers', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: 'wl-1', offer_status: 'declined', offer_expires_at: null }],
      })

      await expect(acceptWaitlistOffer('bad-token')).rejects.toThrow(/no longer active/)
    })

    it('rejects when slot is no longer bookable', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'wl-full',
            offer_status: 'offered',
            offer_expires_at: new Date(Date.now() + 3600000).toISOString(),
            restaurant_id: 'rest-1',
            party_size: 4,
            preferred_time: new Date().toISOString(),
            customer_name: 'Pat',
          },
        ],
      })
      queryMock.mockResolvedValueOnce({ rows: [{ operating_hours: {} }] })
      const slotError = new Error(
        'Sorry, this time slot was just booked. Please choose another time.'
      )
      slotError.statusCode = 409
      assertSlotBookableMock.mockImplementationOnce(() => {
        throw slotError
      })

      await expect(acceptWaitlistOffer('tok-full')).rejects.toThrow(/just booked/)
      expect(assertSlotBookableMock).toHaveBeenCalled()
    })

    it('returns manageUrl after successful accept', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'wl-ok',
              offer_status: 'offered',
              offer_expires_at: new Date(Date.now() + 3600000).toISOString(),
              restaurant_id: 'rest-1',
              party_size: 2,
              preferred_time: new Date().toISOString(),
              customer_name: 'Alex',
              customer_phone: null,
              customer_email: null,
              branch_id: null,
              notes: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ operating_hours: {} }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'res-new',
              public_token: 'manage-tok-1',
              status: 'CONFIRMED',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'wl-ok', status: 'SEATED', offer_status: 'accepted' }],
        })

      const result = await acceptWaitlistOffer('tok-ok')
      expect(result.manageToken).toBe('manage-tok-1')
      expect(result.manageUrl).toContain('/reserve/manage/manage-tok-1')
    })
  })

  describe('declineWaitlistOffer', () => {
    it('declines and offers next guest', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'wl-3',
              offer_status: 'offered',
              offer_expires_at: new Date(Date.now() + 3600000).toISOString(),
              restaurant_id: 'rest-1',
              party_size: 2,
              branch_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'wl-3', status: 'WAITING', offer_status: 'declined' }],
        })
        .mockResolvedValueOnce({ rows: [] })

      const declined = await declineWaitlistOffer('tok-3')
      expect(declined.id).toBe('wl-3')
    })
  })
})
