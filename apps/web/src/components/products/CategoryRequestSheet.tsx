import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import { localizedName } from '../../lib/categoryLabel'
import type { CategoryDepartment, CreateCategoryRequestBody } from '../../types'

type CategoryRequestSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  departments: CategoryDepartment[]
  /** Prefills the proposed name (usually the product name). */
  suggestedName?: string
  /**
   * Called with the request body. The product form keeps it and sends it once the product
   * exists, so the request moves that product when an admin resolves it.
   */
  onSubmit: (body: CreateCategoryRequestBody) => void | Promise<void>
  submitting?: boolean
}

export function CategoryRequestSheet({
  open,
  onOpenChange,
  departments,
  suggestedName = '',
  onSubmit,
  submitting = false,
}: CategoryRequestSheetProps) {
  const { t, i18n } = useTranslation('products')
  const [name, setName] = useState(suggestedName)
  const [nameAr, setNameAr] = useState('')
  const [parentId, setParentId] = useState('')

  useEffect(() => {
    if (open) {
      setName(suggestedName)
      setNameAr('')
      setParentId('')
    }
  }, [open, suggestedName])

  const trimmed = name.trim()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t('categoryRequest.title')}</SheetTitle>
          <SheetDescription>{t('categoryRequest.description')}</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!trimmed) return
            void onSubmit({
              proposedName: trimmed,
              proposedNameAr: nameAr.trim() || undefined,
              proposedParentId: parentId || undefined,
            })
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="category-request-name">{t('categoryRequest.name')}</Label>
            <Input
              id="category-request-name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('categoryRequest.namePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-request-name-ar">{t('categoryRequest.nameAr')}</Label>
            <Input
              id="category-request-name-ar"
              dir="rtl"
              value={nameAr}
              maxLength={80}
              onChange={(e) => setNameAr(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-request-parent">{t('categoryRequest.department')}</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger id="category-request-parent">
                <option value="">{t('categoryRequest.departmentUnsure')}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {localizedName(d, i18n.language)}
                  </option>
                ))}
              </SelectTrigger>
            </Select>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{t('categoryRequest.interimNote')}</p>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('form.cancel')}
            </Button>
            <Button type="submit" disabled={!trimmed || submitting}>
              {t('categoryRequest.submit')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
