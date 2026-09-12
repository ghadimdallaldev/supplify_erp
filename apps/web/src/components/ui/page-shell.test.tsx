import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PageShell } from './page-shell'

describe('PageShell maxWidth variants', () => {
  it('uses default content max width', () => {
    const { container } = render(
      <PageShell data-testid="shell">
        <p>Content</p>
      </PageShell>
    )
    const shell = container.querySelector('[data-testid="shell"]')
    expect(shell?.className).toContain('max-w-[var(--content-max)]')
  })

  it('uses focused content max width', () => {
    const { container } = render(
      <PageShell maxWidth="focused" data-testid="shell">
        <p>Content</p>
      </PageShell>
    )
    const shell = container.querySelector('[data-testid="shell"]')
    expect(shell?.className).toContain('max-w-[var(--content-max-focused)]')
  })

  it('uses wide content max width', () => {
    const { container } = render(
      <PageShell maxWidth="wide" data-testid="shell">
        <p>Content</p>
      </PageShell>
    )
    const shell = container.querySelector('[data-testid="shell"]')
    expect(shell?.className).toContain('max-w-[var(--content-max-wide)]')
  })

  it('uses full width without max constraint', () => {
    const { container } = render(
      <PageShell maxWidth="full" data-testid="shell">
        <p>Content</p>
      </PageShell>
    )
    const shell = container.querySelector('[data-testid="shell"]')
    expect(shell?.className).toContain('max-w-none')
  })

  it('applies shared horizontal padding when enabled', () => {
    const { container } = render(
      <PageShell padding data-testid="shell">
        <p>Content</p>
      </PageShell>
    )
    const shell = container.querySelector('[data-testid="shell"]')
    expect(shell?.className).toContain('content-padding-x')
  })
})
