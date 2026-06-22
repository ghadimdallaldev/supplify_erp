import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Loader2, Printer } from 'lucide-react'
import { LegalMarkdown } from '../components/legal/LegalMarkdown'
import {
  LEGAL_DOCUMENTS,
  LEGAL_OPERATOR,
  LEGAL_PACK_VERSION,
  type LegalDocumentSlug,
  legalDocumentAssetUrl,
  legalDocumentTitleKey,
  legalDocumentDescriptionKey,
} from '../lib/legalDocuments'
import { SupplifyLogo } from '../components/SupplifyLogo'
import { PageHeader } from '../components/ui/page-header'
import { ensureNamespace, getActiveLocale } from '../i18n'

const SLUGS = new Set(Object.keys(LEGAL_DOCUMENTS))

function isLegalSlug(value: string | undefined): value is LegalDocumentSlug {
  return Boolean(value && SLUGS.has(value))
}

export function LegalDocumentPage() {
  const { t, i18n } = useTranslation('legal')
  const { slug } = useParams<{ slug: string }>()
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const meta = isLegalSlug(slug) ? LEGAL_DOCUMENTS[slug] : null

  useEffect(() => {
    void ensureNamespace('legal')
  }, [])

  useEffect(() => {
    if (!meta) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const locale = getActiveLocale()
    const assetUrl = legalDocumentAssetUrl(meta.fileName, locale)
    fetch(assetUrl)
      .then((res) => {
        if (!res.ok && locale === 'ar') {
          return fetch(legalDocumentAssetUrl(meta.fileName, 'en')).then((fallback) => {
            if (!fallback.ok) throw new Error('Document not found')
            return fallback.text()
          })
        }
        if (!res.ok) throw new Error('Document not found')
        return res.text()
      })
      .then((text) => {
        if (!cancelled) setMarkdown(text)
      })
      .catch(() => {
        if (!cancelled) setError(t('document.loadError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [meta, t, i18n.language])

  if (!meta) {
    return (
      <LegalShell>
        <div className="py-16">
          <PageHeader
            title={t('document.notFoundTitle')}
            description={t('document.notFoundDescription')}
            className="text-center sm:flex-col sm:items-center [&_p]:mx-auto"
          />
          <div className="mt-6 text-center">
            <Link
              to="/legal"
              className="text-sm font-medium text-[var(--brand-mid)] hover:underline"
            >
              {t('document.viewAll')}
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
            {t('document.legalCenter')}
          </Link>
        }
        title={t(legalDocumentTitleKey(meta.slug))}
        description={t(legalDocumentDescriptionKey(meta.slug))}
        actions={
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--brand-ultra)]"
          >
            <Printer className="h-4 w-4" />
            {t('document.print')}
          </button>
        }
        className="mb-2 print:hidden"
      />
      <p className="mb-8 text-xs text-[var(--text-muted)] print:hidden">
        {t('document.effective', {
          date: LEGAL_OPERATOR.effectiveDate,
          version: LEGAL_PACK_VERSION,
        })}
      </p>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--app-border)] px-6 py-4 print:hidden">
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            {t('document.providedBy', { company: LEGAL_OPERATOR.companyLegalName })}{' '}
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
  const { t } = useTranslation('legal')
  const categories = [
    { key: 'core', label: t('hub.categories.core') },
    { key: 'role', label: t('hub.categories.role') },
    { key: 'product', label: t('hub.categories.product') },
    { key: 'reference', label: t('hub.categories.reference') },
  ] as const

  useEffect(() => {
    void ensureNamespace('legal')
  }, [])

  return (
    <LegalShell>
      <PageHeader
        title={t('hub.title')}
        description={t('hub.description', {
          version: LEGAL_PACK_VERSION,
          date: LEGAL_OPERATOR.effectiveDate,
        })}
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
                          {t(legalDocumentTitleKey(doc.slug))}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                          {t(legalDocumentDescriptionKey(doc.slug))}
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
        {t('hub.footerInquiries')}{' '}
        <a
          href={`mailto:${LEGAL_OPERATOR.supportEmail}`}
          className="text-[var(--brand-mid)] hover:underline"
        >
          {LEGAL_OPERATOR.supportEmail}
        </a>
        {' · '}
        {t('hub.footerPrivacy')}{' '}
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
  const { t } = useTranslation('legal')

  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--brand-ultra)] to-[var(--bg)]">
      <div className="border-b border-[var(--app-border)] bg-[var(--surface)]/80 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/login">
            <SupplifyLogo size={32} variant="lockup" theme="light" />
          </Link>
          <Link to="/login" className="text-sm font-medium text-[var(--brand-mid)] hover:underline">
            {t('document.signIn')}
          </Link>
        </div>
      </div>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 print:max-w-none print:px-0">
        {children}
      </main>
    </div>
  )
}
