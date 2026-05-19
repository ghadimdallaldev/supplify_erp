import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { redirectToAuth } from '../lib/authRedirect'

type OAuthFlow = 'login' | 'register'

/** Handles /auth/login and /auth/register when the SPA is served instead of the API proxy. */
export function OAuthRedirect({ flow }: { flow: OAuthFlow }) {
  useEffect(() => {
    redirectToAuth(flow)
  }, [flow])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Redirecting…</p>
      </div>
    </div>
  )
}
