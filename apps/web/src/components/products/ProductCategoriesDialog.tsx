import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  useCreateProductCategoryMutation,
  useDeleteProductCategoryMutation,
} from '../../services/api'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

type Category = {
  id: string
  name: string
  description?: string
  product_count?: number
  supplier_id?: string | null
}

type ProductCategoriesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
}

export function ProductCategoriesDialog({
  open,
  onOpenChange,
  categories,
}: ProductCategoriesDialogProps) {
  const { t } = useTranslation('products')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [createCategory, { isLoading: isCreating }] = useCreateProductCategoryMutation()
  const [deleteCategory, { isLoading: isDeleting }] = useDeleteProductCategoryMutation()

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t('categories.nameRequired'))
      return
    }
    try {
      await createCategory({
        name: name.trim(),
        description: description.trim() || undefined,
      }).unwrap()
      setName('')
      setDescription('')
      toast.success(t('categories.created'))
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('categories.createFailed'))
    }
  }

  const handleDelete = async (category: Category) => {
    try {
      await deleteCategory(category.id).unwrap()
      toast.success(t('categories.deleted'))
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('categories.deleteFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('categories.title')}</DialogTitle>
          <DialogDescription>{t('categories.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label htmlFor="category-name">{t('categories.name')}</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category-description">{t('categories.descriptionLabel')}</Label>
            <Input
              id="category-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
            />
          </div>
          <Button type="button" onClick={handleCreate} disabled={isCreating} className="w-fit">
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            {isCreating ? t('categories.creating') : t('categories.add')}
          </Button>
          <div className="max-h-64 divide-y overflow-y-auto rounded-md border border-[var(--app-border)]">
            {categories.length ? (
              categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{category.name}</p>
                    {category.description && (
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {category.description}
                      </p>
                    )}
                  </div>
                  {category.supplier_id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(category)}
                      disabled={isDeleting}
                      aria-label={t('categories.delete', { name: category.name })}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                {t('categories.empty')}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('form.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
