import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { copyToClipboard } from './clipboard'

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns false for empty text', async () => {
    await expect(copyToClipboard('')).resolves.toBe(false)
  })

  it('uses navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText },
    })

    await expect(copyToClipboard('https://example.com/reserve/demo')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://example.com/reserve/demo')
  })

  it('falls back to execCommand when clipboard API fails', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })

    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    })

    await expect(copyToClipboard('fallback-text')).resolves.toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })
})
