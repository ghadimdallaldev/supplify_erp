import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Select, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { toast } from 'sonner'
import { ensureNamespace } from '../../i18n'
import {
  useGetProductSubstitutesQuery,
  useCreateProductSubstituteMutation,
  useDeleteProductSubstituteMutation,
  useGetProductsQuery,
} from '../../services/api'

export function ProductSubstitutesSection({ productId }: { productId: string }) {
  const { t } = useTranslation('products')
  const { data, isLoading, isError, refetch } = useGetProductSubstitutesQuery(productId)
  const { data: productsData } = useGetProductsQuery({ limit: 200, offset: 0 })
  const [createSub] = useCreateProductSubstituteMutation()
  const [deleteSub] = useDeleteProductSubstituteMutation()
  const [pickId, setPickId] = useState('')

  useEffect(() => {
    void ensureNamespace('products')
  }, [])

  const substitutes = data?.substitutes || data?.data?.substitutes || []
  const products = (productsData?.products || []).filter((p: { id: string }) => p.id !== productId)

  const handleAdd = async () => {
    if (!pickId) return
    try {
      await createSub({ productId, substituteProductId: pickId }).unwrap()
      toast.success(t('substitutes.toast.added'))
      setPickId('')
    } catch {
      toast.error(t('substitutes.toast.addFailed'))
    }
  }

  return (
    <div data-testid="product-substitutes-section" style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{t('substitutes.title')}</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        {t('substitutes.description')}
      </p>
      {isLoading ? (
        <p className="text-xs text-[var(--text-muted)]" data-testid="substitutes-loading">
          {t('substitutes.loading')}
        </p>
      ) : isError ? (
        <p className="text-xs text-[var(--red)]" data-testid="substitutes-error">
          {t('substitutes.loadError')}{' '}
          <button type="button" className="underline" onClick={() => refetch()}>
            {t('substitutes.retry')}
          </button>
        </p>
      ) : substitutes.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }} data-testid="substitutes-empty">
          {t('substitutes.empty')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
          {substitutes.map(
            (s: {
              id: string
              substituteName: string
              substituteSku: string
              priceDifference: number
            }) => (
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
                    <span style={{ color: 'var(--text-muted)', marginInlineStart: 8 }}>
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
                  {t('substitutes.remove')}
                </Button>
              </li>
            )
          )}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Select value={pickId || undefined} onValueChange={setPickId}>
          <SelectTrigger data-testid="substitute-product-select" className="min-w-[200px]">
            <SelectValue placeholder={t('substitutes.selectPlaceholder')} />
          </SelectTrigger>
          {products.map((p: { id: string; name: string; sku: string }) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name} ({p.sku})
            </SelectItem>
          ))}
        </Select>
        <Button data-testid="substitute-add-btn" onClick={handleAdd} disabled={!pickId}>
          {t('substitutes.addButton')}
        </Button>
      </div>
    </div>
  )
}
