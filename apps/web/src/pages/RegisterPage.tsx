import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { PageHeader } from '../components/ui/page-header'
import { redirectToAuth } from '../lib/authRedirect'
import { storeReferralToken } from '../lib/referralToken'
import { ensureNamespace } from '../i18n'

/** Starts Keycloak registration; preserves supplier referral tokens from `?ref=`. */
export function RegisterPage() {
  const { t } = useTranslation('onboarding')
  const [searchParams] = useSearchParams()

  useEffect(() => {
    void ensureNamespace('onboarding')
  }, [])

  useEffect(() => {
    const ref = searchParams.get('ref')?.trim()
    if (ref) {
      storeReferralToken(ref)
    }
    redirectToAuth('register')
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <PageHeader
          title={t('register.redirecting')}
          className="text-center text-muted-foreground sm:flex-col sm:items-center [&_h1]:text-sm [&_h1]:font-normal"
        />
      </div>
    </div>
  )
}
