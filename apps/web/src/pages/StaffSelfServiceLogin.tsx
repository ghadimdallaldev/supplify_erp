import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { toast } from 'react-hot-toast'
import { useRequestStaffPortalLinkMutation } from '../services/api'

export function StaffSelfServiceLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [requestLink, { isLoading }] = useRequestStaffPortalLinkMutation()

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
            View your schedule, request time off, and stay in sync with your restaurant. Enter your
            work email to receive a magic link. Keep this page open—you&apos;ll be redirected
            automatically once the link is generated.
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
            <CardTitle>Request secure login link</CardTitle>
            <CardDescription>
              We’ll send a one-time access link to your work email. No passwords, just a simple RSVP
              back to the team.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
