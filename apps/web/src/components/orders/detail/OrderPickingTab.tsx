import { useTranslation } from 'react-i18next'
import { useGetOrderQuery } from '../../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { ClipboardList, Printer } from 'lucide-react'
import { OrderDetailTabLoading, usePackingSlipActions } from './orderDetailShared'

export interface OrderPickingTabProps {
  orderId: string
}

export function OrderPickingTab({ orderId }: OrderPickingTabProps) {
  const { t } = useTranslation('orders')
  const { data, isLoading } = useGetOrderQuery(orderId)
  const { handlePrintPackingSlip } = usePackingSlipActions(orderId)

  if (isLoading || !data?.order) {
    return <OrderDetailTabLoading />
  }

  const order = data.order

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
        <div className="space-y-4">
          {order.items?.map((item: any, idx: number) => (
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
                  <p className="font-medium">{item.location_code || t('pickingTab.notAssigned')}</p>
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
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
