import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ImpersonationBanner } from './ImpersonationBanner'
import { UpgradeModal } from './UpgradeModal'
import { useAppSelector, useAppDispatch } from '../hooks/redux'
import {
  refreshBlockedCount,
  showMonetizationBlock,
} from '../features/monetization/monetizationSlice'
import {
  useGetImpersonationStatusQuery,
  useGetEntitlementsQuery,
  useRecordConversionEventMutation,
} from '../services/api'
import { AlertTriangle } from 'lucide-react'

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)

  useEffect(() => {
    dispatch(refreshBlockedCount())
  }, [dispatch])
  const { data: impersonation } = useGetImpersonationStatusQuery(undefined, {
    skip: user?.role !== 'ADMIN',
  })
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: user?.role === 'ADMIN' || !user,
  })
  const [recordConversionEvent] = useRecordConversionEventMutation()
  const blockedCountLast7d = useAppSelector((state) => state.monetization.blockedCountLast7d)

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

  const e = entitlementsData?.entitlements
  const limits = e?.limits ?? {}
  const usage = e?.usage ?? {}
  const nearLimitKeys = Object.entries(limits)
    .filter(([_, limit]) => limit != null && limit !== -1)
    .map(([key]) => {
      const current = usage[key] ?? 0
      const limit = limits[key] as number
      const pct = limit > 0 ? (current / limit) * 100 : 0
      return { key, pct, current, limit }
    })
    .filter(({ pct }) => pct >= 80 && pct < 100)
    .slice(0, 3)

  return (
    <div className="min-h-screen bg-gray-50">
      <ImpersonationBanner />
      <UpgradeModal />
      <div className="flex">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          {user?.role !== 'ADMIN' && nearLimitKeys.length > 0 && (
            <div className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Usage near limit:{' '}
                {nearLimitKeys.map(({ key }) => key.replace(/_/g, ' ')).join(', ')}.{' '}
                <button
                  type="button"
                  className="font-medium underline hover:no-underline"
                  onClick={() => navigate('/app/settings')}
                >
                  View usage
                </button>
              </span>
              <button
                type="button"
                className="font-medium underline hover:no-underline shrink-0"
                onClick={() => {
                  const first = nearLimitKeys[0]
                  if (first) {
                    recordConversionEvent({
                      eventType: 'OPEN_UPGRADE',
                      metadata: { source: 'near_limit', limitKey: first.key },
                    }).catch(() => {})
                    dispatch(
                      showMonetizationBlock({
                        type: 'limit',
                        payload: {
                          limitKey: first.key,
                          limitValue: first.limit,
                          currentUsage: first.current,
                          currentPlan: e?.plan?.name ?? null,
                          recommendedPlans: [],
                          upgradeUrl: '/app/settings',
                        },
                      })
                    )
                  }
                }}
              >
                Upgrade
              </button>
            </div>
          )}
          {user?.role !== 'ADMIN' && blockedCountLast7d >= 3 && (
            <div className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
              <span>
                You&apos;ve hit plan limits several times recently. Upgrade for higher limits and
                more features.
              </span>
              <button
                type="button"
                className="font-medium underline hover:no-underline"
                onClick={() => {
                  recordConversionEvent({ eventType: 'VIEW_PLANS' }).catch(() => {})
                  navigate('/app/settings')
                }}
              >
                View plans
              </button>
            </div>
          )}
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
