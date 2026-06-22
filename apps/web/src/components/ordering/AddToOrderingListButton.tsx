import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useGetQuickListsQuery,
  useAddItemToQuickListMutation,
  useCreateQuickListMutation,
} from '../../services/api'
import { Button } from '../ui/button'
import { toast } from 'sonner'

type Props = {
  productId: string
  supplierId: string
  productName?: string
  defaultQuantity?: number
  defaultUnit?: string
}

export function AddToOrderingListButton({
  productId,
  supplierId,
  productName,
  defaultQuantity = 1,
  defaultUnit,
}: Props) {
  const { t } = useTranslation('inventory')
  const { data } = useGetQuickListsQuery()
  const [addItem, { isLoading }] = useAddItemToQuickListMutation()
  const [createList, { isLoading: creating }] = useCreateQuickListMutation()
  const [open, setOpen] = useState(false)

  const lists = (data?.quickLists || []).filter(
    (l: { supplierId?: string; items?: Array<{ supplier_id?: string }> }) =>
      l.supplierId === supplierId ||
      l.items?.some((i) => i.supplier_id === supplierId) ||
      !l.supplierId
  )

  const handleAdd = async (listId: string) => {
    try {
      await addItem({
        quickListId: listId,
        body: {
          productId,
          supplierId,
          quantity: defaultQuantity,
          defaultUnit,
        },
      }).unwrap()
      toast.success(
        t('toast.addedToOrderingList', {
          name: productName || t('toast.orderingListItemFallback'),
        })
      )
      setOpen(false)
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('toast.addToOrderingListFailed'))
    }
  }

  const handleCreateAndAdd = async () => {
    try {
      const result = await createList({
        name: 'My ordering list',
        supplierId,
        items: [{ productId, supplierId, quantity: defaultQuantity, defaultUnit }],
      }).unwrap()
      toast.success(t('toast.createdListAndAddedItem'))
      setOpen(false)
      void result
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('toast.createOrderingListFailed'))
    }
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        type="button"
        data-testid="add-to-ordering-list-btn"
        onClick={() => setOpen(true)}
      >
        Add to ordering list
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      {lists.map((list: { id: string; name: string }) => (
        <Button
          key={list.id}
          size="sm"
          variant="ghost"
          disabled={isLoading}
          onClick={() => handleAdd(list.id)}
        >
          {list.name}
        </Button>
      ))}
      <Button size="sm" variant="secondary" disabled={creating} onClick={handleCreateAndAdd}>
        + New list
      </Button>
      <Link to={`/app/quick-lists?supplier=${supplierId}`} className="text-xs text-[var(--brand)]">
        View my ordering lists
      </Link>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  )
}
