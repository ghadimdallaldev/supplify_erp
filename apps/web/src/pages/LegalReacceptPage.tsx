import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Loader2, Shield } from 'lucide-react'
import {
  LegalAcceptancePanel,
  isLegalAcceptanceComplete,
} from '../components/legal/LegalAcceptancePanel'
import {
  buildLegalAcceptancePayload,
  LEGAL_PACK_VERSION,
  type LegalDocumentSlug,
} from '../lib/legalDocuments'
import { useGetMeQuery, useSubmitLegalReacceptanceMutation } from '../services/api'
import { refetchAppSession } from '../lib/refetchAppSession'
import { useAppDispatch } from '../hooks/redux'
import { LegalFooterLinks } from '../components/legal/LegalFooterLinks'

export function LegalReacceptPage() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const {
    data: user,
    isLoading,
    error: meError,
  } = useGetMeQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const [submitLegal, { isLoading: submitting }] = useSubmitLegalReacceptanceMutation()

  const [acceptedLegal, setAcceptedLegal] = useState<Set<LegalDocumentSlug>>(new Set())
  const [electronicSigned, setElectronicSigned] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const legalStatus = user?.legalStatus
  const variant = legalStatus?.variant === 'registration' ? 'registration' : 'invite'
  const accountType = legalStatus?.accountType ?? null
  const legalComplete = isLegalAcceptanceComplete(
    variant,
    accountType,
    acceptedLegal,
    electronicSigned
  )

  useEffect(() => {
    if (isLoading || !user) return
    if (user.role === 'PENDING') {
      navigate('/register/complete', { replace: true })
      return
    }
    if (legalStatus && !legalStatus.needsReacceptance) {
      navigate(user.role === 'STAFF_PORTAL' ? '/staff/dashboard' : '/app', { replace: true })
    }
  }, [isLoading, user, legalStatus, navigate])

  const handleSubmit = async () => {
    setError(null)
    if (!legalComplete) {
      setError('Please accept all required legal agreements before continuing.')
      return
    }
    try {
      await submitLegal(buildLegalAcceptancePayload(acceptedLegal)).unwrap()
      await refetchAppSession(dispatch)
      navigate(user?.role === 'STAFF_PORTAL' ? '/staff/dashboard' : '/app', { replace: true })
    } catch (err: unknown) {
      const apiErr = err as { data?: { error?: { message?: string } } }
      setError(apiErr?.data?.error?.message || 'Could not save your acceptance. Try again.')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-mid)]" />
      </div>
    )
  }

  if (meError || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-8 text-center text-sm text-[var(--text-muted)]">
            Please sign in to review updated legal agreements.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Shield className="h-5 w-5 text-[var(--brand)]" />
              Updated legal agreements
            </CardTitle>
            <CardDescription>
              Our legal documents were updated (pack {LEGAL_PACK_VERSION}
              {legalStatus?.acceptedPackVersion
                ? ` · you previously accepted ${legalStatus.acceptedPackVersion}`
                : ''}
              ). Review and accept the current agreements to continue using Supplify.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <LegalAcceptancePanel
              variant={variant}
              accountType={accountType}
              value={acceptedLegal}
              onChange={setAcceptedLegal}
              electronicSigned={electronicSigned}
              onElectronicSignedChange={setElectronicSigned}
              disabled={submitting}
            />

            <Button
              type="button"
              className="w-full"
              disabled={submitting || !legalComplete}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Accept and continue'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
      <footer className="pb-8 text-center text-xs text-[var(--text-muted)]">
        <LegalFooterLinks />
      </footer>
    </div>
  )
}
