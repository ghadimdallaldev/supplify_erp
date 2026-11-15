import { io } from 'socket.io-client'
import { connectChatSocket, disconnectChatSocket } from './chatSocket'
import { getAccessToken } from '../features/auth/tokenStorage'
import { invalidateRequestScope } from '../features/auth/requestScope'

jest.mock('socket.io-client', () => ({ io: jest.fn() }))
jest.mock('../features/auth/tokenStorage', () => ({
  getAccessToken: jest.fn().mockResolvedValue('access'),
  getRefreshToken: jest.fn().mockResolvedValue('refresh'),
  getActiveTenantToken: jest.fn().mockResolvedValue('tenant'),
}))

describe('chat session isolation', () => {
  const socket = { connected: false, io: { opts: {} }, on: jest.fn(), once: jest.fn(), off: jest.fn(), connect: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn() }
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(io).mockReturnValue(socket as never) })
  afterEach(() => disconnectChatSocket())

  it('does not connect after token reads finish for an old account', async () => {
    let finish!: (token: string) => void
    jest.mocked(getAccessToken).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pending = connectChatSocket()
    invalidateRequestScope()
    finish('old-access')
    await expect(pending).rejects.toThrow()
    expect(socket.connect).not.toHaveBeenCalled()
  })

  it('aborts an in-flight socket handshake when the workspace changes', async () => {
    const pending = connectChatSocket()
    while (!socket.connect.mock.calls.length) await Promise.resolve()
    invalidateRequestScope()
    await expect(pending).rejects.toThrow('Session changed')
    expect(socket.disconnect).toHaveBeenCalled()
  })
})
