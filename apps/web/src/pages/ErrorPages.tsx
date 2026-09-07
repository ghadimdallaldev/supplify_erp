import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SupplifyLogo } from '../components/SupplifyLogo'

function ErrorShell({
  code,
  title,
  description,
  children,
}: {
  code: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--app-bg,#fafaf9)] p-8 text-center">
      <SupplifyLogo size={56} variant="mark" />
      <p className="text-6xl font-bold tracking-tight text-[var(--primary)]">{code}</p>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mx-auto max-w-md text-sm text-[var(--text-muted)]">{description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">{children}</div>
    </div>
  )
}

const primaryButton =
  'rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90'
const secondaryButton =
  'rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--app-bg)]'

export function NotFoundPage() {
  const { t } = useTranslation('common')

  return (
    <ErrorShell code="404" title={t('notFound.title')} description={t('notFound.description')}>
      <Link to="/" className={primaryButton}>
        {t('notFound.goHome')}
      </Link>
      <button type="button" className={secondaryButton} onClick={() => window.history.back()}>
        {t('notFound.goBack')}
      </button>
    </ErrorShell>
  )
}

/**
 * Route-level errorElement. Distinguishes router 404 responses from render/loader
 * crashes (rendered as a 500) so unknown URLs and real failures get distinct pages.
 */
export function RouteErrorPage() {
  const error = useRouteError()
  const { t } = useTranslation('common')

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />
  }

  if (import.meta.env.DEV) {
    console.error('Route error boundary caught:', error)
  }

  return (
    <ErrorShell
      code="500"
      title={t('serverError.title')}
      description={t('serverError.description')}
    >
      <button type="button" className={primaryButton} onClick={() => window.location.reload()}>
        {t('actions.reload')}
      </button>
      <Link to="/" className={secondaryButton}>
        {t('notFound.goHome')}
      </Link>
    </ErrorShell>
  )
}
