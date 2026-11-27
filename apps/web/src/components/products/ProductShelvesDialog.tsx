import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Archive, Check, Loader2, Pencil, X } from 'lucide-react'
import {
  useArchiveShelfMutation,
  useCreateShelfMutation,
  useGetProductsQuery,
  useGetShelvesQuery,
  useReorderShelvesMutation,
  useSetShelfProductsMutation,
  useUpdateShelfMutation,
} from '../../services/api'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch'
import { localizedName } from '../../lib/categoryLabel'
import type { CatalogApiError, Product, SupplierShelf } from '../../types'

type InUse = {
  shelfName: string
  deals: Array<{ id: string; name: string }>
  rules: Array<{ id: string; name: string }>
}

function catalogError(e: unknown): CatalogApiError | undefined {
  return (e as { data?: { error?: CatalogApiError } })?.data?.error
}

/**
 * Supplier shelves: the branch's own groupings (storefront sections, deal and routing targets).
 * Create, rename, reorder, choose products, archive. Archiving a shelf that live deals or
 * routing rules use is refused (409 SHELF_IN_USE) and the blockers are listed.
 */
export function ProductShelvesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation('products')
  const { data, isLoading } = useGetShelvesQuery(undefined, { skip: !open })
  const shelves = useMemo(
    () =>
      [...((data?.shelves ?? []) as SupplierShelf[])].sort(
        (a, b) => a.display_order - b.display_order
      ),
    [data?.shelves]
  )
  const [createShelf, { isLoading: creating }] = useCreateShelfMutation()
  const [updateShelf] = useUpdateShelfMutation()
  const [reorderShelves, { isLoading: reordering }] = useReorderShelvesMutation()
  const [archiveShelf, { isLoading: archiving }] = useArchiveShelfMutation()

  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [archiveTarget, setArchiveTarget] = useState<SupplierShelf | null>(null)
  const [inUse, setInUse] = useState<InUse | null>(null)
  const [productsFor, setProductsFor] = useState<SupplierShelf | null>(null)

  useEffect(() => {
    if (!open) {
      setEditingId(null)
      setInUse(null)
      setProductsFor(null)
    }
  }, [open])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    try {
      await createShelf({ name }).unwrap()
      setNewName('')
      toast.success(t('shelves.created'))
    } catch (err) {
      const apiErr = catalogError(err)
      toast.error(
        apiErr?.name === 'SHELF_NAME_TAKEN'
          ? t('shelves.nameTaken')
          : apiErr?.message || t('shelves.saveFailed')
      )
    }
  }

  const handleRename = async (shelf: SupplierShelf) => {
    const name = editName.trim()
    if (!name || name === shelf.name) {
      setEditingId(null)
      return
    }
    try {
      await updateShelf({ id: shelf.id, name }).unwrap()
      setEditingId(null)
    } catch (err) {
      const apiErr = catalogError(err)
      toast.error(
        apiErr?.name === 'SHELF_NAME_TAKEN'
          ? t('shelves.nameTaken')
          : apiErr?.message || t('shelves.saveFailed')
      )
    }
  }

  const move = async (index: number, delta: -1 | 1) => {
    const ids = shelves.map((s) => s.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      await reorderShelves({ shelfIds: ids }).unwrap()
    } catch (err) {
      toast.error(catalogError(err)?.message || t('shelves.saveFailed'))
    }
  }

  const handleArchive = async () => {
    const shelf = archiveTarget
    if (!shelf) return
    setArchiveTarget(null)
    setInUse(null)
    try {
      await archiveShelf(shelf.id).unwrap()
      toast.success(t('shelves.archived'))
    } catch (err) {
      const apiErr = catalogError(err)
      if (apiErr?.name === 'SHELF_IN_USE') {
        setInUse({
          shelfName: shelf.name,
          deals: apiErr.details?.deals ?? [],
          rules: apiErr.details?.rules ?? [],
        })
      } else {
        toast.error(apiErr?.message || t('shelves.archiveFailed'))
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {productsFor
              ? t('shelves.productsTitle', { name: productsFor.name })
              : t('shelves.title')}
          </DialogTitle>
          <DialogDescription>
            {productsFor ? t('shelves.productsDescription') : t('shelves.description')}
          </DialogDescription>
        </DialogHeader>

        {productsFor ? (
          <ShelfProductsPicker shelf={productsFor} onDone={() => setProductsFor(null)} />
        ) : (
          <div className="space-y-4">
            <form onSubmit={handleCreate} className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="new-shelf-name">{t('shelves.name')}</Label>
                <Input
                  id="new-shelf-name"
                  value={newName}
                  maxLength={60}
                  placeholder={t('shelves.namePlaceholder')}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={!newName.trim() || creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t('shelves.add')}
              </Button>
            </form>

            {inUse ? (
              <div
                role="alert"
                className="rounded-md border border-[var(--amber)] bg-[var(--amber-pale)] p-3 text-sm"
              >
                <p className="font-medium text-[var(--text)]">
                  {t('shelves.inUseTitle', { name: inUse.shelfName })}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-mid)]">
                  {t('shelves.inUseDescription')}
                </p>
                {inUse.deals.length > 0 ? (
                  <>
                    <p className="mt-2 text-xs font-semibold">{t('shelves.inUseDeals')}</p>
                    <ul className="list-disc ps-5 text-xs">
                      {inUse.deals.map((d) => (
                        <li key={d.id}>{d.name}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {inUse.rules.length > 0 ? (
                  <>
                    <p className="mt-2 text-xs font-semibold">{t('shelves.inUseRules')}</p>
                    <ul className="list-disc ps-5 text-xs">
                      {inUse.rules.map((r) => (
                        <li key={r.id}>{r.name}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}

            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : shelves.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t('shelves.empty')}</p>
            ) : (
              <ul className="divide-y rounded-md border border-[var(--app-border)]">
                {shelves.map((shelf, index) => {
                  const name = localizedName(shelf, i18n.language)
                  return (
                    <li
                      key={shelf.id}
                      data-testid={`shelf-row-${shelf.id}`}
                      className="flex items-center gap-2 px-3 py-2"
                    >
                      {editingId === shelf.id ? (
                        <form
                          className="flex flex-1 items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault()
                            void handleRename(shelf)
                          }}
                        >
                          <Input
                            autoFocus
                            aria-label={t('shelves.renameLabel', { name: shelf.name })}
                            value={editName}
                            maxLength={60}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8"
                          />
                          <Button
                            type="submit"
                            size="icon"
                            variant="ghost"
                            aria-label={t('shelves.saveName')}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t('form.cancel')}
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </form>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{name}</p>
                            <p className="text-xs tabular-nums text-[var(--text-muted)]">
                              {t('categories.productCount', { count: shelf.product_count })}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setProductsFor(shelf)}
                          >
                            {t('shelves.chooseProducts')}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t('shelves.moveUp', { name })}
                            disabled={index === 0 || reordering}
                            onClick={() => void move(index, -1)}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t('shelves.moveDown', { name })}
                            disabled={index === shelves.length - 1 || reordering}
                            onClick={() => void move(index, 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t('shelves.rename', { name })}
                            onClick={() => {
                              setEditingId(shelf.id)
                              setEditName(shelf.name)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t('shelves.archiveNamed', { name })}
                            disabled={archiving}
                            onClick={() => setArchiveTarget(shelf)}
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        <ConfirmDialog
          open={Boolean(archiveTarget)}
          onOpenChange={(o) => {
            if (!o) setArchiveTarget(null)
          }}
          title={t('shelves.archiveConfirmTitle', { name: archiveTarget?.name ?? '' })}
          description={t('shelves.archiveConfirmDescription')}
          confirmLabel={t('shelves.archive')}
          variant="destructive"
          loading={archiving}
          onConfirm={handleArchive}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Choose which products sit on a shelf. Saves the full membership (PUT replaces it). */
function ShelfProductsPicker({ shelf, onDone }: { shelf: SupplierShelf; onDone: () => void }) {
  const { t } = useTranslation('products')
  const { search, setSearch, debouncedSearch } = useDebouncedSearch('')
  const { data: memberData, isLoading: membersLoading } = useGetProductsQuery({
    shelfId: shelf.id,
    limit: 500,
  })
  const { data: searchData, isFetching } = useGetProductsQuery({
    q: debouncedSearch || undefined,
    limit: 50,
  })
  const [setShelfProducts, { isLoading: saving }] = useSetShelfProductsMutation()
  const [selected, setSelected] = useState<Set<string> | null>(null)

  const members = useMemo(() => (memberData?.products ?? []) as Product[], [memberData?.products])
  useEffect(() => {
    if (!membersLoading && selected === null) setSelected(new Set(members.map((p) => p.id)))
  }, [membersLoading, members, selected])

  const chosen = selected ?? new Set<string>()
  const candidates = useMemo(() => {
    const seen = new Set<string>()
    const list: Product[] = []
    // Current members first, then search results.
    for (const p of [...members, ...((searchData?.products ?? []) as Product[])]) {
      if (seen.has(p.id)) continue
      if (
        debouncedSearch &&
        !p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
        !p.sku?.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
        continue
      seen.add(p.id)
      list.push(p)
    }
    return list
  }, [members, searchData?.products, debouncedSearch])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev ?? [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = async () => {
    try {
      await setShelfProducts({ id: shelf.id, productIds: [...chosen] }).unwrap()
      toast.success(t('shelves.productsSaved'))
      onDone()
    } catch (err) {
      toast.error(catalogError(err)?.message || t('shelves.saveFailed'))
    }
  }

  return (
    <div className="space-y-3">
      <Input
        aria-label={t('shelves.searchProducts')}
        placeholder={t('shelves.searchProducts')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div
        className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-[var(--app-border)] p-2"
        aria-busy={isFetching}
      >
        {membersLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : candidates.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">{t('shelves.noProducts')}</p>
        ) : (
          candidates.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[var(--app-bg-subtle)]"
            >
              <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-xs text-[var(--text-muted)]">{p.sku}</span>
            </label>
          ))
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs tabular-nums text-[var(--text-muted)]">
          {t('shelves.selectedCount', { count: chosen.size })}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            {t('form.cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || selected === null}>
            {t('shelves.saveProducts')}
          </Button>
        </div>
      </div>
    </div>
  )
}
