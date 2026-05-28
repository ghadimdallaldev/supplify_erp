import { legalMarkdownToHtml } from '../../lib/legalMarkdown'

type Props = {
  markdown: string
  className?: string
}

export function LegalMarkdown({ markdown, className = '' }: Props) {
  const html = legalMarkdownToHtml(markdown)
  return (
    <article
      className={`legal-prose max-w-none text-[var(--text)] ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
