import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Loader2 } from 'lucide-react'

export function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleLogin = () => {
    // Redirect to server login endpoint
    window.location.href = 'http://localhost:4000/auth/login'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Supplify
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Restaurant & F&B Supplier Marketplace
          </p>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Sign in to your account</CardTitle>
            <CardDescription>
              Connect restaurants with F&B suppliers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in with Keycloak'
                )}
              </Button>
            </div>
            
            <div className="text-center text-sm text-gray-600">
              <p>Demo accounts:</p>
              <div className="mt-2 space-y-1">
                <p><strong>Admin:</strong> admin@supplify.com / admin123</p>
                <p><strong>Supplier:</strong> supplier@example.com / supplier123</p>
                <p><strong>Restaurant:</strong> restaurant@example.com / restaurant123</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
