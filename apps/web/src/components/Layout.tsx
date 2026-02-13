import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ImpersonationBanner } from './ImpersonationBanner'
import { useAppSelector } from '../hooks/redux'
import { useGetImpersonationStatusQuery } from '../services/api'

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const { data: impersonation } = useGetImpersonationStatusQuery(undefined, {
    skip: user?.role !== 'ADMIN',
  })

  // When impersonating, if we're on an admin page, switch to tenant dashboard
  useEffect(() => {
    if (
      user?.role === 'ADMIN' &&
      impersonation?.active &&
      location.pathname.startsWith('/app/admin')
    ) {
      navigate('/app/dashboard', { replace: true })
    }
  }, [user?.role, impersonation?.active, location.pathname, navigate])

  return (
    <div className="min-h-screen bg-gray-50">
      <ImpersonationBanner />
      <div className="flex">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
