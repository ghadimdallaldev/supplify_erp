import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
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
import { redirectToAuth, redirectToLogout, isEmbeddedFrame } from '../lib/authRedirect'
import { LegalFooterLinks } from '../components/legal/LegalFooterLinks'
import { ensureNamespace } from '../i18n'

export function LoginPage() {
  const { t } = useTranslation('auth')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteRegistered, setInviteRegistered] = useState(false)
  const [inEmbeddedFrame, setInEmbeddedFrame] = useState(false)

  useEffect(() => {
    setInEmbeddedFrame(isEmbeddedFrame())
  }, [])

  useEffect(() => {
    void ensureNamespace('auth')
  }, [])

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const errorParam = urlParams.get('error')
    const expiredParam = urlParams.get('expired')
    if (urlParams.get('registered') === '1') {
      setInviteRegistered(true)
    } else if (expiredParam === 'true') {
      setError(t('sessionExpired'))
    } else if (errorParam) {
      setError(t('authFailed'))
    }
  }, [t])

  const handleLogin = () => {
    if (inEmbeddedFrame) return
    setIsLoading(true)
    redirectToAuth('login')
  }

  const handleSignup = () => {
    if (inEmbeddedFrame) return
    setIsLoading(true)
    redirectToAuth('register')
  }

  const features = [
    {
      icon: ShoppingCart,
      title: t('marketingFeatures.orderManagement.title'),
      desc: t('marketingFeatures.orderManagement.description'),
    },
    {
      icon: Truck,
      title: t('marketingFeatures.fulfillment.title'),
      desc: t('marketingFeatures.fulfillment.description'),
    },
    {
      icon: BarChart3,
      title: t('marketingFeatures.analytics.title'),
      desc: t('marketingFeatures.analytics.description'),
    },
    {
      icon: Shield,
      title: t('marketingFeatures.secure.title'),
      desc: t('marketingFeatures.secure.description'),
    },
  ]

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding and Features */}
      <div
        className="relative hidden lg:flex lg:flex-1 text-white p-12 flex-col justify-between overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #5b21b6 0%, #4c1d95 50%, #1e0b3a 100%)' }}
      >
        {/* Ambient depth glows */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.28), transparent 70%)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.18), transparent 70%)' }}
        />
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
            {t('taglineLine1')}
            <br />
            {t('taglineLine2')}
            <br />
            {t('taglineLine3')}
          </h2>
          <p
            style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.75)',
              maxWidth: 360,
              lineHeight: 1.6,
            }}
          >
            {t('marketingDescription')}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 420 }}>
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="hover-lift"
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
          <span>{t('trustedBy')}</span>
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
            className="animate-rise-in"
            style={{
              border: '1px solid var(--app-border)',
              boxShadow: '0 8px 32px rgba(91,33,182,0.10)',
            }}
          >
            <CardHeader className="space-y-1 pb-4">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <SupplifyLogo size={56} variant="mark" />
              </div>
              <PageHeader
                title={t('welcomeBack')}
                description="Sign in to access your account and start managing your orders"
                className="text-center sm:flex-col sm:items-center [&_p]:mx-auto"
              />
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
                <Alert className="border-emerald-200 bg-emerald-50 content-reveal">
                  <AlertDescription className="text-emerald-900">
                    {t('inviteRegistered')}
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive" className="content-reveal">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                data-testid="login-button"
                onClick={handleLogin}
                disabled={isLoading || inEmbeddedFrame}
                className="w-full h-12 text-base font-semibold erp-pressable"
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
                    {t('signIn')}
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
                  {t('createAccount')}
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

          <LegalFooterLinks />
        </div>
      </div>
    </div>
  )
}
