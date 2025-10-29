import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { 
  Loader2, 
  LogIn, 
  Store, 
  ShoppingCart, 
  Truck, 
  Shield, 
  Zap,
  Users,
  BarChart3,
  CheckCircle2
} from 'lucide-react'

export function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  // Check for error from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const errorParam = urlParams.get('error')
    if (errorParam) {
      setError('Authentication failed. Please try again.')
    }
  }, [])

  const handleLogin = () => {
    setIsLoading(true)
    // Redirect to server login endpoint
    window.location.href = 'http://localhost:4000/auth/login'
  }

  const features = [
    { icon: ShoppingCart, title: 'Order Management', desc: 'Streamlined ordering process' },
    { icon: Truck, title: 'Fulfillment', desc: 'Track deliveries in real-time' },
    { icon: BarChart3, title: 'Analytics', desc: 'Data-driven insights' },
    { icon: Shield, title: 'Secure', desc: 'Enterprise-grade security' },
  ]

  const demoAccounts = [
    { role: 'Admin', email: 'admin@supplify.com', password: 'admin123', color: 'bg-purple-100 text-purple-800' },
    { role: 'Supplier', email: 'supplier@example.com', password: 'supplier123', color: 'bg-blue-100 text-blue-800' },
    { role: 'Restaurant', email: 'restaurant@example.com', password: 'restaurant123', color: 'bg-green-100 text-green-800' },
  ]

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding and Features */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-white p-12 flex-col justify-between">
        <div>
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <Store className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Supplify</h1>
              <p className="text-primary-foreground/80 text-sm">Food & Beverage Marketplace</p>
            </div>
          </div>
          
          <h2 className="text-4xl font-bold mb-4">Connect. Order. Grow.</h2>
          <p className="text-xl text-primary-foreground/90 mb-12 max-w-md">
            The premier platform connecting restaurants with trusted F&B suppliers. Streamline your operations, reduce costs, and scale your business.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 max-w-lg">
          {features.map((feature, idx) => (
            <div key={idx} className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <feature.icon className="w-6 h-6 mb-2" />
              <h3 className="font-semibold mb-1">{feature.title}</h3>
              <p className="text-sm text-primary-foreground/80">{feature.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center space-x-2 text-primary-foreground/80 text-sm mt-8">
          <CheckCircle2 className="w-4 h-4" />
          <span>Trusted by 100+ restaurants and suppliers</span>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                <Store className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Supplify</h1>
                <p className="text-sm text-gray-600">F&B Marketplace</p>
              </div>
            </div>
          </div>

          <Card className="border-2 shadow-xl">
            <CardHeader className="space-y-1 pb-4">
              <div className="flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mx-auto mb-4">
                <LogIn className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl text-center">Welcome Back</CardTitle>
              <CardDescription className="text-center">
                Sign in to access your account and start managing your orders
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {error && (
                <Alert variant="destructive" className="animate-in slide-in-from-top-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <Button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full h-12 text-base font-semibold shadow-lg hover:shadow-xl transition-all"
                size="lg"
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

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Demo Accounts</span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-center text-muted-foreground mb-4">
                  Try these demo accounts to explore different roles
                </p>
                {demoAccounts.map((account, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${account.color} border-current/20`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-xs font-semibold">
                        {account.role}
                      </Badge>
                    </div>
                    <div className="text-xs space-y-1 mt-2">
                      <p className="font-mono">{account.email}</p>
                      <p className="opacity-75">Password: <span className="font-mono">{account.password}</span></p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-center space-x-6 text-xs text-muted-foreground">
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

          <p className="text-center text-xs text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}
