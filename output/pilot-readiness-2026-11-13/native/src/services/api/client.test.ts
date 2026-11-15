import { ApiError, apiRequest, PaymentRequiredError, setApiAuthStateListener } from './client'
import { clearTokens, getAccessToken, getRefreshToken } from '../../features/auth/tokenStorage'
import { invalidateRequestScope } from '../../features/auth/requestScope'

jest.mock('../../features/auth/tokenStorage', () => ({
  getAccessToken: jest.fn().mockResolvedValue('token'),
  getRefreshToken: jest.fn().mockResolvedValue(null),
  getActiveTenantToken: jest.fn().mockResolvedValue(null),
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
}))

describe('api client', () => {
  it('does not sign out a newer session when credential cleanup finishes late', async () => {
    let finish!: () => void
    jest.mocked(clearTokens).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const listener = jest.fn()
    const unsubscribe = setApiAuthStateListener(listener)
    global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({ ok: false, error: { name: 'UNAUTHORIZED' } }) })
    const pending = apiRequest('/api/orders')
    while (!finish) await Promise.resolve()
    invalidateRequestScope()
    finish()
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it('unwraps ok envelope', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { id: '1' }, error: null }),
    })
    const data = await apiRequest<{ id: string }>('/auth/me')
    expect(data.id).toBe('1')
  })

  it('throws ApiError on 403', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Nope' },
      }),
    })
    await expect(apiRequest('/api/orders')).rejects.toBeInstanceOf(ApiError)
  })

  it('throws ApiError on 402', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        ok: false,
        data: null,
        error: { name: 'ACCOUNT_LOCKED', message: 'Locked' },
      }),
    })
    await expect(apiRequest('/api/orders', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 402,
      code: 'ACCOUNT_LOCKED',
    })
  })

  it('throws PaymentRequiredError on promotion 402 without locking account path', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        ok: false,
        data: {
          paymentRequired: true,
          amount: 39,
          invoiceId: 'inv-1',
          message: 'Add a payment method',
        },
        error: {
          name: 'PROMOTION_AD_PAYMENT_REQUIRED',
          message: 'No payment method',
        },
      }),
    })
    await expect(
      apiRequest('/api/promotions/deal-1/pay-activation', {
        method: 'POST',
        body: {},
      })
    ).rejects.toBeInstanceOf(PaymentRequiredError)
  })

  it('omits auth and does not refresh or clear the session for guest requests', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        ok: false,
        data: null,
        error: { name: 'UNAUTHORIZED', message: 'Guest request rejected' },
      }),
    })
    await expect(apiRequest('/api/public/suppliers', { auth: false })).rejects.toMatchObject({
      status: 401,
    })
    const request = (global.fetch as jest.Mock).mock.calls[0][1]
    expect(request.headers.Authorization).toBeUndefined()
    expect(getAccessToken).not.toHaveBeenCalled()
    expect(getRefreshToken).not.toHaveBeenCalled()
    expect(clearTokens).not.toHaveBeenCalled()
  })

  it('aborts an old account request and ignores its late 401 without clearing new tokens', async () => {
    let finish!: (response: unknown) => void
    ;(global.fetch as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const pending = apiRequest('/api/orders')
    while (!(global.fetch as jest.Mock).mock.calls.length) await Promise.resolve()
    const signal = (global.fetch as jest.Mock).mock.calls[0][1].signal as AbortSignal
    invalidateRequestScope()
    expect(signal.aborted).toBe(true)
    finish({
      status: 401,
      ok: false,
      json: async () => ({ ok: false, error: { name: 'UNAUTHORIZED' } }),
    })
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
    expect(getRefreshToken).not.toHaveBeenCalled()
    expect(clearTokens).not.toHaveBeenCalled()
  })

  it('rejects a response whose body finishes after a workspace switch', async () => {
    let finish!: (body: unknown) => void
    const json = jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    ;(global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json,
    })
    const pending = apiRequest('/api/orders')
    while (!json.mock.calls.length) await Promise.resolve()
    invalidateRequestScope()
    finish({ ok: true, data: { orders: [{ id: 'other-tenant-order' }] } })
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
  })
})
