import { FormEvent, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useConsumerAuth } from '../../contexts/ConsumerAuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { PageShell } from '../../components/ui/page-shell'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'

export function ConsumerAccountPage() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>()
  const slug = restaurantSlug ?? ''
  const { isAuthenticated, login, signup } = useConsumerAuth()
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to={`/order/${slug}/rewards`} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password) {
      toast.error('Username and password are required')
      return
    }
    setSubmitting(true)
    try {
      if (tab === 'login') {
        await login(username.trim(), password)
        toast.success('Welcome back!')
      } else {
        await signup(username.trim(), password)
        toast.success('Account created — welcome bonus applied if enabled')
      }
    } catch (error: any) {
      toast.error(error?.data?.message || error?.data?.error?.message || 'Unable to continue')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell className="mx-auto max-w-md space-y-4 p-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/order/${slug}`}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Rewards account</CardTitle>
          <CardDescription>
            Sign in or create an account to earn points on every order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'signup')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="login-username">Username</Label>
                  <Input
                    id="login-username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Signing in…' : 'Log in'}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="signup-username">Username</Label>
                  <Input
                    id="signup-username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    minLength={3}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  <p className="text-xs text-muted-foreground">At least 8 characters</p>
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Creating account…' : 'Sign up for rewards'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </PageShell>
  )
}

export default ConsumerAccountPage
