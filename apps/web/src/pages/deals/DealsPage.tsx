import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { useGetActivePromotionsQuery } from '../../services/api'
import { Loader2, Tag, Building2 } from 'lucide-react'

export function DealsPage() {
  const { data, isLoading } = useGetActivePromotionsQuery()
  const promotions = data?.promotions || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[21px] font-black text-[var(--text)]">Active deals</h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Promotions from your suppliers — applied automatically at checkout when eligible
        </p>
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : promotions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--text-muted)]">
            No active deals right now. Follow suppliers to see their promotions here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {promotions.map((p) => (
            <Card key={String(p.id)} className={p.is_featured ? 'border-[var(--brand)]' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Tag className="h-4 w-4 text-[var(--brand)]" />
                    {String(p.name)}
                  </CardTitle>
                  {p.is_featured ? <Badge>Featured</Badge> : null}
                </div>
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {String(p.supplier_name || 'Supplier')}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="capitalize text-[var(--text-muted)]">
                  {String(p.type || '').replace(/_/g, ' ')}
                  {p.discount_value != null
                    ? ` · ${p.discount_value}${p.type === 'percentage_discount' ? '% off' : ''}`
                    : ''}
                </p>
                {p.min_order_amount != null && Number(p.min_order_amount) > 0 ? (
                  <p className="text-xs">Min order: ${Number(p.min_order_amount).toFixed(2)}</p>
                ) : null}
                {p.description ? <p>{String(p.description)}</p> : null}
                <Button variant="outline" size="sm" asChild>
                  <Link to="/app/products">Browse catalog</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
