import { Link } from 'react-router-dom'
import { Package, ShoppingCart } from 'lucide-react'
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
              You&apos;re all set
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Create your first order to start receiving from suppliers.
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
              Create first order
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
              You&apos;re all set
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Add your first product so restaurants can order from you.
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
              Add first product
            </Link>
          </Button>
        </div>
      )}
    </>
  )
}
