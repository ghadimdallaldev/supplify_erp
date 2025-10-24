import { useAppSelector } from '../hooks/redux'
import { useLogoutMutation } from '../services/api'
import { Button } from './ui/button'
import { LogOut, User } from 'lucide-react'
import toast from 'react-hot-toast'

export function Header() {
  const { user } = useAppSelector((state) => state.auth)
  const [logout] = useLogoutMutation()

  const handleLogout = async () => {
    try {
      await logout().unwrap()
      toast.success('Logged out successfully')
      window.location.href = '/login'
    } catch (error) {
      toast.error('Logout failed')
    }
  }

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Welcome back, {user?.displayName}
            </h2>
            <p className="text-sm text-gray-600 capitalize">
              {user?.role?.toLowerCase()} Account
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <User className="h-4 w-4" />
              <span>{user?.email}</span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="flex items-center space-x-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
