import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadAuthenticatedFile } from './downloadFile'
import { refreshAuthSession } from './authSessionRefresh'
vi.mock('./apiBase', () => ({ apiUrl: (path: string) => `https://api.example.test${path}` }))
vi.mock('./authSessionRefresh', () => ({ refreshAuthSession: vi.fn() }))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('authenticated file download', () => {
  it('retries an expired session and attaches the link until click; delays URL cleanup for Safari', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        new Response('%PDF-test', { headers: { 'content-type': 'application/pdf' } })
      )
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(refreshAuthSession).mockResolvedValue({ ok: true } as Awaited<
      ReturnType<typeof refreshAuthSession>
    >)
    URL.createObjectURL = vi.fn().mockReturnValue('blob:invoice')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      expect(this.isConnected).toBe(true)
      expect(this.download).toBe('invoice.pdf')
    })
    await downloadAuthenticatedFile('/api/invoices/1/pdf', 'invoice.pdf', 'application/pdf')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: 'include',
      headers: { 'X-Requested-With': 'Supplify' },
    })
    expect(click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:invoice')
  })
  it('rejects an HTML login page and an empty attachment instead of reporting success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } })
      )
      .mockResolvedValueOnce(new Response('', { headers: { 'content-type': 'application/pdf' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      downloadAuthenticatedFile('/pdf', 'invoice.pdf', 'application/pdf')
    ).rejects.toThrow()
    await expect(
      downloadAuthenticatedFile('/pdf', 'invoice.pdf', 'application/pdf')
    ).rejects.toThrow(/empty/)
  })
})
