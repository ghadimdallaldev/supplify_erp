import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

type State = {
  hasError: boolean
}

function DefaultErrorFallback() {
  const { t } = useTranslation('common')

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8 text-center"
      role="alert"
    >
      <h2 className="text-lg font-semibold">{t('error.title')}</h2>
      <p className="max-w-md text-sm text-[var(--text-muted)]">{t('error.description')}</p>
      <button
        type="button"
        className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm text-white"
        onClick={() => window.location.reload()}
      >
        {t('actions.reload')}
      </button>
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error boundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return <DefaultErrorFallback />
    }
    return this.props.children
  }
}
