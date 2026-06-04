import { LEGAL_OPERATOR } from './legalDocuments'

/** Replace draft placeholders with product defaults for display. */
export function applyLegalPlaceholders(markdown: string): string {
  return markdown
    .replace(/\[Company Legal Name\]/g, LEGAL_OPERATOR.companyLegalName)
    .replace(/\[Company Address\]/g, 'Beirut, Lebanon')
    .replace(/\[Support Email\]/g, LEGAL_OPERATOR.supportEmail)
    .replace(/\[Privacy Email\]/g, LEGAL_OPERATOR.privacyEmail)
    .replace(/\[Effective Date\]/g, LEGAL_OPERATOR.effectiveDate)
    .replace(/\[Last Updated\]/g, LEGAL_OPERATOR.lastUpdated)
    .replace(/\[Website\]/g, LEGAL_OPERATOR.website)
}

/** Lightweight markdown → HTML for legal documents (no extra dependencies). */
export function legalMarkdownToHtml(markdown: string): string {
  const lines = applyLegalPlaceholders(markdown).split('\n')
  const html: string[] = []
  let inList = false
  let inBlockquote = false

  const closeList = () => {
    if (inList) {
      html.push('</ul>')
      inList = false
    }
  }
  const closeBlockquote = () => {
    if (inBlockquote) {
      html.push('</blockquote>')
      inBlockquote = false
    }
  }

  const safeHref = (href: string) => {
    const trimmed = href.trim()
    if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed
    return '#'
  }

  const inline = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.+?)\]\((.+?)\)/g, (_match, label, href) => {
        const url = safeHref(href)
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
      })

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith('> ')) {
      closeList()
      if (!inBlockquote) {
        html.push('<blockquote class="legal-bq">')
        inBlockquote = true
      }
      html.push(`<p>${inline(line.slice(2))}</p>`)
      continue
    }
    closeBlockquote()

    if (line.startsWith('### ')) {
      closeList()
      html.push(`<h3>${inline(line.slice(4))}</h3>`)
      continue
    }
    if (line.startsWith('## ')) {
      closeList()
      html.push(`<h2>${inline(line.slice(3))}</h2>`)
      continue
    }
    if (line.startsWith('# ')) {
      closeList()
      html.push(`<h1>${inline(line.slice(2))}</h1>`)
      continue
    }
    if (line.startsWith('- ')) {
      if (!inList) {
        html.push('<ul>')
        inList = true
      }
      html.push(`<li>${inline(line.slice(2))}</li>`)
      continue
    }
    closeList()
    if (!line) {
      html.push('<br />')
      continue
    }
    html.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  closeBlockquote()
  return html.join('\n')
}
