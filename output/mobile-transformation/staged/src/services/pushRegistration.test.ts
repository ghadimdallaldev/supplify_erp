import { apiRequest } from './api/client'
import {
  clearStoredExpoPushToken,
  getPushUnavailableReason,
  getStoredExpoPushToken,
  isPushAvailable,
  registerForPushNotificationsAsync,
  unregisterNativePushToken,
} from './push'
import { syncPushDevice, unregisterStoredPushDevice } from './pushRegistration'

jest.mock('./api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, _code: string, message: string) {
      super(message)
      this.status = status
    }
  },
  apiRequest: jest.fn(),
}))

jest.mock('./push', () => ({
  clearStoredExpoPushToken: jest.fn(),
  getPushPlatform: jest.fn(() => 'android'),
  getPushUnavailableReason: jest.fn(() => null),
  getStoredExpoPushToken: jest.fn(),
  isPushAvailable: jest.fn(),
  registerForPushNotificationsAsync: jest.fn(),
  unregisterNativePushToken: jest.fn(),
}))

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>
const isPushAvailableMock = isPushAvailable as jest.MockedFunction<typeof isPushAvailable>
const getPushUnavailableReasonMock = getPushUnavailableReason as jest.MockedFunction<
  typeof getPushUnavailableReason
>
const registerMock = registerForPushNotificationsAsync as jest.MockedFunction<
  typeof registerForPushNotificationsAsync
>
const getStoredTokenMock = getStoredExpoPushToken as jest.MockedFunction<
  typeof getStoredExpoPushToken
>
const clearStoredTokenMock = clearStoredExpoPushToken as jest.MockedFunction<
  typeof clearStoredExpoPushToken
>
const unregisterNativeTokenMock = unregisterNativePushToken as jest.MockedFunction<
  typeof unregisterNativePushToken
>

describe('push registration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    isPushAvailableMock.mockReturnValue(true)
    getPushUnavailableReasonMock.mockReturnValue(null)
    registerMock.mockResolvedValue('ExponentPushToken[abc]')
    apiRequestMock.mockResolvedValue({} as never)
  })

  it('registers the Expo token with the authenticated API', async () => {
    await expect(syncPushDevice()).resolves.toBe('ExponentPushToken[abc]')
    expect(apiRequestMock).toHaveBeenCalledWith('/api/push/devices', {
      method: 'POST',
      body: { token: 'ExponentPushToken[abc]', platform: 'android' },
      timeoutMs: 20_000,
    })
  })

  it('reports unsupported runtimes instead of silently succeeding', async () => {
    isPushAvailableMock.mockReturnValue(false)
    getPushUnavailableReasonMock.mockReturnValue(
      'This session is Expo Go. Install the Supplify APK from EAS (not Expo Go) to enable remote push.'
    )
    await expect(syncPushDevice()).rejects.toMatchObject({ code: 'UNAVAILABLE' })
    expect(apiRequestMock).not.toHaveBeenCalled()
  })

  it('reports denied notification permission', async () => {
    registerMock.mockResolvedValue(null)
    await expect(syncPushDevice()).rejects.toMatchObject({ code: 'DENIED' })
    expect(apiRequestMock).not.toHaveBeenCalled()
  })

  it('unregisters the stored device before clearing its token', async () => {
    getStoredTokenMock.mockResolvedValue('ExponentPushToken[abc]')
    await unregisterStoredPushDevice()
    expect(apiRequestMock).toHaveBeenCalledWith('/api/push/devices', {
      method: 'DELETE',
      body: { token: 'ExponentPushToken[abc]', platform: 'android' },
      timeoutMs: 10_000,
    })
    expect(clearStoredTokenMock).toHaveBeenCalled()
    expect(unregisterNativeTokenMock).toHaveBeenCalled()
  })

  it('revokes local push even when server unregister fails', async () => {
    getStoredTokenMock.mockResolvedValue('ExponentPushToken[abc]')
    apiRequestMock.mockRejectedValueOnce(new Error('offline'))

    await expect(unregisterStoredPushDevice()).rejects.toThrow('offline')
    expect(unregisterNativeTokenMock).toHaveBeenCalled()
    expect(clearStoredTokenMock).toHaveBeenCalled()
  })
})
