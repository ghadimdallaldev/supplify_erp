import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  useGetWarehousesQuery,
  useGetTenantRoleUsersQuery,
  useSetStaffWarehouseAccessMutation,
} from '../services/api'
import { usePermissions } from '../hooks/usePermissions'
import { ensureNamespace } from '../i18n'
import type { WarehouseAccess } from '../types'
import { Button } from './ui/button'

export function WarehouseStaffAccess() {
  const { t } = useTranslation('suppliers')
  const { can } = usePermissions()
  const allowed = can('STAFF_MANAGE')
  const users = useGetTenantRoleUsersQuery(undefined, { skip: !allowed })
  const warehouses = useGetWarehousesQuery(undefined, { skip: !allowed || !can('WAREHOUSES_VIEW') })
  const [save, { isLoading }] = useSetStaffWarehouseAccessMutation()
  const [userId, setUserId] = useState('')
  const [access, setAccess] = useState<WarehouseAccess>({ mode: 'assigned', warehouseIds: [] })
  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])
  if (!allowed) return null
  const members = (users.data?.users ?? []).filter(
    (u: { role_id?: string; role_name?: string }) => u.role_id && u.role_name !== 'Owner'
  )
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label={t('warehouseAccess.title')}>
      <h3 className="font-semibold">{t('warehouseAccess.title')}</h3>
      <p className="text-sm text-muted-foreground">{t('warehouseAccess.description')}</p>
      <label className="block space-y-1">
        <span>{t('warehouseAccess.member')}</span>
        <select
          className="h-11 w-full rounded-md border bg-background px-3"
          value={userId}
          disabled={isLoading}
          onChange={(event) => {
            const id = event.target.value
            setUserId(id)
            setAccess(
              members.find((u: { id: string }) => u.id === id)?.warehouseAccess ?? {
                mode: 'assigned',
                warehouseIds: [],
              }
            )
          }}
        >
          <option value="">{t('warehouseAccess.chooseMember')}</option>
          {members.map((u: { id: string; display_name?: string; email: string }) => (
            <option key={u.id} value={u.id}>
              {u.display_name || u.email}
            </option>
          ))}
        </select>
      </label>
      {userId && (
        <>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              disabled={isLoading}
              checked={access.mode === 'all'}
              onChange={(event) =>
                setAccess({ mode: event.target.checked ? 'all' : 'assigned', warehouseIds: [] })
              }
            />
            {t('warehouseAccess.all')}
          </label>
          {access.mode === 'assigned' &&
            (warehouses.data?.warehouses ?? [])
              .filter((w: { is_active?: boolean }) => w.is_active !== false)
              .map((w: { id: string; name: string }) => (
                <label className="flex min-h-11 items-center gap-2" key={w.id}>
                  <input
                    type="checkbox"
                    disabled={isLoading}
                    checked={access.warehouseIds.includes(w.id)}
                    onChange={(event) =>
                      setAccess((current) => ({
                        mode: 'assigned',
                        warehouseIds: event.target.checked
                          ? [...current.warehouseIds, w.id]
                          : current.warehouseIds.filter((id) => id !== w.id),
                      }))
                    }
                  />
                  {w.name}
                </label>
              ))}
          <Button
            disabled={isLoading}
            onClick={async () => {
              try {
                await save({ userId, access }).unwrap()
                toast.success(t('warehouseAccess.saved'))
              } catch (error: unknown) {
                toast.error(
                  (error as { data?: { error?: { message?: string } } })?.data?.error?.message ??
                    t('warehouseAccess.failed')
                )
              }
            }}
          >
            {t('warehouseAccess.save')}
          </Button>
        </>
      )}
    </section>
  )
}
