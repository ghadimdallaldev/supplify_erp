import { useGetOrderQuery } from '../../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Package, Printer, Download } from 'lucide-react'
import {
  OrderDetailTabLoading,
  formatAddressLines,
  usePackingSlipActions,
} from './orderDetailShared'
import { formatPrice } from '../../../utils/format'

export interface OrderPackingTabProps {
  orderId: string
}

export function OrderPackingTab({ orderId }: OrderPackingTabProps) {
  const { data, isLoading } = useGetOrderQuery(orderId)
  const { downloadingPdf, printingPdf, handlePrintPackingSlip, handleDownloadPackingSlipPdf } =
    usePackingSlipActions(orderId)

  if (isLoading || !data?.order) {
    return <OrderDetailTabLoading />
  }

  const order = data.order
  const deliveryAddress = (order as any).branch_address ?? (order as any).restaurant_address
  const addressLines = formatAddressLines(deliveryAddress)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Packing Slip
            </CardTitle>
            <CardDescription>Print-ready packing slip for shipping</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handlePrintPackingSlip()} disabled={printingPdf}>
              <Printer className="h-4 w-4 mr-2" />
              {printingPdf ? 'Preparing…' : 'Print'}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadPackingSlipPdf}
              disabled={downloadingPdf}
            >
              <Download className="h-4 w-4 mr-2" />
              {downloadingPdf ? 'Downloading...' : 'Download PDF'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border-2 border-dashed border-[var(--app-border-mid)] rounded-lg p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <h2 className="text-2xl font-bold">PACKING SLIP</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Order #{order.id.slice(-8).toUpperCase()}
            </p>
          </div>

          {/* Ship To */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <p className="text-sm font-bold text-[var(--text-muted)] mb-2">SHIP TO:</p>
              <p className="font-semibold">{order.restaurant_name}</p>
              {addressLines.length > 0 ? (
                addressLines.map((line) => (
                  <p key={line} className="text-sm">
                    {line}
                  </p>
                ))
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No delivery address on file</p>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text-muted)] mb-2">ORDER DETAILS:</p>
              <p className="text-sm">
                Order Date: {new Date(order.created_at).toLocaleDateString()}
              </p>
              <p className="text-sm">Status: {order.status}</p>
              <p className="text-sm">Items: {order.items?.length || 0}</p>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-[var(--app-border-mid)]">
                  <th className="text-left py-2 px-3 text-sm font-bold">Item</th>
                  <th className="text-left py-2 px-3 text-sm font-bold">SKU</th>
                  <th className="text-right py-2 px-3 text-sm font-bold">Qty</th>
                  <th className="text-right py-2 px-3 text-sm font-bold">Unit Price</th>
                  <th className="text-right py-2 px-3 text-sm font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item: any, idx: number) => (
                  <tr key={item.id || idx} className="border-b">
                    <td className="py-3 px-3 text-sm">{item.product_name}</td>
                    <td className="py-3 px-3 text-sm text-[var(--text-muted)]">
                      {item.product_sku}
                    </td>
                    <td className="py-3 px-3 text-sm text-right">{item.quantity}</td>
                    <td className="py-3 px-3 text-sm text-right">
                      ${formatPrice(item.unit_price)}
                    </td>
                    <td className="py-3 px-3 text-sm text-right font-medium">
                      ${formatPrice(item.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="border-t-2 pt-4 flex justify-between">
            <div>
              <p className="text-sm text-[var(--text-muted)]">Thank you for your business!</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg">Total: ${formatPrice(order.total_amount)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
