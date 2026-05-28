import { useState } from 'react'
import {
  useGetProductSubstitutesQuery,
  useCreateProductSubstituteMutation,
  useDeleteProductSubstituteMutation,
  useGetProductsQuery,
} from '../../services/api'
import { Button } from '../ui/button'
import { Select, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import toast from 'react-hot-toast'

export function ProductSubstitutesSection({ productId }: { productId: string }) {
  const { data, isLoading, isError, refetch } = useGetProductSubstitutesQuery(productId)
  const { data: productsData } = useGetProductsQuery({ limit: 200, offset: 0 })
  const [createSub] = useCreateProductSubstituteMutation()
  const [deleteSub] = useDeleteProductSubstituteMutation()
  const [pickId, setPickId] = useState('')

  const substitutes = data?.substitutes || data?.data?.substitutes || []
  const products = (productsData?.products || []).filter((p: any) => p.id !== productId)

  const handleAdd = async () => {
    if (!pickId) return
    try {
      await createSub({ productId, substituteProductId: pickId }).unwrap()
      toast.success('Substitute added')
      setPickId('')
    } catch {
      toast.error('Failed to add substitute')
    }
  }

  return (
    <div data-testid="product-substitutes-section" style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Substitute products</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Pre-approved alternates when this item is unavailable on an order.
      </p>
      {isLoading ? (
        <p className="text-xs text-[var(--text-muted)]" data-testid="substitutes-loading">
          Loading substitutes…
        </p>
      ) : isError ? (
        <p className="text-xs text-[var(--red)]" data-testid="substitutes-error">
          Could not load substitutes.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>
            Retry
          </button>
        </p>
      ) : substitutes.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }} data-testid="substitutes-empty">
          No substitutes configured yet.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
          {substitutes.map((s: any) => (
            <li
              key={s.id}
              data-testid={`substitute-row-${s.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid var(--app-border)',
                fontSize: 13,
              }}
            >
              <span>
                {s.substituteName} ({s.substituteSku})
                {s.priceDifference !== 0 && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                    {s.priceDifference > 0 ? '+' : ''}
                    {Number(s.priceDifference).toFixed(2)}
                  </span>
                )}
              </span>
              <Button
                size="sm"
                variant="ghost"
                data-testid={`substitute-delete-${s.id}`}
                onClick={() => deleteSub({ productId, substituteId: s.id })}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Select value={pickId || undefined} onValueChange={setPickId}>
          <SelectTrigger data-testid="substitute-product-select" className="min-w-[200px]">
            <SelectValue placeholder="Choose substitute product" />
          </SelectTrigger>
          {products.map((p: any) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name} ({p.sku})
            </SelectItem>
          ))}
        </Select>
        <Button data-testid="substitute-add-btn" onClick={handleAdd} disabled={!pickId}>
          Add substitute
        </Button>
      </div>
    </div>
  )
}
