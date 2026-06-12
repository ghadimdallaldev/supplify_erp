import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { toast } from 'sonner'
import { useRequestStaffPortalLinkMutation } from '../services/api'
import { redirectToAuth } from '../lib/authRedirect'
import { PublicPageLayout, PublicPanel } from '../components/public/PublicPageLayout'
import { CalendarDays, Clock3, FileText, Megaphone } from 'lucide-react'

const FEATURES = [
  { icon: CalendarDays, text: 'See upcoming shifts and coverage needs' },
  { icon: Clock3, text: 'Clock in and out from your phone' },
  { icon: Megaphone, text: 'Read announcements from your manager' },
  { icon: FileText, text: 'Access policies and onboarding documents' },
]

export function StaffSelfServiceLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [requestLink, { isLoading }] = useRequestStaffPortalLinkMutation()

  const handleKeycloakLogin = () => {
    redirectToAuth('login')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email) {
      toast.error('Please enter your work email address')
      return
    }

    try {
      const response = await requestLink({ email }).unwrap()
      if (response.sessionToken) {
        toast.success('Magic link ready (dev mode). Opening your dashboard…')
        navigate(`/staff/dashboard?token=${response.sessionToken}`)
        return
      }
      toast.success(
        response.message ||
          'If an account exists for this email, a sign-in link has been sent. Check your inbox.'
      )
    } catch (error: unknown) {
      const err = error as { data?: { message?: string; error?: { message?: string } } }
      toast.error(
        err?.data?.message || err?.data?.error?.message || 'Unable to generate login link'
      )
    }
  }

  return (
    <PublicPageLayout
      wide
      title="Staff portal"
      subtitle="View your schedule, request time off, and clock in — from any device."
      logoInitial="S"
      className="pb-[max(3rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-6 lg:grid-cols-2">
        <PublicPanel
          title="Sign in"
          description="Use the account your manager created, or request a one-time link to your work email."
          className="lg:col-start-2 lg:row-start-1"
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <Button
                type="button"
                className="consumer-pressable pwa-touch-target w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
                onClick={handleKeycloakLogin}
              >
                Sign in with email & password
              </Button>
              <p className="text-center text-xs text-[var(--text-muted)]">
                For accounts created by your restaurant manager
              </p>
            </div>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-[var(--app-border)]" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[var(--surface)] px-3 text-xs text-[var(--text-muted)]">
                  or email a magic link
                </span>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  enterKeyHint="send"
                  className="mt-1.5 h-11 text-base sm:text-sm"
                  placeholder="you@restaurant.com"
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
                {isLoading ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>
          </div>
        </PublicPanel>

        <PublicPanel title="What you can do here" className="h-fit lg:col-start-1 lg:row-start-1">
          <ul className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-[var(--text-mid)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </PublicPanel>
      </div>
    </PublicPageLayout>
  )
}

export default StaffSelfServiceLogin
