import { CreditCard, Lock, Shield } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { useGetBillingStatusQuery } from '../services/api'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function AccountActivationPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const { data: billing, isLoading } = useGetBillingStatusQuery()

  const pending = billing?.access?.pendingActivation && billing.access.isLocked

  useEffect(() => {
    if (isLoading || !billing?.access) return
    if (!billing.access.isLocked || !billing.access.pendingActivation) {
      navigate('/app', { replace: true })
    }
  }, [billing, isLoading, navigate])

  const tenantLabel = user?.role === 'SUPPLIER' ? 'supplier' : 'restaurant'

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center p-6">
      <Card className="w-full border-2 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-ultra)] text-[var(--brand-mid)]">
            <Lock className="h-7 w-7" aria-hidden />
          </div>
          <CardTitle className="text-2xl">Activate your account</CardTitle>
          <CardDescription>
            Your {tenantLabel} workspace was created but is not active yet. Choose a paid plan and
            complete checkout, or ask a Supplify administrator to activate you manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)]/50 p-4 text-sm text-[var(--text-mid)]">
            <p className="flex items-start gap-2">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
              Pay for Bronze, Gold, or Platinum to unlock orders, inventory, and the full app
              immediately.
            </p>
            <p className="mt-3 flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
              Free-tier access is only available after an admin activates your account from the
              admin console.
            </p>
          </div>
          <Button
            type="button"
            className="w-full gap-2"
            onClick={() => openBrowseUpgrade(dispatch)}
          >
            <CreditCard className="h-4 w-4" />
            Compare plans & pay
          </Button>
          {pending && billing?.subscription?.planName && (
            <p className="text-center text-xs text-[var(--text-muted)]">
              Current plan on file: {billing.subscription.planName} (pending activation)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
