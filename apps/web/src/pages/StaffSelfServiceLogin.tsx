import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { toast } from 'sonner'
import { useRequestStaffPortalLinkMutation } from '../services/api'
import { redirectToAuth } from '../lib/authRedirect'
import { PublicPageLayout, PublicPanel } from '../components/public/PublicPageLayout'
import { CalendarDays, Clock3, FileText, Megaphone } from 'lucide-react'
import { ensureNamespace } from '../i18n'

const FEATURE_KEYS = ['shifts', 'clock', 'announcements', 'documents'] as const
const FEATURE_ICONS = {
  shifts: CalendarDays,
  clock: Clock3,
  announcements: Megaphone,
  documents: FileText,
} as const

export function StaffSelfServiceLogin() {
  const { t } = useTranslation('staff')
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [requestLink, { isLoading }] = useRequestStaffPortalLinkMutation()

  useEffect(() => {
    void ensureNamespace('staff')
  }, [])

  const handleKeycloakLogin = () => {
    redirectToAuth('login')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email) {
      toast.error(t('portal.signIn.enterEmail'))
      return
    }

    try {
      const response = await requestLink({ email }).unwrap()
      if (response.sessionToken) {
        toast.success(t('portal.signIn.magicLinkDev'))
        navigate(`/staff/dashboard?token=${response.sessionToken}`)
        return
      }
      toast.success(response.message || t('portal.signIn.magicLinkSent'))
    } catch (error: unknown) {
      const err = error as { data?: { message?: string; error?: { message?: string } } }
      toast.error(
        err?.data?.message || err?.data?.error?.message || t('portal.signIn.loginLinkFailed')
      )
    }
  }

  return (
    <PublicPageLayout
      wide
      title={t('portal.title')}
      subtitle={t('portal.subtitle')}
      logoInitial="S"
      className="pb-[max(3rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-6 lg:grid-cols-2">
        <PublicPanel
          title={t('portal.signIn.title')}
          description={t('portal.signIn.description')}
          className="lg:col-start-2 lg:row-start-1"
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <Button
                type="button"
                className="consumer-pressable pwa-touch-target w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
                onClick={handleKeycloakLogin}
              >
                {t('portal.signIn.emailPassword')}
              </Button>
              <p className="text-center text-xs text-[var(--text-muted)]">
                {t('portal.signIn.emailPasswordHint')}
              </p>
            </div>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-[var(--app-border)]" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[var(--surface)] px-3 text-xs text-[var(--text-muted)]">
                  {t('portal.signIn.orMagicLink')}
                </span>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <Label htmlFor="email">{t('portal.signIn.workEmail')}</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  enterKeyHint="send"
                  className="mt-1.5 h-11 text-base sm:text-sm"
                  placeholder={t('portal.signIn.emailPlaceholder')}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                className="consumer-pressable pwa-touch-target w-full"
                disabled={isLoading}
              >
                {isLoading ? t('portal.signIn.sending') : t('portal.signIn.sendMagicLink')}
              </Button>
            </form>
          </div>
        </PublicPanel>

        <PublicPanel
          title={t('portal.features.title')}
          className="h-fit lg:col-start-1 lg:row-start-1"
        >
          <ul className="space-y-3">
            {FEATURE_KEYS.map((key) => {
              const Icon = FEATURE_ICONS[key]
              return (
                <li key={key} className="flex items-start gap-3 text-sm text-[var(--text-mid)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  {t(`portal.features.${key}`)}
                </li>
              )
            })}
          </ul>
        </PublicPanel>
      </div>
    </PublicPageLayout>
  )
}

export default StaffSelfServiceLogin
