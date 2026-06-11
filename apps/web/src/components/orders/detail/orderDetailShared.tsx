import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiUrl } from '../../../lib/apiBase'

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

export function usePackingSlipActions(orderId: string) {
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
        toast.error('Allow pop-ups to print the packing slip')
        return
      }
      printWindow.addEventListener('load', () => {
        printWindow.focus()
        printWindow.print()
      })
      toast.success('Opening packing slip for printing…')
    } catch {
      toast.error('Could not print packing slip')
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
      toast.success('Packing slip PDF downloaded')
    } catch {
      toast.error('Could not download packing slip PDF')
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
