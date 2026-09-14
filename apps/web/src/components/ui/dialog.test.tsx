import type { ReactNode } from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Dialog, DialogContent, DialogBody, DialogTitle } from './dialog'

afterEach(() => {
  cleanup()
})

function renderDialog(
  ui: ReactNode,
  options?: { size?: 'md' | 'xl' | 'wide'; scroll?: 'body' | 'split'; testId?: string }
) {
  const testId = options?.testId ?? 'dialog'
  return render(
    <Dialog open>
      <DialogContent size={options?.size} scroll={options?.scroll} data-testid={testId}>
        <DialogTitle className="sr-only">Test dialog</DialogTitle>
        {ui}
      </DialogContent>
    </Dialog>
  )
}

describe('DialogContent size variants', () => {
  it('applies md size classes by default', () => {
    renderDialog(<span>Body</span>)
    const content = screen.getByTestId('dialog')
    expect(content.className).toContain('max-w-[min(var(--dialog-md)')
  })

  it('applies xl size classes', () => {
    renderDialog(<span>Body</span>, { size: 'xl', testId: 'dialog-xl' })
    const content = screen.getByTestId('dialog-xl')
    expect(content.className).toContain('max-w-[min(var(--dialog-xl)')
  })

  it('applies wide size classes', () => {
    renderDialog(<span>Body</span>, { size: 'wide', testId: 'dialog-wide' })
    const content = screen.getByTestId('dialog-wide')
    expect(content.className).toContain('max-w-[min(var(--dialog-wide)')
  })

  it('applies split scroll layout', () => {
    renderDialog(<DialogBody>Scrollable</DialogBody>, {
      scroll: 'split',
      testId: 'dialog-split',
    })
    const content = screen.getByTestId('dialog-split')
    expect(content.className).toContain('flex')
    expect(content.className).toContain('overflow-hidden')
    expect(content.className).toContain('p-0')
  })
})
