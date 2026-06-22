import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiUrl } from '../../../lib/apiBase'
import type { OrderStatusDisplayInput } from '../../../lib/orderStatusDisplay'

export const VALID_ORDER_TABS = [
  'timeline',
  'details',
  'items',
  'invoice',
  'picking',
  'delivery',
  'packing',
] as const

export type OrderDetailTabKey = (typeof VALID_ORDER_TABS)[number]

export function formatAddressLines(address?: Record<string, string | undefined> | null): string[] {
  if (!address || typeof address !== 'object') return []
  const lines: string[] = []
  if (address.street) lines.push(address.street)
  const cityLine = [address.city, address.region, address.postalCode || address.zip]
    .filter(Boolean)
    .join(', ')
  if (cityLine) lines.push(cityLine)
  if (address.country) lines.push(address.country)
  return lines
}

export function formatOperatingHours(hours: unknown): string | null {
  if (!hours || typeof hours !== 'object') return null
  const entries = Object.entries(hours as Record<string, { open?: string; close?: string }>)
  if (!entries.length) return null
  return entries
    .map(([day, window]) => `${day}: ${window?.open ?? '—'} – ${window?.close ?? '—'}`)
    .join('; ')
}

export function getOrderStatusColor(status: string) {
  switch (status) {
    case 'PLACED':
      return 'default'
    case 'ACKNOWLEDGED':
      return 'secondary'
    case 'PROCESSING':
      return 'default'
    case 'SHIPPED':
      return 'default'
    case 'DELIVERED':
      return 'default'
    case 'COMPLETED':
      return 'default'
    case 'CANCELLED':
      return 'destructive'
    default:
      return 'secondary'
  }
}

export function OrderDetailTabLoading({ className = 'py-12' }: { className?: string }) {
  return (
    <div className={`flex justify-center text-[var(--text-muted)] ${className}`}>
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  )
}

export function resolveOrderStatusLabel(
  t: TFunction<'orders'>,
  order: OrderStatusDisplayInput,
  viewerRole: 'RESTAURANT' | 'SUPPLIER'
): string {
  if (order.status === 'RECEIVED_WITH_DISPUTE') {
    return t('status.RECEIVED_WITH_DISPUTE')
  }

  if (order.status !== 'CANCELLED') {
    return t(`status.${order.status}`, { defaultValue: order.status.replace(/_/g, ' ') })
  }

  if (order.cancelled_by === 'SUPPLIER') {
    return viewerRole === 'RESTAURANT'
      ? t('statusDisplay.declinedBySupplier')
      : t('statusDisplay.declined')
  }

  if (order.cancelled_by === 'RESTAURANT') {
    return viewerRole === 'SUPPLIER'
      ? t('statusDisplay.cancelledByRestaurant')
      : t('statusDisplay.cancelled')
  }

  return t('statusDisplay.cancelled')
}

export function resolveOrderCancellationBanner(
  t: TFunction<'orders'>,
  order: OrderStatusDisplayInput,
  viewerRole: 'RESTAURANT' | 'SUPPLIER'
): { title: string; reason?: string } | null {
  if (order.status !== 'CANCELLED') return null

  const reason = order.cancel_reason?.trim()
  if (order.cancelled_by === 'SUPPLIER' && viewerRole === 'RESTAURANT') {
    return {
      title: t('cancellationBanner.declinedBySupplier'),
      reason: reason || t('cancellationBanner.noReasonProvided'),
    }
  }

  if (order.cancelled_by === 'RESTAURANT' && viewerRole === 'SUPPLIER' && reason) {
    return {
      title: t('cancellationBanner.cancelledByRestaurant'),
      reason,
    }
  }

  if (reason && viewerRole === 'RESTAURANT' && order.cancelled_by !== 'SUPPLIER') {
    return { title: t('cancellationBanner.orderCancelled'), reason }
  }

  return null
}

export function usePackingSlipActions(orderId: string) {
  const { t } = useTranslation('orders')
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [printingPdf, setPrintingPdf] = useState(false)

  const fetchPackingSlipPdfBlob = async () => {
    if (!orderId) throw new Error('Missing order id')
    const res = await fetch(apiUrl(`/api/orders/${orderId}/packing-slip/pdf`), {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Failed to fetch packing slip PDF')
    return res.blob()
  }

  const handlePrintPackingSlip = async () => {
    if (!orderId || printingPdf) return
    setPrintingPdf(true)
    try {
      const blob = await fetchPackingSlipPdfBlob()
      const url = URL.createObjectURL(blob)
      const printWindow = window.open(url, '_blank')
      if (!printWindow) {
        URL.revokeObjectURL(url)
        toast.error(t('packingSlip.allowPopups'))
        return
      }
      printWindow.addEventListener('load', () => {
        printWindow.focus()
        printWindow.print()
      })
      toast.success(t('packingSlip.openingPrint'))
    } catch {
      toast.error(t('packingSlip.printFailed'))
    } finally {
      setPrintingPdf(false)
    }
  }

  const handleDownloadPackingSlipPdf = async () => {
    if (!orderId || downloadingPdf) return
    setDownloadingPdf(true)
    try {
      const blob = await fetchPackingSlipPdfBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `packing-slip-${orderId.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('packingSlip.downloadSuccess'))
    } catch {
      toast.error(t('packingSlip.downloadFailed'))
    } finally {
      setDownloadingPdf(false)
    }
  }

  return {
    downloadingPdf,
    printingPdf,
    handlePrintPackingSlip,
    handleDownloadPackingSlipPdf,
  }
}
