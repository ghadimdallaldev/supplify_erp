import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Loader2, Printer } from 'lucide-react'
import { LegalMarkdown } from '../components/legal/LegalMarkdown'
import {
  LEGAL_DOCUMENTS,
  LEGAL_OPERATOR,
  LEGAL_PACK_VERSION,
  type LegalDocumentSlug,
  legalDocumentAssetUrl,
} from '../lib/legalDocuments'
import { SupplifyLogo } from '../components/SupplifyLogo'
import { PageHeader } from '../components/ui/page-header'

const SLUGS = new Set(Object.keys(LEGAL_DOCUMENTS))

function isLegalSlug(value: string | undefined): value is LegalDocumentSlug {
  return Boolean(value && SLUGS.has(value))
}

export function LegalDocumentPage() {
  const { slug } = useParams<{ slug: string }>()
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const meta = isLegalSlug(slug) ? LEGAL_DOCUMENTS[slug] : null

  useEffect(() => {
    if (!meta) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(legalDocumentAssetUrl(meta.fileName))
      .then((res) => {
        if (!res.ok) throw new Error('Document not found')
        return res.text()
      })
      .then((text) => {
        if (!cancelled) setMarkdown(text)
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load this document. Please try again later.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [meta])

  if (!meta) {
    return (
      <LegalShell>
        <div className="py-16">
          <PageHeader
            title="Document not found"
            description="The legal document you requested does not exist."
            className="text-center sm:flex-col sm:items-center [&_p]:mx-auto"
          />
          <div className="mt-6 text-center">
            <Link
              to="/legal"
              className="text-sm font-medium text-[var(--brand-mid)] hover:underline"
            >
              View all legal documents
            </Link>
          </div>
        </div>
      </LegalShell>
    )
  }

  return (
    <LegalShell>
      <PageHeader
        breadcrumb={
          <Link
            to="/legal"
            className="inline-flex items-center gap-1.5 hover:text-[var(--brand-mid)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Legal center
          </Link>
        }
        title={meta.title}
        description={meta.description}
        actions={
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--brand-ultra)]"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        }
        className="mb-2 print:hidden"
      />
      <p className="mb-8 text-xs text-[var(--text-muted)] print:hidden">
        Effective {LEGAL_OPERATOR.effectiveDate} · Version {LEGAL_PACK_VERSION}
      </p>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--app-border)] px-6 py-4 print:hidden">
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            This document is provided by {LEGAL_OPERATOR.companyLegalName}. Questions:{' '}
            <a
              href={`mailto:${LEGAL_OPERATOR.supportEmail}`}
              className="text-[var(--brand-mid)] hover:underline"
            >
              {LEGAL_OPERATOR.supportEmail}
            </a>
          </p>
        </div>
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          {loading && (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-mid)]" />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {markdown && !loading && <LegalMarkdown markdown={markdown} />}
        </div>
      </div>
    </LegalShell>
  )
}

export function LegalHubPage() {
  const categories = [
    { key: 'core', label: 'Platform agreements' },
    { key: 'role', label: 'Organization-specific' },
    { key: 'product', label: 'Product terms' },
    { key: 'reference', label: 'Billing & deals' },
  ] as const

  return (
    <LegalShell>
      <PageHeader
        title="Legal center"
        description={`Review Supplify's terms, privacy practices, and product policies. Document pack ${LEGAL_PACK_VERSION}, effective ${LEGAL_OPERATOR.effectiveDate}.`}
        className="mb-10 mx-auto max-w-2xl text-center sm:flex-col sm:items-center [&_h1]:text-3xl [&_p]:mx-auto"
      />

      <div className="grid gap-8">
        {categories.map(({ key, label }) => {
          const docs = Object.values(LEGAL_DOCUMENTS).filter((d) => d.category === key)
          if (docs.length === 0) return null
          return (
            <section key={key}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {label}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {docs.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      to={`/legal/${doc.slug}`}
                      className="group flex items-start gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4 shadow-sm transition-colors hover:border-[var(--brand)]/40 hover:bg-[var(--brand-ultra)]"
                    >
                      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-mid)]" />
                      <span>
                        <span className="block text-sm font-semibold text-[var(--text)] group-hover:text-[var(--brand-mid)]">
                          {doc.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                          {doc.description}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <footer className="mt-12 rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)] px-6 py-5 text-center text-xs text-[var(--text-muted)]">
        For legal inquiries contact{' '}
        <a
          href={`mailto:${LEGAL_OPERATOR.supportEmail}`}
          className="text-[var(--brand-mid)] hover:underline"
        >
          {LEGAL_OPERATOR.supportEmail}
        </a>
        {' · '}
        Privacy:{' '}
        <a
          href={`mailto:${LEGAL_OPERATOR.privacyEmail}`}
          className="text-[var(--brand-mid)] hover:underline"
        >
          {LEGAL_OPERATOR.privacyEmail}
        </a>
      </footer>
    </LegalShell>
  )
}

function LegalShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--brand-ultra)] to-[var(--bg)]">
      <div className="border-b border-[var(--app-border)] bg-[var(--surface)]/80 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/login">
            <SupplifyLogo size={32} variant="lockup" theme="light" />
          </Link>
          <Link to="/login" className="text-sm font-medium text-[var(--brand-mid)] hover:underline">
            Sign in
          </Link>
        </div>
      </div>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 print:max-w-none print:px-0">
        {children}
      </main>
    </div>
  )
}
