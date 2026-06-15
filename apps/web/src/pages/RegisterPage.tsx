import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { redirectToAuth } from '../lib/authRedirect'
import { storeReferralToken } from '../lib/referralToken'

/** Starts Keycloak registration; preserves supplier referral tokens from `?ref=`. */
export function RegisterPage() {
  const [searchParams] = useSearchParams()

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
        <p className="text-sm">Redirecting…</p>
      </div>
    </div>
  )
}
