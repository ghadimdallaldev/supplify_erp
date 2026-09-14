import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '../../ui/button'
import { usePushNotifications } from '../../../hooks/usePushNotifications'
import { ensureNamespace } from '../../../i18n'

type PushEnableBannerProps = {
  /** When false, banner is not shown (plan gate, etc.). */
  allowed: boolean
}

/**
 * Fixed bottom-right prompt to enable browser push.
 * Owns its own loading + inline error so Enable never looks “dead”.
 */
export function PushEnableBanner({ allowed }: PushEnableBannerProps) {
  const { t } = useTranslation('suppliers')
  const push = usePushNotifications()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  if (!allowed || !push.bannerVisible || push.subscribed) return null

  const busy = Boolean(push.enabling)

  const onEnable = () => {
    setError(null)
    if (!push.pushAvailable) {
      setError(push.pushUnavailableReason || t('pushBanner.enableFailed'))
      return
    }
    void push
      .enablePush()
      .then(() => setError(null))
      .catch((err: unknown) => {
        const message =
          err instanceof Error && err.message ? err.message : t('pushBanner.enableFailed')
        setError(message)
      })
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-4 shadow-lg"
      role="dialog"
      aria-label={t('pushBanner.title')}
    >
      <p className="text-sm font-medium text-[var(--text)]">{t('pushBanner.title')}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{t('pushBanner.description')}</p>
      {error ? (
        <p className="mt-2 text-xs text-[var(--red)]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={onEnable}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('pushBanner.enable')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={push.dismissBanner}
        >
          {t('pushBanner.notNow')}
        </Button>
      </div>
    </div>
  )
}
