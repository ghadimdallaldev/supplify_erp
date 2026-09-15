import { useState } from 'react'
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

function TransferPanel({
  orderId,
  assignment,
  warehouses,
  onComplete,
}: {
  orderId: string
  assignment: any
  warehouses: any[]
  onComplete: () => void
}) {
  const { t } = useTranslation('orders')
  const [targetWarehouseId, setTargetWarehouseId] = useState(assignment.warehouse_id || '')
  const [transferReason, setTransferReason] = useState('')
  const [reassign, { isLoading }] = useReassignOrderWarehouseMutation()

  const submit = async () => {
    if (
      !targetWarehouseId ||
      targetWarehouseId === assignment.warehouse_id ||
      transferReason.trim().length < 3
    )
      return
    try {
      await reassign({
        orderId,
        assignmentId: assignment.id,
        warehouseId: targetWarehouseId,
        reason: transferReason.trim(),
      }).unwrap()
      toast.success(
        t('pickingTab.transferSuccess', { defaultValue: 'Fulfillment location updated.' })
      )
      setTransferReason('')
      onComplete()
    } catch (error: any) {
      toast.error(
        error?.data?.error?.message ||
          t('pickingTab.transferFailed', { defaultValue: 'Could not update fulfillment location.' })
      )
    }
  }

  return (
    <div className="rounded-lg border border-[var(--app-border)] p-4 space-y-3">
      <div>
        <p className="font-semibold">
          {assignment.order_item_id ? 'Item fulfillment leg' : 'Order fulfillment leg'}
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          Transfer only this warehouse leg. Other supplier or warehouse lines remain unchanged.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`transfer-warehouse-${assignment.id}`}>
            {t('pickingTab.destinationWarehouse', { defaultValue: 'Destination warehouse' })}
          </Label>
          <select
            id={`transfer-warehouse-${assignment.id}`}
            className="w-full rounded-md border border-[var(--app-border)] bg-background px-3 py-2 text-sm"
            value={targetWarehouseId}
            onChange={(event) => setTargetWarehouseId(event.target.value)}
          >
            <option value="">
              {t('pickingTab.chooseWarehouse', { defaultValue: 'Choose a warehouse' })}
            </option>
            {warehouses.map((warehouse: any) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name || warehouse.code || warehouse.id}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`transfer-reason-${assignment.id}`}>
            {t('pickingTab.transferReason', { defaultValue: 'Reason' })}
          </Label>
          <Input
            id={`transfer-reason-${assignment.id}`}
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
        onClick={() => void submit()}
        disabled={
          isLoading ||
          !targetWarehouseId ||
          targetWarehouseId === assignment.warehouse_id ||
          transferReason.trim().length < 3
        }
      >
        {isLoading
          ? t('pickingTab.transferring', { defaultValue: 'Updating…' })
          : t('pickingTab.transfer', { defaultValue: 'Transfer fulfillment leg' })}
      </Button>
    </div>
  )
}

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
  const { data: warehousesData } = useGetWarehousesQuery(undefined, { skip: !canTransfer })

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

  if (isLoading || !data?.order) return <OrderDetailTabLoading />

  const transferableAssignments = assignments.filter((assignment) =>
    ['pending', 'picking'].includes(assignment.status || '')
  )

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
        {canTransfer && transferableAssignments.length > 0 && (
          <div className="mb-5 space-y-3">
            {transferableAssignments.map((assignment) => (
              <TransferPanel
                key={assignment.id}
                orderId={orderId}
                assignment={assignment}
                warehouses={warehousesData?.warehouses || []}
                onComplete={() => void refetch()}
              />
            ))}
          </div>
        )}
        <div className="space-y-4">
          {order.items?.map((item: any, idx: number) => {
            const itemAssignment =
              assignments.find((assignment) => assignment.order_item_id === item.id) ||
              assignments.find((assignment) => !assignment.order_item_id)
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
