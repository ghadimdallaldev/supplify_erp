import { Link } from 'react-router-dom'
import { Package, ShoppingCart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'

type Props = {
  isRestaurant: boolean
  isSupplier: boolean
  showRestaurantCta: boolean
  totalOrders: number
  totalProducts: number
}

export function DashboardPostOnboardingBanners({
  isRestaurant,
  isSupplier,
  showRestaurantCta,
  totalOrders,
  totalProducts,
}: Props) {
  const { t } = useTranslation('dashboard')

  return (
    <>
      {isRestaurant && showRestaurantCta && totalOrders === 0 && (
        <div
          style={{
            background: 'var(--brand-pale)',
            border: '1px solid var(--brand-light)',
            borderRadius: 12,
            padding: '14px 16px',
            gap: 12,
          }}
          className="dashboard-split-row"
        >
          <div className="min-w-0">
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              {t('onboarding.allSet')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('onboarding.restaurant.description')}
            </div>
          </div>
          <Button
            asChild
            style={{
              background: 'var(--brand)',
              borderColor: 'var(--brand)',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            <Link to="/app/cart">
              <ShoppingCart style={{ width: 14, height: 14, marginRight: 6 }} />
              {t('onboarding.restaurant.cta')}
            </Link>
          </Button>
        </div>
      )}
      {isSupplier && totalProducts === 0 && (
        <div
          style={{
            background: 'var(--brand-pale)',
            border: '1px solid var(--brand-light)',
            borderRadius: 12,
            padding: '14px 16px',
            gap: 12,
          }}
          className="dashboard-split-row"
        >
          <div className="min-w-0">
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              {t('onboarding.allSet')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('onboarding.supplier.description')}
            </div>
          </div>
          <Button
            asChild
            style={{
              background: 'var(--brand)',
              borderColor: 'var(--brand)',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            <Link to="/app/products">
              <Package style={{ width: 14, height: 14, marginRight: 6 }} />
              {t('onboarding.supplier.cta')}
            </Link>
          </Button>
        </div>
      )}
    </>
  )
}
