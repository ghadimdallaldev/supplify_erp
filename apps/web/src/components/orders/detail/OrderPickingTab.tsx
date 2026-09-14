import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useGetOrderQuery,
  useGetOrderWarehouseAssignmentsQuery,
  useGetWarehousesQuery,
  useReassignOrderWarehouseMutation,
} from '../../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { ClipboardList, Printer } from 'lucide-react'
import { OrderDetailTabLoading, usePackingSlipActions } from './orderDetailShared'
import { useImpersonation } from '../../../hooks/useImpersonation'
import { usePermissions } from '../../../hooks/usePermissions'
import { toast } from 'sonner'

export interface OrderPickingTabProps {
  orderId: string
}

export function OrderPickingTab({ orderId }: OrderPickingTabProps) {
  const { t } = useTranslation('orders')
  const { data, isLoading, refetch } = useGetOrderQuery(orderId)
  const { handlePrintPackingSlip } = usePackingSlipActions(orderId)
  const { isEffectiveSupplier } = useImpersonation()
  const { can } = usePermissions()
  const canTransfer = isEffectiveSupplier && can('FULFILLMENT_TRANSFER')
  const { data: assignmentData } = useGetOrderWarehouseAssignmentsQuery(orderId, {
    skip: !isEffectiveSupplier,
  })
  const { data: warehousesData } = useGetWarehousesQuery(undefined, {
    skip: !canTransfer,
  })
  const [reassignOrderWarehouse, { isLoading: isTransferring }] =
    useReassignOrderWarehouseMutation()
  const [targetWarehouseId, setTargetWarehouseId] = useState('')
  const [transferReason, setTransferReason] = useState('')

  const order = data?.order
  const assignments = (assignmentData?.assignments ||
    (order as any)?.warehouseAssignments ||
    []) as Array<{
    id: string
    order_item_id?: string | null
    warehouse_id?: string
    status?: string
    warehouse_name?: string
    warehouse_code?: string
  }>
  const orderLevelAssignment = assignments.find((a) => !a.order_item_id)

  useEffect(() => {
    if (orderLevelAssignment && !targetWarehouseId) {
      setTargetWarehouseId(orderLevelAssignment.warehouse_id || '')
    }
  }, [orderLevelAssignment, targetWarehouseId])

  if (isLoading || !data?.order) {
    return <OrderDetailTabLoading />
  }

  const submitTransfer = async () => {
    if (!orderLevelAssignment || !targetWarehouseId || transferReason.trim().length < 3) return
    try {
      await reassignOrderWarehouse({
        orderId,
        assignmentId: orderLevelAssignment.id,
        warehouseId: targetWarehouseId,
        reason: transferReason.trim(),
      }).unwrap()
      toast.success(
        t('pickingTab.transferSuccess', {
          defaultValue: 'Fulfillment location updated.',
        })
      )
      setTransferReason('')
      await refetch()
    } catch (error: any) {
      toast.error(
        error?.data?.error?.message ||
          t('pickingTab.transferFailed', { defaultValue: 'Could not update fulfillment location.' })
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {t('pickingTab.title')}
            </CardTitle>
            <CardDescription>{t('pickingTab.description')}</CardDescription>
          </div>
          <Button onClick={() => handlePrintPackingSlip()}>
            <Printer className="h-4 w-4 mr-2" />
            {t('pickingTab.printPickingList')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {canTransfer &&
          orderLevelAssignment &&
          ['pending', 'picking'].includes(orderLevelAssignment.status || '') && (
            <div className="mb-5 rounded-lg border border-[var(--app-border)] p-4 space-y-3">
              <div>
                <p className="font-semibold">
                  {t('pickingTab.transferTitle', { defaultValue: 'Transfer fulfillment' })}
                </p>
                <p className="text-sm text-[var(--text-muted)]">
                  {t('pickingTab.transferDescription', {
                    defaultValue:
                      'Move this complete order only when the destination warehouse can honor its committed stock and delivery terms.',
                  })}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="transfer-warehouse">
                    {t('pickingTab.destinationWarehouse', {
                      defaultValue: 'Destination warehouse',
                    })}
                  </Label>
                  <select
                    id="transfer-warehouse"
                    className="w-full rounded-md border border-[var(--app-border)] bg-background px-3 py-2 text-sm"
                    value={targetWarehouseId}
                    onChange={(event) => setTargetWarehouseId(event.target.value)}
                  >
                    <option value="">
                      {t('pickingTab.chooseWarehouse', { defaultValue: 'Choose a warehouse' })}
                    </option>
                    {(warehousesData?.warehouses || []).map((warehouse: any) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name || warehouse.code || warehouse.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer-reason">
                    {t('pickingTab.transferReason', { defaultValue: 'Reason' })}
                  </Label>
                  <Input
                    id="transfer-reason"
                    value={transferReason}
                    onChange={(event) => setTransferReason(event.target.value)}
                    placeholder={t('pickingTab.transferReasonPlaceholder', {
                      defaultValue: 'e.g. temporary stock outage',
                    })}
                    maxLength={500}
                  />
                </div>
              </div>
              <Button
                onClick={() => void submitTransfer()}
                disabled={
                  isTransferring ||
                  !targetWarehouseId ||
                  targetWarehouseId === orderLevelAssignment.warehouse_id ||
                  transferReason.trim().length < 3
                }
              >
                {isTransferring
                  ? t('pickingTab.transferring', { defaultValue: 'Updating…' })
                  : t('pickingTab.transfer', { defaultValue: 'Transfer fulfillment' })}
              </Button>
            </div>
          )}
        <div className="space-y-4">
          {order.items?.map((item: any, idx: number) => {
            const itemAssignment =
              assignments.find((a) => a.order_item_id === item.id) || orderLevelAssignment
            const warehouseLabel =
              itemAssignment?.warehouse_name ||
              itemAssignment?.warehouse_code ||
              item.location_code ||
              t('pickingTab.notAssigned')
            return (
              <div key={item.id || idx} className="border rounded-lg p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-muted)]">
                      {t('pickingTab.product')}
                    </p>
                    <p className="font-semibold">{item.product_name}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {t('pickingTab.sku', { sku: item.product_sku })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-muted)]">
                      {t('pickingTab.quantity')}
                    </p>
                    <p className="text-lg font-bold">{item.quantity}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-muted)]">
                      {t('pickingTab.warehouseLocation')}
                    </p>
                    <p className="font-medium">{warehouseLabel}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-muted)]">
                      {t('pickingTab.lotExpiry')}
                    </p>
                    <p className="text-sm">—</p>
                  </div>
                </div>
                {item.picking_notes && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm font-medium text-[var(--text-muted)]">
                      {t('pickingTab.pickingNotes')}
                    </p>
                    <p className="text-sm">{item.picking_notes}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
