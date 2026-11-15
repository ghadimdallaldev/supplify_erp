import * as SecureStore from 'expo-secure-store'
import { clearTokens, saveTokens } from './tokenStorage'
import { getRequestScopeVersion, invalidateRequestScope } from './requestScope'

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
}))

describe('token write isolation', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects a late refresh from the previous session without writing credentials', async () => {
    const oldScope = getRequestScopeVersion()
    invalidateRequestScope()
    await expect(saveTokens('old-access', 'old-refresh', null, oldScope)).rejects.toThrow()
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it('finishes an in-flight write before clearing every credential on logout', async () => {
    let finish!: () => void
    jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const saving = saveTokens('access', 'refresh')
    await Promise.resolve()
    const clearing = clearTokens()
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
    finish()
    await saving
    await clearing
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(4)
    const firstDelete = jest.mocked(SecureStore.deleteItemAsync).mock.invocationCallOrder[0]
    expect(firstDelete).toBeGreaterThan(
      jest.mocked(SecureStore.setItemAsync).mock.invocationCallOrder[1]
    )
  })
})
