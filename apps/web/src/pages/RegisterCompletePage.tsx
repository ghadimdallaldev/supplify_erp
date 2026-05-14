import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Alert, AlertDescription } from '../components/ui/alert'
import {
  useCompleteRegistrationMutation,
  useGetRegisterStatusQuery,
} from '../services/api'
import { Building2, Loader2, Store, Truck } from 'lucide-react'

type AccountType = 'RESTAURANT' | 'SUPPLIER'

export function RegisterCompletePage() {
  const navigate = useNavigate()
  const { data: status, isLoading: statusLoading, error: statusError } = useGetRegisterStatusQuery()
  const [completeRegistration, { isLoading: submitting }] = useCompleteRegistrationMutation()

  const [accountType, setAccountType] = useState<AccountType>('RESTAURANT')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status && !status.needsSetup) {
      navigate('/app', { replace: true })
    }
  }, [status, navigate])

  useEffect(() => {
    if (statusError) {
      navigate('/login', { replace: true })
    }
  }, [statusError, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await completeRegistration({
        accountType,
        businessName: businessName.trim(),
        phone: phone.trim() || undefined,
      }).unwrap()
      navigate('/app', { replace: true })
    } catch (err: unknown) {
      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Could not complete registration. Please try again.'
      setError(message)
    }
  }

  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50 p-6">
      <Card className="w-full max-w-lg border-2 shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set up your organization</CardTitle>
          <CardDescription>
            Your Keycloak account is ready. Tell us how you will use Supplify.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
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
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-primary/40'
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
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-primary/40'
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
                <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
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
                placeholder="+971 50 000 0000"
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating organization...
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
