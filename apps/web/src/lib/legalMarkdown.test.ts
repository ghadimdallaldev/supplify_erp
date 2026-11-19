import { describe, expect, it } from 'vitest'
import { legalMarkdownToHtml } from './legalMarkdown'

describe('legalMarkdownToHtml escaping', () => {
  it('cannot break out of the href attribute or inject tags', () => {
    const html = legalMarkdownToHtml(
      '[x](https://a.com/" onmouseover="alert(1)) <img src=x onerror=alert(1)>'
    )
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toMatch(/"\s+onmouseover=/i)
  })

  it('still renders links, bold and escapes ampersands', () => {
    const html = legalMarkdownToHtml('**A & B** [site](https://example.com)')
    expect(html).toContain('<strong>A &amp; B</strong>')
    expect(html).toContain('href="https://example.com"')
  })
})
