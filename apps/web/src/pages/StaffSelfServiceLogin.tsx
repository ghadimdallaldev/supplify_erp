import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { toast } from 'react-hot-toast'
import { useRequestStaffPortalLinkMutation } from '../services/api'
import { redirectToAuth } from '../lib/authRedirect'

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
    } catch (error: any) {
      toast.error(
        error?.data?.message || error?.data?.error?.message || 'Unable to generate login link'
      )
    }
  }

  return (
    <div className="min-h-screen bg-slate-900/90 py-16 px-4 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row">
        <div className="w-full space-y-4 lg:w-1/2">
          <h1 className="text-3xl font-bold tracking-tight">Supplify Staff Access</h1>
          <p className="text-sm text-[var(--text-muted)]">
            View your schedule, request time off, and clock in/out. Sign in with the account your
            manager created, or request a one-time magic link to your work email.
          </p>
          <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-5 text-sm">
            <p className="font-semibold text-[var(--text-muted)]">What you can do</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--text-muted)]">
              <li>See upcoming shifts and coverage needs</li>
              <li>Request PTO and log shift swaps</li>
              <li>Clock-in guidance and special announcements</li>
              <li>Access documents, policies, and onboarding resources</li>
            </ul>
          </div>
        </div>

        <Card className="w-full bg-white/95 text-[var(--text-muted)] shadow-xl lg:w-1/2">
          <CardHeader>
            <CardTitle>Staff portal sign in</CardTitle>
            <CardDescription>
              Use your work email and password from your manager, or request a one-time magic link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Button type="button" className="w-full" onClick={handleKeycloakLogin}>
                Sign in with email & password
              </Button>
              <p className="text-center text-xs text-[var(--text-muted)]">
                For accounts created by your restaurant manager
              </p>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-[var(--app-border)]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-[var(--text-muted)]">Or magic link</span>
              </div>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@restaurant.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Sending magic link…' : 'Send magic link'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default StaffSelfServiceLogin
