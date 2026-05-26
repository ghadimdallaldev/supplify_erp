import { useState, useEffect } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Alert, AlertDescription } from '../components/ui/alert'
import {
  Loader2,
  LogIn,
  ShoppingCart,
  Truck,
  Shield,
  Zap,
  Users,
  BarChart3,
  CheckCircle2,
} from 'lucide-react'
import { SupplifyLogo } from '../components/SupplifyLogo'
import { redirectToAuth, redirectToLogout } from '../lib/authRedirect'

export function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteRegistered, setInviteRegistered] = useState(false)
  const [inEmbeddedFrame, setInEmbeddedFrame] = useState(false)

  useEffect(() => {
    try {
      setInEmbeddedFrame(window.self !== window.top)
    } catch {
      setInEmbeddedFrame(true)
    }
  }, [])

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const errorParam = urlParams.get('error')
    const expiredParam = urlParams.get('expired')
    if (urlParams.get('registered') === '1') {
      setInviteRegistered(true)
    } else if (expiredParam === 'true') {
      setError('Your session expired. Please sign in again.')
    } else if (errorParam) {
      setError(
        'Authentication failed. If you were signed in as a demo user, sign out first and try again.'
      )
    }
  }, [])

  const handleLogin = () => {
    setIsLoading(true)
    redirectToAuth('login')
  }

  const handleSignup = () => {
    setIsLoading(true)
    redirectToAuth('register')
  }

  const features = [
    { icon: ShoppingCart, title: 'Order Management', desc: 'Streamlined ordering process' },
    { icon: Truck, title: 'Fulfillment', desc: 'Track deliveries in real-time' },
    { icon: BarChart3, title: 'Analytics', desc: 'Data-driven insights' },
    { icon: Shield, title: 'Secure', desc: 'Enterprise-grade security' },
  ]

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding and Features */}
      <div
        className="hidden lg:flex lg:flex-1 text-white p-12 flex-col justify-between"
        style={{ background: 'linear-gradient(145deg, #5b21b6 0%, #4c1d95 50%, #1e0b3a 100%)' }}
      >
        <div>
          <div className="mb-10">
            <SupplifyLogo size={48} variant="lockup" theme="dark" tagline={true} />
          </div>

          <h2
            style={{
              fontSize: 40,
              fontWeight: 900,
              letterSpacing: '-0.03em',
              marginBottom: 16,
              lineHeight: 1.1,
            }}
          >
            Connect.
            <br />
            Order.
            <br />
            Grow.
          </h2>
          <p
            style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.75)',
              maxWidth: 360,
              lineHeight: 1.6,
            }}
          >
            The platform connecting restaurants with trusted F&amp;B suppliers. Streamline
            operations, reduce costs, scale your business.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 420 }}>
          {features.map((feature, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(8px)',
                borderRadius: 12,
                padding: '14px 16px',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <feature.icon style={{ width: 20, height: 20, marginBottom: 8, color: '#a78bfa' }} />
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{feature.title}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{feature.desc}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'rgba(255,255,255,0.5)',
            fontSize: 13,
            marginTop: 24,
          }}
        >
          <CheckCircle2 style={{ width: 14, height: 14, color: '#10b981' }} />
          <span>Trusted by 100+ restaurants and suppliers</span>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div
        className="flex-1 flex items-start lg:items-center justify-center p-4 sm:p-8 overflow-y-auto"
        style={{ background: 'var(--bg)' }}
        data-testid="login-page"
      >
        <div className="w-full max-w-lg space-y-6 py-4">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <SupplifyLogo size={44} variant="lockup" theme="light" tagline={true} />
          </div>

          <Card
            style={{
              border: '1px solid var(--app-border)',
              boxShadow: '0 8px 32px rgba(91,33,182,0.10)',
            }}
          >
            <CardHeader className="space-y-1 pb-4">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <SupplifyLogo size={56} variant="mark" />
              </div>
              <CardTitle
                className="text-2xl text-center"
                style={{ color: 'var(--text)', fontWeight: 900, letterSpacing: '-0.02em' }}
              >
                Welcome back
              </CardTitle>
              <CardDescription className="text-center" style={{ color: 'var(--text-muted)' }}>
                Sign in to access your account and start managing your orders
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {inEmbeddedFrame && (
                <Alert>
                  <AlertDescription>
                    Open{' '}
                    <a
                      href="/login"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline"
                    >
                      {typeof window !== 'undefined' ? window.location.origin : ''}/login
                    </a>{' '}
                    in your browser (Chrome or Edge). Sign-in does not work inside embedded
                    previews.
                  </AlertDescription>
                </Alert>
              )}

              {inviteRegistered && (
                <Alert className="animate-in slide-in-from-top-2 border-emerald-200 bg-emerald-50">
                  <AlertDescription className="text-emerald-900">
                    Your account was created. Sign in with the email and password you set on the
                    invitation page.
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive" className="animate-in slide-in-from-top-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                data-testid="login-button"
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full h-12 text-base font-semibold transition-all"
                size="lg"
                style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-5 w-5" />
                    Sign in with Keycloak
                  </>
                )}
              </Button>

              <p className="text-center text-sm text-[var(--text-muted)]">
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={handleSignup}
                  disabled={isLoading}
                  className="font-medium text-[var(--brand-mid)] hover:underline"
                >
                  Create account
                </button>
              </p>

              <p className="text-center text-xs text-[var(--text-muted)]">
                Stuck on an old session?{' '}
                <button
                  type="button"
                  onClick={() => redirectToLogout()}
                  className="font-medium text-[var(--brand-mid)] hover:underline"
                >
                  Sign out completely
                </button>
              </p>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-center space-x-6 text-xs text-[var(--text-muted)]">
                  <div className="flex items-center space-x-1">
                    <Shield className="w-3 h-3" />
                    <span>Secure</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Zap className="w-3 h-3" />
                    <span>Fast</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Users className="w-3 h-3" />
                    <span>Trusted</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-[var(--text-muted)]">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}
