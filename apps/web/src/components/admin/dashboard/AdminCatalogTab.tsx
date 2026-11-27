import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, X } from 'lucide-react'
import {
  useAddPlatformCategoryMutation,
  useApproveCategoryRequestMutation,
  useGetAdminCategoryRequestsQuery,
  useGetProductCategoriesQuery,
  useMergeCategoryRequestMutation,
  useRejectCategoryRequestMutation,
  useReorderPlatformCategoriesMutation,
  useUpdatePlatformCategoryMutation,
} from '../../../services/api'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Select, SelectTrigger } from '../../ui/select'
import { Badge } from '../../ui/badge'
import { Textarea } from '../../ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog'
import { CategoryIconBadge } from '../../marketplace/CategoryBrowse'
import { localizedName } from '../../../lib/categoryLabel'
import type {
  CategoryDepartment,
  CategoryNode,
  CategoryRequest,
  CategoryRequestStatus,
} from '../../../types'

type Action = { kind: 'approve' | 'merge' | 'reject'; request: CategoryRequest }

function apiMessage(e: unknown): string | undefined {
  return (e as { data?: { error?: { message?: string } } })?.data?.error?.message
}

export interface AdminCatalogTabProps {
  active: boolean
}

/**
 * Admin catalog: the supplier category-request queue (approve as a new category, merge into an
 * existing one, or reject) and the platform tree editor (add, rename, reorder categories).
 */
export function AdminCatalogTab({ active }: AdminCatalogTabProps) {
  const { t, i18n } = useTranslation('admin')
  const [status, setStatus] = useState<CategoryRequestStatus>('pending')
  const { data: requestsData, isLoading: requestsLoading } = useGetAdminCategoryRequestsQuery(
    { status },
    { skip: !active }
  )
  const { data: treeData, isLoading: treeLoading } = useGetProductCategoriesQuery(undefined, {
    skip: !active,
  })
  const departments = useMemo(
    () => (treeData?.departments ?? []) as CategoryDepartment[],
    [treeData?.departments]
  )
  const requests = (requestsData?.requests ?? []) as CategoryRequest[]
  const [action, setAction] = useState<Action | null>(null)

  return (
    <div className="space-y-8">
      <section aria-labelledby="admin-category-requests" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="admin-category-requests" className="text-lg font-semibold">
              {t('catalog.requests.title')}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">{t('catalog.requests.description')}</p>
          </div>
          <div className="w-44">
            <Label htmlFor="admin-request-status" className="sr-only">
              {t('catalog.requests.statusFilter')}
            </Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CategoryRequestStatus)}>
              <SelectTrigger id="admin-request-status">
                {(['pending', 'approved', 'merged', 'rejected'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`catalog.requests.status.${s}`)}
                  </option>
                ))}
              </SelectTrigger>
            </Select>
          </div>
        </div>

        {requestsLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : requests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--app-border)] p-6 text-center text-sm text-[var(--text-muted)]">
            {t('catalog.requests.empty')}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border border-[var(--app-border)]">
            {requests.map((request) => (
              <li
                key={request.id}
                data-testid={`category-request-${request.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {request.proposed_name}
                    {request.proposed_name_ar ? (
                      <span className="ms-2 text-sm text-[var(--text-muted)]" dir="rtl">
                        {request.proposed_name_ar}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {t('catalog.requests.meta', {
                      supplier: request.supplier_name ?? '—',
                      department:
                        request.proposed_parent_name ?? t('catalog.requests.noDepartment'),
                      count: request.product_count ?? 0,
                    })}
                  </p>
                  {request.status !== 'pending' && request.resolved_category_name ? (
                    <p className="text-xs text-[var(--text-mid)]">
                      {t('catalog.requests.resolvedTo', {
                        name: localizedName(
                          {
                            name: request.resolved_category_name,
                            name_ar: request.resolved_category_name_ar,
                          },
                          i18n.language
                        ),
                      })}
                    </p>
                  ) : null}
                </div>
                {request.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setAction({ kind: 'approve', request })}>
                      {t('catalog.requests.approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAction({ kind: 'merge', request })}
                    >
                      {t('catalog.requests.merge')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAction({ kind: 'reject', request })}
                    >
                      {t('catalog.requests.reject')}
                    </Button>
                  </div>
                ) : (
                  <Badge variant="secondary">
                    {t(`catalog.requests.status.${request.status}`)}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="admin-category-tree" className="space-y-3">
        <div>
          <h2 id="admin-category-tree" className="text-lg font-semibold">
            {t('catalog.tree.title')}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">{t('catalog.tree.description')}</p>
        </div>
        {treeLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {departments.map((dept) => (
              <DepartmentEditor key={dept.id} dept={dept} />
            ))}
          </div>
        )}
      </section>

      <RequestActionDialog
        action={action}
        departments={departments}
        onClose={() => setAction(null)}
      />
    </div>
  )
}

function RequestActionDialog({
  action,
  departments,
  onClose,
}: {
  action: Action | null
  departments: CategoryDepartment[]
  onClose: () => void
}) {
  // Remount per request so the fields start from that request's proposal.
  if (!action) return null
  return (
    <RequestActionForm
      key={`${action.kind}-${action.request.id}`}
      action={action}
      departments={departments}
      onClose={onClose}
    />
  )
}

function RequestActionForm({
  action,
  departments,
  onClose,
}: {
  action: Action
  departments: CategoryDepartment[]
  onClose: () => void
}) {
  const { t, i18n } = useTranslation('admin')
  const { request } = action
  const [parentId, setParentId] = useState(request.proposed_parent_id ?? departments[0]?.id ?? '')
  const [name, setName] = useState(request.proposed_name)
  const [nameAr, setNameAr] = useState(request.proposed_name_ar ?? '')
  const [iconKey, setIconKey] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [approve, { isLoading: approving }] = useApproveCategoryRequestMutation()
  const [merge, { isLoading: merging }] = useMergeCategoryRequestMutation()
  const [reject, { isLoading: rejecting }] = useRejectCategoryRequestMutation()
  const busy = approving || merging || rejecting

  const submit = async () => {
    try {
      if (action.kind === 'approve') {
        await approve({
          id: request.id,
          parentId,
          name: name.trim(),
          name_ar: nameAr.trim() || undefined,
          icon_key: iconKey.trim() || undefined,
        }).unwrap()
        toast.success(t('catalog.requests.approved'))
      } else if (action.kind === 'merge') {
        await merge({ id: request.id, categoryId }).unwrap()
        toast.success(t('catalog.requests.merged'))
      } else {
        await reject({ id: request.id, note: note.trim() || undefined }).unwrap()
        toast.success(t('catalog.requests.rejected'))
      }
      onClose()
    } catch (e) {
      toast.error(apiMessage(e) || t('catalog.requests.failed'))
    }
  }

  const canSubmit =
    action.kind === 'approve'
      ? Boolean(parentId && name.trim())
      : action.kind === 'merge'
        ? Boolean(categoryId)
        : true

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {t(`catalog.requests.${action.kind}Title`, { name: request.proposed_name })}
          </DialogTitle>
          <DialogDescription>
            {t(`catalog.requests.${action.kind}Description`, { count: request.product_count ?? 0 })}
          </DialogDescription>
        </DialogHeader>

        {action.kind === 'approve' ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="approve-parent">{t('catalog.requests.department')}</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger id="approve-parent">
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {localizedName(d, i18n.language)}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="approve-name">{t('catalog.requests.name')}</Label>
              <Input
                id="approve-name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="approve-name-ar">{t('catalog.requests.nameAr')}</Label>
              <Input
                id="approve-name-ar"
                dir="rtl"
                value={nameAr}
                maxLength={80}
                onChange={(e) => setNameAr(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="approve-icon">{t('catalog.requests.iconKey')}</Label>
              <div className="flex items-center gap-2">
                <CategoryIconBadge iconKey={iconKey || null} size="sm" />
                <Input
                  id="approve-icon"
                  value={iconKey}
                  placeholder="leaf"
                  onChange={(e) => setIconKey(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : action.kind === 'merge' ? (
          <div className="space-y-1.5">
            <Label htmlFor="merge-target">{t('catalog.requests.existingCategory')}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="merge-target">
                <option value="" disabled>
                  {t('catalog.requests.chooseCategory')}
                </option>
                {departments.map((d) => (
                  <optgroup key={d.id} label={localizedName(d, i18n.language)}>
                    {d.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {localizedName(c, i18n.language)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </SelectTrigger>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="reject-note">{t('catalog.requests.note')}</Label>
            <Textarea
              id="reject-note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('catalog.cancel')}
          </Button>
          <Button
            type="button"
            variant={action.kind === 'reject' ? 'destructive' : 'default'}
            onClick={() => void submit()}
            disabled={!canSubmit || busy}
          >
            {t(`catalog.requests.${action.kind}Confirm`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DepartmentEditor({ dept }: { dept: CategoryDepartment }) {
  const { t, i18n } = useTranslation('admin')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [addCategory, { isLoading: adding }] = useAddPlatformCategoryMutation()
  const [updateCategory] = useUpdatePlatformCategoryMutation()
  const [reorder, { isLoading: reordering }] = useReorderPlatformCategoriesMutation()
  const deptName = localizedName(dept, i18n.language)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    try {
      await addCategory({ parentId: dept.id, name }).unwrap()
      setNewName('')
    } catch (err) {
      toast.error(apiMessage(err) || t('catalog.tree.saveFailed'))
    }
  }

  const rename = async (leaf: CategoryNode) => {
    const name = editName.trim()
    setEditingId(null)
    if (!name || name === leaf.name) return
    try {
      await updateCategory({ id: leaf.id, name }).unwrap()
    } catch (err) {
      toast.error(apiMessage(err) || t('catalog.tree.saveFailed'))
    }
  }

  const move = async (index: number, delta: -1 | 1) => {
    const ids = dept.categories.map((c) => c.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      await reorder({ parentId: dept.id, ids }).unwrap()
    } catch (err) {
      toast.error(apiMessage(err) || t('catalog.tree.saveFailed'))
    }
  }

  return (
    <div
      data-testid={`admin-dept-${dept.id}`}
      className="rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <CategoryIconBadge iconKey={dept.icon_key} tintKey={dept.slug} size="sm" />
        <h3 className="flex-1 font-medium">{deptName}</h3>
        <span className="text-xs tabular-nums text-[var(--text-muted)]">{dept.product_count}</span>
      </div>
      <ul className="space-y-0.5">
        {dept.categories.map((leaf, index) => {
          const leafName = localizedName(leaf, i18n.language)
          return (
            <li
              key={leaf.id}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-[var(--app-bg-subtle)]"
            >
              {editingId === leaf.id ? (
                <form
                  className="flex flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void rename(leaf)
                  }}
                >
                  <Input
                    autoFocus
                    aria-label={t('catalog.tree.renameLabel', { name: leaf.name })}
                    className="h-7"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    aria-label={t('catalog.tree.save')}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t('catalog.cancel')}
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 truncate">{leafName}</span>
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">
                    {leaf.product_count}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={t('catalog.tree.moveUp', { name: leafName })}
                    disabled={index === 0 || reordering}
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={t('catalog.tree.moveDown', { name: leafName })}
                    disabled={index === dept.categories.length - 1 || reordering}
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={t('catalog.tree.rename', { name: leafName })}
                    onClick={() => {
                      setEditingId(leaf.id)
                      setEditName(leaf.name)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      <form onSubmit={add} className="mt-2 flex gap-2">
        <Input
          aria-label={t('catalog.tree.newCategoryIn', { name: deptName })}
          placeholder={t('catalog.tree.newCategoryPlaceholder')}
          className="h-8"
          value={newName}
          maxLength={80}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={!newName.trim() || adding}>
          {t('catalog.tree.add')}
        </Button>
      </form>
    </div>
  )
}
