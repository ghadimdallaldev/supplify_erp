import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Package, Plus, Clock, ShoppingCart } from 'lucide-react'
import { formatPrice } from '../../utils/format'
import { parseDaysOfWeek } from '../../utils/parseDaysOfWeek'

export function QuickListDetailsDialog(props: any) {
  const { t, i18n } = useTranslation('cart')
  const {
    showListDetails,
    setShowListDetails,
    selectedListForDetails,
    selectedListDetails,
    catalogProducts,
    formatFrequency,
    formatNextExecution,
    handleAddProducts,
    handleOrderFromList,
  } = props
  const formatDaysLabel = (days: string[]) =>
    days.map((day) => t(`quickLists.days.${day}`, { defaultValue: day })).join(', ')
  const formatScheduleStatus = (status: string) =>
    status === 'ACTIVE'
      ? t('quickLists.statusActive')
      : status === 'PAUSED'
        ? t('quickLists.statusPaused')
        : status

  return (
    <Dialog open={showListDetails} onOpenChange={setShowListDetails}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{selectedListForDetails?.name}</DialogTitle>
          <DialogDescription>
            {selectedListForDetails?.description || t('quickLists.detailsDialog.description')}
          </DialogDescription>
        </DialogHeader>

        {selectedListDetails && (
          <div className="space-y-4">
            {/* Schedule Info */}
            {selectedListDetails.is_scheduled && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {t('quickLists.detailsDialog.scheduleTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-[var(--text-muted)]">
                      {t('quickLists.detailsDialog.status')}
                    </span>
                    <Badge
                      variant={selectedListDetails.status === 'ACTIVE' ? 'default' : 'secondary'}
                    >
                      {formatScheduleStatus(selectedListDetails.status)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-[var(--text-muted)]">
                      {t('quickLists.detailsDialog.frequency')}
                    </span>
                    <span className="text-sm font-medium">
                      {formatFrequency(
                        selectedListDetails.frequency,
                        selectedListDetails.days_of_week
                      )}
                    </span>
                  </div>
                  {(() => {
                    const detailDays = parseDaysOfWeek(selectedListDetails.days_of_week)
                    if (!detailDays.length) return null
                    return (
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">
                          {t('quickLists.detailsDialog.days')}
                        </span>
                        <span className="text-sm font-medium">{formatDaysLabel(detailDays)}</span>
                      </div>
                    )
                  })()}
                  {selectedListDetails.preferred_time && (
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--text-muted)]">
                        {t('quickLists.detailsDialog.preferredTime')}
                      </span>
                      <span className="text-sm font-medium">
                        {selectedListDetails.preferred_time.slice(0, 5)}
                      </span>
                    </div>
                  )}
                  {selectedListDetails.next_execution_date &&
                    formatNextExecution(selectedListDetails) && (
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">
                          {t('quickLists.detailsDialog.nextExecution')}
                        </span>
                        <span className="text-sm font-medium">
                          {formatNextExecution(selectedListDetails)}
                        </span>
                      </div>
                    )}
                  {selectedListDetails.last_execution_date && (
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--text-muted)]">
                        {t('quickLists.detailsDialog.lastExecution')}
                      </span>
                      <span className="text-sm font-medium">
                        {new Date(selectedListDetails.last_execution_date).toLocaleDateString(
                          i18n.language
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-sm text-[var(--text-muted)]">
                      {t('quickLists.detailsDialog.autoCreateOrder')}
                    </span>
                    <Badge
                      variant={selectedListDetails.auto_create_order ? 'default' : 'secondary'}
                    >
                      {selectedListDetails.auto_create_order
                        ? t('quickLists.detailsDialog.yes')
                        : t('quickLists.detailsDialog.no')}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Items List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  {t('quickLists.detailsDialog.itemsTitle', {
                    count: selectedListDetails.items?.length || 0,
                  })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedListDetails.items && selectedListDetails.items.length > 0 ? (
                  <div className="space-y-3">
                    {selectedListDetails.items.map((item: any, itemIndex: number) => {
                      const product = catalogProducts.find((p: any) => p.id === item.product_id)
                      return (
                        <div
                          key={`${selectedListForDetails?.id ?? 'list'}-${item.id ?? item.product_id}-${itemIndex}`}
                          className="flex items-center justify-between p-3 border rounded-md"
                        >
                          <div className="flex-1">
                            <p className="font-medium">
                              {product?.name || t('quickLists.detailsDialog.productNotFound')}
                            </p>
                            {product?.sku && (
                              <p className="text-sm text-[var(--text-muted)]">
                                {t('quickLists.detailsDialog.sku', { sku: product.sku })}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              {t('quickLists.detailsDialog.qty', { quantity: item.quantity })}
                            </p>
                            {product?.price && (
                              <p className="text-sm text-[var(--text-muted)]">
                                {formatPrice(Number(product.price) * item.quantity)}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[var(--text-muted)]">
                    <Package className="h-12 w-12 mx-auto mb-2 text-[var(--text-muted)]" />
                    <p>{t('quickLists.detailsDialog.noItems')}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        setShowListDetails(false)
                        handleAddProducts(selectedListForDetails.id)
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t('quickLists.detailsDialog.addItems')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowListDetails(false)}>
            {t('quickLists.detailsDialog.close')}
          </Button>
          {selectedListForDetails && (
            <Button
              onClick={() => {
                setShowListDetails(false)
                handleOrderFromList(selectedListForDetails.id)
              }}
              disabled={
                !selectedListDetails ||
                !selectedListDetails.items ||
                selectedListDetails.items.length === 0
              }
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              {t('quickLists.detailsDialog.orderNow')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
