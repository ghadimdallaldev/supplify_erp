import { renderHook, act } from '@testing-library/react-native'
import NetInfo from '@react-native-community/netinfo'
import { useNetworkStatus } from './useNetworkStatus'

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
}))

describe('useNetworkStatus', () => {
  it('starts online and reacts to disconnect', () => {
    let listener: (state: { isConnected: boolean }) => void = () => {}
    ;(NetInfo.addEventListener as jest.Mock).mockImplementation((cb) => {
      listener = cb
      return jest.fn()
    })

    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current.isOffline).toBe(false)

    act(() => listener({ isConnected: false }))
    expect(result.current.isOffline).toBe(true)

    act(() => listener({ isConnected: true }))
    expect(result.current.isOffline).toBe(false)
  })
})
