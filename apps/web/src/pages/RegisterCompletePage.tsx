import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Alert, AlertDescription } from '../components/ui/alert'
import {
  api,
  useCompleteRegistrationMutation,
  useGetMeQuery,
  useGetRegisterStatusQuery,
} from '../services/api'
import { refetchAppSession, hasStaleRegistrationState } from '../lib/refetchAppSession'
import { useAppDispatch } from '../hooks/redux'
import { Building2, Loader2, Store, Truck } from 'lucide-react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import {
  LegalAcceptancePanel,
  isLegalAcceptanceComplete,
} from '../components/legal/LegalAcceptancePanel'
import { buildLegalAcceptancePayload, type LegalDocumentSlug } from '../lib/legalDocuments'
import { clearReferralToken } from '../lib/referralToken'

type AccountType = 'RESTAURANT' | 'SUPPLIER'

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as FetchBaseQueryError).status === 401
  )
}

export function RegisterCompletePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const referralToken = searchParams.get('ref') || undefined
  const dispatch = useAppDispatch()
  const {
    data: user,
    isLoading: userLoading,
    error: userError,
  } = useGetMeQuery(undefined, {
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
  })
  const {
    data: status,
    isLoading: statusLoading,
    isError: statusIsError,
    error: statusError,
  } = useGetRegisterStatusQuery(undefined, {
    skip: !user,
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
  })
  const [completeRegistration, { isLoading: submitting }] = useCompleteRegistrationMutation()

  const [accountType, setAccountType] = useState<AccountType | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [acceptedLegal, setAcceptedLegal] = useState<Set<LegalDocumentSlug>>(new Set())
  const [electronicSigned, setElectronicSigned] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitMessage, setSubmitMessage] = useState('Creating your workspace…')

  const legalComplete = isLegalAcceptanceComplete(
    'registration',
    accountType,
    acceptedLegal,
    electronicSigned
  )

  useEffect(() => {
    if (!user || user.role === 'ADMIN') return
    if (hasStaleRegistrationState({ role: user.role, needsSetup: status?.needsSetup })) {
      void refetchAppSession(dispatch)
      return
    }
    if (user.role === 'RESTAURANT' || user.role === 'SUPPLIER') {
      if (status?.needsSetup === false) {
        navigate('/app/activate', { replace: true })
      }
    }
  }, [user, status, navigate, dispatch])

  useEffect(() => {
    if (isUnauthorized(userError) || isUnauthorized(statusError)) {
      navigate('/login', { replace: true })
    }
  }, [userError, statusError, navigate])

  useEffect(() => {
    if (!submitting) {
      setSubmitMessage('Creating your workspace…')
      return
    }
    setSubmitMessage('Creating your workspace…')
    const timer = window.setTimeout(() => setSubmitMessage('Almost done…'), 3000)
    return () => window.clearTimeout(timer)
  }, [submitting])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!accountType) {
      setError('Please choose whether you are a restaurant or a supplier.')
      return
    }
    if (!legalComplete) {
      setError('Please accept all required legal agreements before continuing.')
      return
    }
    try {
      await completeRegistration({
        accountType,
        businessName: businessName.trim(),
        phone: phone.trim() || undefined,
        referralToken,
        legalAcceptance: buildLegalAcceptancePayload(acceptedLegal),
      }).unwrap()
      clearReferralToken()
      void refetchAppSession(dispatch)
      navigate('/app/activate', { replace: true })
    } catch (err: unknown) {
      const fetchErr = err as FetchBaseQueryError
      const isNetworkError =
        fetchErr?.status === 'FETCH_ERROR' ||
        fetchErr?.status === 'PARSING_ERROR' ||
        fetchErr?.status === 'TIMEOUT_ERROR'

      if (isNetworkError) {
        try {
          await refetchAppSession(dispatch)
          const me = await dispatch(
            api.endpoints.getMe.initiate(undefined, { forceRefetch: true })
          ).unwrap()
          const regStatus = await dispatch(
            api.endpoints.getRegisterStatus.initiate(undefined, { forceRefetch: true })
          ).unwrap()
          if (
            me.role !== 'PENDING' &&
            (me.role === 'RESTAURANT' || me.role === 'SUPPLIER') &&
            regStatus?.needsSetup === false
          ) {
            navigate('/app/activate', { replace: true })
            return
          }
        } catch {
          // fall through to user-facing error
        }
        setError(
          'The server restarted while saving your profile. Your account may already be set up — refresh this page, or try submitting once more.'
        )
        return
      }

      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Could not complete registration. Please try again.'
      setError(message)
    }
  }

  const loadError =
    statusIsError && !isUnauthorized(statusError)
      ? 'Could not verify registration status. Refresh the page or try again in a moment.'
      : null

  const showSpinner = userLoading || !user || (statusLoading && !status)

  if (showSpinner) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-mid)]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--brand-ultra)] via-[var(--surface)] to-[var(--brand-ultra)] p-6">
      <Card className="w-full max-w-xl border-2 shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set up your organization</CardTitle>
          <CardDescription>
            Your Keycloak account is ready. Tell us how you will use Supplify.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {(error || loadError) && (
              <Alert variant="destructive">
                <AlertDescription>{error || loadError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>I am a</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAccountType('RESTAURANT')}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                    accountType === 'RESTAURANT'
                      ? 'border-[var(--brand)] bg-[var(--brand-pale)]'
                      : 'border-[var(--app-border)] hover:border-[var(--brand)]/40'
                  }`}
                >
                  <Store className="h-6 w-6" />
                  <span className="text-sm font-medium">Restaurant</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('SUPPLIER')}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                    accountType === 'SUPPLIER'
                      ? 'border-[var(--brand)] bg-[var(--brand-pale)]'
                      : 'border-[var(--app-border)] hover:border-[var(--brand)]/40'
                  }`}
                >
                  <Truck className="h-6 w-6" />
                  <span className="text-sm font-medium">Supplier</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessName">Business name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  id="businessName"
                  className="pl-9"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your company or venue name"
                  required
                  minLength={2}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+961 3 000 000"
              />
            </div>

            <LegalAcceptancePanel
              variant="registration"
              accountType={accountType}
              value={acceptedLegal}
              onChange={setAcceptedLegal}
              electronicSigned={electronicSigned}
              onElectronicSignedChange={setElectronicSigned}
              disabled={submitting}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !accountType || !legalComplete}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {submitMessage}
                </>
              ) : (
                'Continue to Supplify'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
