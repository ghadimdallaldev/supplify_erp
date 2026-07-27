import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { useNotificationAlerts } from './useNotificationAlerts'

const mockSocket = {
  connected: true,
  on: vi.fn(),
  off: vi.fn(),
}

vi.mock('../lib/appSocket', () => ({
  getAppSocket: vi.fn(() => mockSocket),
}))

vi.mock('../services/api', () => ({
  api: {
    util: { invalidateTags: vi.fn(() => ({ type: 'invalidate' })) },
  },
  useGetNotificationsQuery: vi.fn(() => ({ data: { notifications: [] } })),
}))

vi.mock('./redux', () => ({
  useAppSelector: vi.fn((selector) => selector({ auth: { user: { id: 'user-1' } } })),
  useAppDispatch: () => vi.fn(),
}))

vi.mock('../lib/registerServiceWorker', () => ({
  registerServiceWorker: vi.fn(),
}))

describe('useNotificationAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('subscribes to notification_new on app socket', () => {
    const store = configureStore({ reducer: { auth: () => ({ user: { id: 'user-1' } }) } })
    renderHook(() => useNotificationAlerts(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <MemoryRouter>{children}</MemoryRouter>
        </Provider>
      ),
    })
    expect(mockSocket.on).toHaveBeenCalledWith('notification_new', expect.any(Function))
  })
})
