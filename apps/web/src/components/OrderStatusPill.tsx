import { cn } from '../lib/utils'
import {
  Clock,
  CheckCircle,
  Package,
  Truck,
  FileText,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

const statusConfig: Record<string, { label: string; className: string; icon: LucideIcon }> = {
  PLACED: {
    label: 'Placed',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: Clock,
  },
  ACKNOWLEDGED: {
    label: 'Acknowledged',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: CheckCircle,
  },
  PROCESSING: {
    label: 'Processing',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: Package,
  },
  SHIPPED: {
    label: 'Shipped',
    className: 'bg-violet-100 text-violet-800 border-violet-200',
    icon: Truck,
  },
  DELIVERED: {
    label: 'Delivered',
    className: 'bg-green-100 text-green-800 border-green-200',
    icon: Truck,
  },
  RECEIVED_PARTIAL: {
    label: 'Received (Partial)',
    className: 'bg-sky-100 text-sky-800 border-sky-200',
    icon: CheckCircle,
  },
  RECEIVED_FULL: {
    label: 'Received (Full)',
    className: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle,
  },
  INVOICED: {
    label: 'Invoiced',
    className: 'bg-slate-100 text-slate-800 border-slate-200',
    icon: FileText,
  },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle,
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'bg-red-100 text-red-800 border-red-200',
    icon: XCircle,
  },
}

export function OrderStatusPill({
  status,
  className,
  showIcon = true,
}: {
  status: string
  className?: string
  showIcon?: boolean
}) {
  const config = statusConfig[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: Clock,
  }
  const Icon = config.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        config.className,
        className
      )}
    >
      {showIcon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {config.label}
    </span>
  )
}
