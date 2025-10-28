import { useState } from 'react'
import { useAppSelector } from '../hooks/redux'
import { useLogoutMutation, useGetNotificationsQuery, useMarkAllNotificationsReadMutation } from '../services/api'
import { Button } from './ui/button'
import { LogOut, User, Bell, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from './ui/badge'
import { useNavigate } from 'react-router-dom'

export function Header() {
  const { user } = useAppSelector((state) => state.auth)
  const [logout] = useLogoutMutation()
  const [showNotifications, setShowNotifications] = useState(false)
  const navigate = useNavigate()
  const [markAllAsRead] = useMarkAllNotificationsReadMutation()
  
  // Fetch notifications
  const { data: notificationsData, refetch: refetchNotifications } = useGetNotificationsQuery(
    { limit: 10, offset: 0 },
    { 
      pollingInterval: 30000, // Poll every 30 seconds
      skip: !user // Skip if not logged in
    }
  )
  
  const notifications = notificationsData?.notifications || []
  const unreadCount = notifications.filter(n => !n.is_read).length

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
            {/* Notifications */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </Button>
              
              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
               <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                 <h3 className="font-semibold">Notifications</h3>
                 <div className="flex gap-2">
                   {unreadCount > 0 && (
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={async () => {
                         try {
                           await markAllAsRead().unwrap();
                         } catch (error) {
                           console.error('Failed to mark all as read:', error);
                         }
                       }}
                     >
                       Mark all as read
                     </Button>
                   )}
                   <Button
                     variant="ghost"
                     size="sm"
                     onClick={() => setShowNotifications(false)}
                   >
                     <X className="h-4 w-4" />
                   </Button>
                 </div>
               </div>
                  
                  <div className="divide-y">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        No notifications
                      </div>
                    ) : (
                      notifications.map((notification: any) => (
                        <div
                          key={notification.id}
                          className={`p-4 hover:bg-gray-50 cursor-pointer ${!notification.is_read ? 'bg-blue-50' : ''}`}
                          onClick={() => {
                            if (notification.reference_type === 'ORDER' && notification.reference_id) {
                              navigate(`/app/orders/${notification.reference_id}`);
                              setShowNotifications(false);
                            }
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-gray-900">
                                {notification.title}
                              </h4>
                              <p className="text-sm text-gray-600 mt-1">
                                {notification.message}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(notification.created_at).toLocaleString()}
                              </p>
                            </div>
                            {!notification.is_read && (
                              <div className="ml-2 h-2 w-2 bg-blue-500 rounded-full"></div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            
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
