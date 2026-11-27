import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronsUpDown, Sparkles } from 'lucide-react'
import { useGetCategorySuggestionsQuery } from '../../services/api'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { localizedName } from '../../lib/categoryLabel'
import { CategoryIconBadge } from '../marketplace/CategoryBrowse'
import type { CategoryDepartment, CategorySuggestionsResponse } from '../../types'

export const SUGGESTION_DEBOUNCE_MS = 300

type CategoryComboboxProps = {
  id?: string
  departments: CategoryDepartment[]
  /** Selected leaf category id ('' when none). */
  value: string
  onChange: (categoryId: string) => void
  /** The product name; drives the suggestions. */
  productName: string
  disabled?: boolean
  /** Accessible name when there is no visible <Label htmlFor>. */
  ariaLabel?: string
  /** Pre-select a confident suggestion (new products). Off where choosing saves at once. */
  autoSelect?: boolean
}

/**
 * Searchable department → leaf picker. Suggests categories from the product name (debounced)
 * and pre-selects a confident match (`autoCategoryId`) until the supplier picks one themselves.
 */
export function CategoryCombobox({
  id,
  departments,
  value,
  onChange,
  productName,
  disabled,
  ariaLabel,
  autoSelect = true,
}: CategoryComboboxProps) {
  const { t, i18n } = useTranslation('products')
  const [open, setOpen] = useState(false)
  const [debouncedName, setDebouncedName] = useState(productName.trim())
  // Once the supplier chooses, suggestions never overwrite their choice.
  const userChose = useRef(Boolean(value))

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedName(productName.trim()),
      SUGGESTION_DEBOUNCE_MS
    )
    return () => window.clearTimeout(timer)
  }, [productName])

  const { data: suggestionData } = useGetCategorySuggestionsQuery(
    { name: debouncedName },
    { skip: debouncedName.length < 2 }
  ) as { data?: CategorySuggestionsResponse }

  const autoCategoryId = suggestionData?.autoCategoryId ?? null
  useEffect(() => {
    if (!autoSelect) return
    if (autoCategoryId && !userChose.current && value !== autoCategoryId) onChange(autoCategoryId)
  }, [autoSelect, autoCategoryId, value, onChange])

  const leafById = useMemo(() => {
    const map = new Map<
      string,
      { leaf: CategoryDepartment['categories'][number]; dept: CategoryDepartment }
    >()
    for (const dept of departments)
      for (const leaf of dept.categories) map.set(leaf.id, { leaf, dept })
    return map
  }, [departments])

  const selected = value ? leafById.get(value) : undefined
  const suggestions = (suggestionData?.suggestions ?? []).filter((s) => leafById.has(s.categoryId))

  const choose = (categoryId: string) => {
    userChose.current = true
    onChange(categoryId)
    setOpen(false)
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {selected ? (
              <span className="flex min-w-0 items-center gap-2">
                <CategoryIconBadge
                  iconKey={selected.leaf.icon_key}
                  tintKey={selected.dept.slug}
                  size="sm"
                />
                <span className="truncate">{localizedName(selected.leaf, i18n.language)}</span>
                <span className="truncate text-xs text-[var(--text-muted)]">
                  {localizedName(selected.dept, i18n.language)}
                </span>
              </span>
            ) : (
              <span className="text-[var(--text-muted)]">{t('form.selectCategory')}</span>
            )}
            <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] min-w-[280px] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={t('form.searchCategories')} />
            <CommandList className="max-h-72">
              <CommandEmpty>{t('form.noCategoryMatch')}</CommandEmpty>
              {departments.map((dept) => (
                <CommandGroup key={dept.id} heading={localizedName(dept, i18n.language)}>
                  {dept.categories.map((leaf) => (
                    <CommandItem
                      key={leaf.id}
                      // cmdk filters on this text: English, Arabic and the department.
                      value={`${leaf.name} ${leaf.name_ar ?? ''} ${dept.name} ${leaf.id}`}
                      onSelect={() => choose(leaf.id)}
                    >
                      <CategoryIconBadge iconKey={leaf.icon_key} tintKey={dept.slug} size="sm" />
                      <span className="flex-1">{localizedName(leaf, i18n.language)}</span>
                      <Check
                        aria-hidden="true"
                        className={cn('h-4 w-4', leaf.id === value ? 'opacity-100' : 'opacity-0')}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('form.suggested')}
          </span>
          {suggestions.map((s) => {
            const active = s.categoryId === value
            return (
              <button
                key={s.categoryId}
                type="button"
                aria-pressed={active}
                onClick={() => choose(s.categoryId)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-150',
                  active
                    ? 'border-[var(--brand)] bg-[var(--brand-pale)] text-[var(--brand-mid)]'
                    : 'border-[var(--app-border)] text-[var(--text-mid)] hover:bg-[var(--app-bg-subtle)]'
                )}
              >
                {localizedName({ name: s.name, name_ar: s.name_ar }, i18n.language)}
                <span className="ms-1 text-[var(--text-muted)]">
                  ·{' '}
                  {localizedName(
                    { name: s.departmentName, name_ar: s.departmentNameAr },
                    i18n.language
                  )}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
